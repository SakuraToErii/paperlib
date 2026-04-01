# Phase 1 实现审计报告

生成时间：2026-04-01
审计范围：只读审计，未修改源代码。
重点文件：
- app/service/services/paper-service.ts
- app/service/services/file-service.ts
- app/service/services/categorizer-service.ts
- app/service/services/sync-service.ts
- app/base/folder.ts
- app/service/repositories/db-repository/paper-entity-repository.ts
- app/service/repositories/db-repository/categorizer-repository.ts
- app/service/services/database/migration.ts
- app/base/filter.ts
- app/renderer/services/querysentence-service.ts
- app/renderer/utils/paper-graph.ts
- app/service/services/browser-extension-service.ts

审计目标理解（Phase 1 合同）
- Folder 语义应从“平面名称/手工树”转向“规范化路径 + 派生树”。
- Paper 仅应持有其叶子 folder 语义，查询和统计应支持前缀匹配。
- 本地文件库应作为 folder 的事实来源；重命名/删除 folder 应优先反映到文件系统，再回写数据库。
- Renderer/调用方不应绕过 service 契约，继续依赖旧的平面 folder 语义。
- 迁移应避免把新的层级路径再次降级成旧格式。

一、已符合

1. 已建立统一的 folder path 基础工具
- app/base/folder.ts 已提供 normalizeFolderPath、getParentFolderPath、joinFolderPath、isFolderPathInside、getFolderPrefixQuery、getFolderPathFromRelativeFile 等工具。
- getFolderPrefixQuery 已统一生成 ANY folders.name == "x" OR BEGINSWITH "x/" 的查询语义，符合层级路径前缀匹配目标。

2. FileService 已具备本地文件夹管理能力
- file-service.ts 已实现 createFolder、renameFolder、deleteEmptyFolder、listLibraryFolders。
- listLibraryFolders 会递归扫描库目录，并跳过 .realm.management 等内部路径，符合“文件系统为事实来源”的 Phase 1 方向。
- remapManagedFileURL、getManagedRelativePath、getLeafFolderFromEntityFiles 已提供文件路径到 folder path 的映射能力。

3. CategorizerService 已实现“从文件库重建文件夹树”
- categorizer-service.ts 的 syncFoldersWithLibrary 会：
  - 扫描文件系统目录；
  - 合并论文文件实际所在叶子目录；
  - 按层级重建 Folders 根下的 children 树；
  - 回写每篇 paper 的 folders 为单个叶子 folder；
  - 重新计算每个 folder 的聚合 count；
  - 删除陈旧 folder 节点。
- 这已经非常接近 Phase 1 的核心 contract。

4. Folder 的创建/重命名/删除主流程基本走 service 契约
- categorizer-service.ts 对 PaperFolder 的 update/delete 已不再直接依赖 repository 的旧树维护逻辑，而是优先操作文件系统，再调用 syncFoldersWithLibrary 回建数据库树。
- rename 时还会同步更新 pluginLinkedFolder 偏好设置。

5. 论文更新后会在 folder 语义变化时触发重建
- paper-service.ts 中 entityHasFolderSemanticChanges 会检查：
  - 是否分配了多个 folder；
  - folder 名是否包含“/”。
- 若命中，update() 会调用 categorizerService.syncFoldersWithLibrary()。
- 这体现了“folder tree 为派生物，不靠 repository 增量维护”的新思路。

6. 查询和部分 renderer 已采用层级 folder 语义
- app/renderer/services/querysentence-service.ts 对 folder 查询使用 getFolderPrefixQuery(obj.name)。
- app/renderer/utils/paper-graph.ts 使用 normalizeFolderPath，并以最长路径作为 canonical folder path。
- 这些调用方没有明显绕过新的路径语义。

二、部分符合

1. PaperService 仍允许旧输入形态进入，但会在后续重建中被纠偏
- paper-service.ts 的 updateWithCategorizer/createIntoCategorizer 仍直接写入 paperEntityDraft.folders = [new PaperFolder(categorizer)]。
- 若 categorizer.name 已是完整路径，则结果可接受；但 service 层没有显式声明“只能写叶子路径、且只能一个”。
- 当前依赖 syncFoldersWithLibrary 在后处理中纠偏，而不是在写入边界上强约束。

2. PaperEntityRepository 仍保留旧式 folder 持久化能力
- paper-entity-repository.ts 在 update() 中仍会：
  - 逐个将 paperEntity.folders 映射到 repository categorizer 对象；
  - 对 folder 调用 _categorizerRepository.update()；
  - 调用 updateCount()。
- 这说明 repository 仍可直接“创建/维护 folder 记录”，与 Phase 1 期望的“folder 树主要由 syncFoldersWithLibrary 派生”并不完全一致。
- 不过由于上层后续会 syncFoldersWithLibrary，实际状态多数情况下能回到正确形态，所以属于部分符合而非完全不符合。

3. Folder 计数逻辑新旧并存
- categorizer-service.ts 的 syncFoldersWithLibrary 使用 leafFolderByPaperId 重新计算 count，符合新模型。
- 但 categorizer-repository.ts 的 updateCount() 仍保留旧增量式统计逻辑，并基于 Realm 查询前缀匹配更新计数。
- 这会形成“双重来源”：一个是全量重建，一个是 repository 增量更新。虽然结果很多时候一致，但 contract 边界不够清晰。

4. 筛选器支持了层级匹配，但仍有未统一封装处
- app/base/filter.ts 中 PaperFilterOptions.folder 的查询直接内联了 ANY folders.name == ... OR BEGINSWITH ...，语义是对的。
- 但它没有复用 getFolderPrefixQuery()，导致规则散落两处；后续若转义或语义再调整，容易分叉。

5. 仅本地文件系统完整支持 Phase 1 folder contract
- categorizer-service.ts 明确限制了 PaperFolder 相关操作仅在 local backend 下可用。
- syncFoldersWithLibrary 在非本地存储时直接 return。
- 这说明 Phase 1 在 local backend 基本成立，但在 webdav 模式下 contract 并不完整。

三、不符合

1. SyncService 未覆盖 folder/tag 实体，和 Phase 1 service contract 不一致
严重级别：高
- sync-service.ts 的 SyncLog.entity_type 枚举包含 folder、tag、supplement、author。
- 但 invokeSync() 实际只处理 paper 与 feed；遇到其他 entity_type 会直接抛出 Unsupported entity type。
- 同时 categorizer-service.ts 的 folder create/update/delete 没有看到对应 addSyncLog 接入。
- 结果：Phase 1 若要求 folder 变更属于正式 service contract 的一部分，则同步链路明显未闭环。

2. migration 仍含“将 folder 名中的 / 替换为 -”的旧逻辑
严重级别：高
- app/service/services/database/migration.ts 在 migrate() 与 syncMigrate() 的 oldVersion <= 9 分支中，均存在：folder.name = folder.name.replaceAll("/", "-")。
- 这与新的层级路径语义直接冲突；如果旧库升级路径进入这些分支，会把层级信息不可逆降级。
- Phase 1 目标既然是路径层级化，这段迁移逻辑已经不再符合 contract。

3. repository 仍允许绕过文件系统直接创建 folder 记录
严重级别：高
- paper-entity-repository.ts 在 update() 时若传入 paperEntity.folders，且对应 folder 不存在，会调用 _categorizerRepository.update(...PaperFolder...) 创建数据库 folder。
- categorizer-repository.ts 本身也仍保留完整的 folder 树插入/重命名逻辑。
- 这意味着只要有调用者绕过 CategorizerService，仍可直接在 Realm 中制造 folder 节点，而不经过文件系统。
- 这与“文件系统为 folder 事实来源”的 Phase 1 边界相冲突。

4. PaperService.create 仍包含明显的 debug bypass
严重级别：高
- paper-service.ts 的 create() 注释掉真实 scrape 流程，改为构造测试标题、固定 year/booktitle/type 的 draft。
- 这不是 folder contract 本身的问题，但它意味着 Phase 1 的 paper create 路径并非真实业务实现，审计上应认定为未达合同质量要求。
- 若上层依赖 create() 作为正式入口，则当前实现不可视为合规。

5. PaperService.delete 后未显式触发 folder tree 重建
严重级别：中
- delete() 会删除 DB、文件与缓存，但没有调用 syncFoldersWithLibrary()。
- repository.delete() 虽会 updateCount()，但不会清理文件系统中因文件删除后变空的目录，也不会重建树。
- 若合同要求 folder tree 以文件系统和实际 leaf 使用情况保持收敛，则删除路径目前不完整。
- 尤其当删除导致某叶子目录不再有 paper 引用但目录仍存在时，树是否保留完全取决于磁盘目录是否被其他流程清理，而不是一个统一 contract。

6. FileService.move 的 folder 决策仍允许“多 folder 取最长路径”旧兼容逻辑
严重级别：中
- file-service.ts 的 getEntityFolderPath() 会从 paperEntity.folders 中取最长 name 作为实体 folder path。
- 这说明 service 仍接受“一个 paper 带多个 folders”的旧输入，并做容错挑选，而不是在边界直接拒绝非法状态。
- Phase 1 目标更像是“paper 只有一个 canonical leaf folder”；当前实现只是兼容，并非强约束。

7. SyncService 的 last-write-wins 合同未真正实现
严重级别：中
- sync-service.ts 注释写明“Merge using last write wins rule based on log_id”，但实际实现是：
  - 过滤本地不存在的 remote log_id；
  - 然后顺序执行 filteredLogs；
  - 没有针对同一实体的冲突归并，也没有基于 updated_at/timestamp 的实体级覆盖策略。
- 对 Phase 1 若包含同步一致性要求，这属于合同与实现不一致。

8. 筛选器和查询拼接仍有转义不统一问题
严重级别：中
- base/filter.ts 直接插入 folder 字符串到 Realm 查询，没有复用 escapeRealmString()/getFolderPrefixQuery()。
- querysentence-service.ts 使用 getFolderPrefixQuery()，较安全；但 filter.ts 与 repository.updateCount() 等处仍存在不同拼接方式。
- 带引号或特殊字符的 folder path 可能造成行为不一致。

四、开放问题

1. Phase 1 是否明确规定 paper.folders 在持久层必须永远只有一个叶子 folder？
- 当前实现目标显然偏向“单叶子 folder”，但 repository 与 file-service 仍保留多 folder 兼容逻辑。
- 若合同要求强约束，需要在 service/repository 边界明确拒绝多 folder 输入。

2. WebDAV 模式是否属于 Phase 1 覆盖范围？
- 当前所有 folder 文件系统契约几乎只对 local backend 生效。
- 如果 Phase 1 要求跨 backend 一致，则现状不达标；如果只要求 local backend，则需在文档中明确声明范围。

3. 删除 paper 后，空目录是否应该自动清理？
- 当前 delete() 删除文件但不清目录，也不做 folder tree 全量重建。
- 如果合同要求“folder tree 完全由磁盘目录 + 叶子论文导出”，就要决定空目录是否属于有效 folder。

4. 迁移策略是否允许丢弃旧版 folder 层级信息？
- 旧 migration 明确把“/”替换成“-”。
- 若 Phase 1 面向已有用户升级，这一行为需要被重新定义：保留路径、映射路径，还是只对极旧版本一次性容忍？

5. 同步合同是否包含 folder/tag 变更？
- schema 已声明支持，但实现未消费。
- 需要确认这是 Phase 1 延后项，还是当前缺口。

五、带严重级别的修复建议

[高] 1. 禁止旧迁移逻辑继续扁平化 folder path
- 位置：app/service/services/database/migration.ts
- 建议：移除或条件化处理 oldVersion <= 9 分支中的 folder.name.replaceAll("/", "-")。
- 原因：这是与 Phase 1 层级路径 contract 最直接的冲突点。

[高] 2. 收紧 folder 写入边界，禁止 repository 直接生成“脱离文件系统”的 folder
- 位置：paper-entity-repository.ts、categorizer-repository.ts
- 建议：
  - PaperEntityRepository.update() 对 folders 的处理改为仅接受已存在且规范化的叶子路径引用；
  - 对 PaperFolder 的创建/重命名/删除只允许经 CategorizerService；
  - repository 层减少 folder 树维护职责。
- 原因：否则任何调用者都可能绕过“文件系统为事实来源”的 contract。

[高] 3. 补全 folder/tag 的同步闭环，或明确从 SyncLog 合同中删除
- 位置：sync-service.ts、categorizer-service.ts
- 建议：二选一
  - 要么为 folder/tag create/update/delete 接入 addSyncLog，并在 invokeSync 中实现消费；
  - 要么缩减 SyncLog.entity_type 枚举，避免声明与实现不一致。
- 原因：当前属于公开合同与运行时行为矛盾。

[高] 4. 移除 PaperService.create 中的 debug bypass
- 位置：paper-service.ts
- 建议：恢复真实 scrape 流程，或显式将测试路径隔离到 dev-only 入口。
- 原因：正式入口返回伪造元数据，不符合生产合同。

[中] 5. 在 paper 删除后执行 folder 收敛流程
- 位置：paper-service.ts
- 建议：delete() 成功后至少在 local backend 下调用 syncFoldersWithLibrary()；必要时配合清理空目录策略。
- 原因：当前删除流程不会确保 folder tree 与磁盘/实体状态最终一致。

[中] 6. 将“单叶子 folder”提升为显式不变量
- 位置：paper-service.ts、file-service.ts、paper-entity-repository.ts
- 建议：
  - service 入参校验时拒绝多个 folder；
  - 统一只持久化一个 canonical leaf folder；
  - 移除 getEntityFolderPath() 里“取最长路径”的兜底语义，改为告警或异常。
- 原因：当前只是兼容旧状态，不是合同化实现。

[中] 7. 统一 folder 查询构造
- 位置：app/base/filter.ts 等
- 建议：所有 folder 前缀查询统一复用 getFolderPrefixQuery() 与 escapeRealmString()。
- 原因：避免 renderer/service/repository 间出现转义与语义分叉。

[中] 8. 明确 sync 的冲突解决语义
- 位置：sync-service.ts
- 建议：若合同要求 last-write-wins，应按实体主键聚合并比较 updated_at/timestamp，而不是只按 log_id 去重。
- 原因：当前注释与实现不一致，后续容易产生误判。

[低] 9. 文档化 local-only 限制
- 位置：建议新增 Phase 1 设计说明或开发文档
- 建议：明确说明当前 folder contract 仅对 local file storage backend 生效。
- 原因：现状可接受，但需要避免对 WebDAV 行为产生错误预期。

结论
- 当前仓库已经具备 Phase 1 的核心骨架：规范化路径工具、基于文件库的 folder 扫描与重建、层级前缀查询、folder 重命名联动文件路径回写。
- 但实现尚未完全“收口”为单一 contract，仍保留多处旧模型兼容层，尤其是 migration 扁平化、repository 可绕过文件系统、sync 合同未闭环、paper create debug bypass。
- 如果以“本地文件系统下的 folder 分层与派生树”作为 Phase 1 最小目标，可评估为“部分完成，接近可用”；如果以“全链路 contract 收敛、无旧语义回流”为标准，则目前仍不能判定为完全完成。
