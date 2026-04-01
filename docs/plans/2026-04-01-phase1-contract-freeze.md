# Phase 1 合同文档：Folder / Relation / Sync 语义冻结

日期：2026-04-01
状态：Phase 1 Contract Freeze
适用范围：当前仓库 `paperlib` fork 的现状实现
目标：冻结 Phase 1 已落地语义，作为后续实现、回归测试、兼容性判断与评审基准

## 1. 文档目的

本文档不是愿景设计稿，而是“合同文档”。
它用于明确当前 fork 中，以下能力在 Phase 1 的唯一有效语义：

1. 文件夹（folder）规范语义
2. 论文 relation API 的语义与不变量
3. relation 变更的 sync-log / replay 语义
4. migration / backward-compat 边界
5. local 与 non-local（尤其 WebDAV / 非本地文件后端）行为边界

除非未来显式发布 Phase 2/3 合同，否则本文件中的语义应视为：

- 代码评审基准
- 回归测试基准
- 数据兼容性基准
- 用户行为预期基准

本文件刻意以当前代码为准，不以理想模型为准。

## 2. 代码锚点

本合同基于下列当前实现文件：

- `app/base/folder.ts`
- `app/models/entity.ts`
- `app/models/categorizer.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/sync-service.ts`
- `app/service/services/database/core.ts`
- `app/service/services/database/migration.ts`
- `app/renderer/services/querysentence-service.ts`

若本文与未来代码不一致，以本文为“应然”，以代码为“待修正对象”；但本文写作时，内容已尽量贴合当前实现。

## 3. 术语

### 3.1 library folder

指用户首选项 `appLibFolder` 对应的本地库根目录。

### 3.2 relative folder path

指相对于 `appLibFolder` 的规范化路径，不含绝对路径前缀，使用 `/` 作为分隔符。

示例：

- `ML`
- `ML/Graph`
- `Reading/2026`

### 3.3 folder root

数据库中的逻辑根节点 `Folders`，类型为 `PaperFolder`，仅作为树根，不代表磁盘上的真实目录。

### 3.4 leaf folder

一篇论文最终绑定的、最具体的那个规范文件夹路径。Phase 1 中，一篇论文在规范语义上最多只允许有一个 leaf folder。

### 3.5 managed file

位于 `appLibFolder` 内、由 Paperlib 管理路径的文件。论文 folder 语义最终由 managed file 所在位置推导或对齐。

### 3.6 local filesystem mode

`FileService.usesLocalFileSystem()` 返回 true 的模式。当前等价于首选项 `syncFileStorage == "local"`。

### 3.7 non-local mode

当前主要指 `syncFileStorage == "webdav"`，以及所有不满足 local filesystem mode 的情形。

## 4. Folder 规范语义

## 4.1 路径规范化规则

由 `app/base/folder.ts` 冻结：

1. 空值、未定义值规范化为 `""`
2. 反斜杠 `\` 一律转为 `/`
3. 按 `/` 分段后，每段执行 trim
4. 空段与 `.` 段被移除
5. 最终用 `/` 重新拼接
6. 不保留前导或尾随 `/`

因此以下输入应视为同一路径：

- `A/B`
- `/A/B/`
- `A//B`
- `A\B`
- ` A / B `

规范结果均为：`A/B`

## 4.2 保留名称与非法段

`isValidFolderNameSegment()` 冻结以下约束：

一个“文件夹名称段”必须：

- 非空
- 不包含 `/`
- 不等于 `Tags`
- 不等于 `Folders`

因此：

- 用户在 sidebar 中创建/重命名 folder 时，输入的是“段名”，不是完整路径
- `Tags` 与 `Folders` 永远是保留逻辑根名，不得作为普通 folder 名称段

## 4.3 Folder 的规范存储形式

Phase 1 中，数据库里的 `PaperFolder.name` 对于真实文件夹节点，必须存储为规范 relative folder path。

例如：

- 顶层目录：`ML`
- 子目录：`ML/Graph`
- 更深层：`ML/Graph/Temporal`

注意：

- `Folders` 是唯一例外，它是逻辑根，不是相对路径
- 不允许把 `appLibFolder` 的绝对路径写入 `PaperFolder.name`
- 不允许用 `-`、OS 原生分隔符或展示文本替代规范路径

## 4.4 Folder 树与真实文件系统的主从关系

Phase 1 明确规定：

在 local filesystem mode 下，`appLibFolder` 下的真实目录结构是 `PaperFolder` 拓扑的 source of truth。

含义：

1. `PaperFolder` 不是独立真相源，而是磁盘目录树的镜像
2. `CategorizerService.syncFoldersWithLibrary()` 有权重建 folder 树
3. 若数据库 folder 树与磁盘不一致，以磁盘扫描结果为准
4. root 节点 `Folders` 始终保留，但其 children 由镜像过程决定

## 4.5 Folder 树重建规则

根据 `CategorizerService.syncFoldersWithLibrary()`：

1. 先确保 root `Folders` 存在
2. 扫描本地库目录，得到所有真实目录路径
3. 同时遍历全部 `Entity`，从 managed file 路径中额外推导 leaf folder
4. 将“磁盘目录集合 + 从论文文件推导出的 leaf folder 集合”合并为期望目录集合
5. 按深度从浅到深重建树结构
6. 对于不再需要的旧 folder 节点，直接删除

这意味着：

- folder 结构允许被“全量重算”
- 不能依赖 `PaperFolder` 对象 identity 维持稳定语义
- 应依赖 `PaperFolder.name` 的规范路径来判断语义身份

## 4.6 论文与 folder 的绑定语义

Phase 1 规定：

一篇 main library 论文在规范语义上最多绑定一个 leaf folder；数据库中的 `Entity.folders` 应被视为“单叶节点集合”，而不是多选群组集合。

当前实现依据：

- `PaperService` 中 `entityHasFolderSemanticChanges()` 将“多 folder”视为语义异常/变化来源
- `CategorizerService.syncFoldersWithLibrary()` 会把每篇论文的 `paperEntity.folders` 重置为：
  - `[leafFolder]`，若能推导到 leaf folder
  - `[]`，若不能推导

因此在 Phase 1：

1. 多 folder 绑定不是受支持的稳定语义
2. folder 不是 tag 式多归类系统
3. 若外部更新写入多个 folder，后续 sync/rebuild 可将其收敛为单一 leaf folder 或空

## 4.7 文件位置与 folder 语义的优先级

在 local filesystem mode 下，论文的 managed file 物理位置高于手工写入的 `Entity.folders`。

即：

- 文件实际在 `A/B/` 下，最终论文 folder 语义应收敛到 `A/B`
- 仅修改数据库 `folders` 而不移动文件，不构成稳定最终态
- folder 语义最终由 `syncFoldersWithLibrary()` 对齐

## 4.8 Folder 查询语义

renderer 侧 `querysentence-service.ts` 通过 `getFolderPrefixQuery()` 冻结 folder 选择行为：

选中 folder `X` 时，查询语义为：

- `ANY folders.name == "X"`
- 或 `ANY folders.name BEGINSWITH "X/"`

即 folder 查询天然递归，包含自身及所有后代。

这与 tag 明确不同；tag 没有在本 Phase 中被赋予同样的前缀递归含义。

## 4.9 Folder count 语义

`PaperFolder.count` 在 Phase 1 为递归计数：

某 folder 的 count 等于所有 leaf folder 位于其自身或其后代路径下的论文数量总和。

因此：

- 父目录 count 包含其整个子树
- 非叶节点 count 不是“直接子项数量”
- 该值属于派生值，可重建，不应视为手工维护真相源

## 4.10 内部路径过滤

`isInternalLibraryPath()` 冻结了以下目录/文件不会进入 folder 语义：

内部目录名：

- `.realm.management`
- `cache.realm.management`

内部文件后缀：

- `.realm`
- `.realm.lock`
- `.realm.note`
- `.realm.management`
- `.realm.log`

因此 Realm 数据文件及其管理产物不应被误识别为 library folder。

## 4.11 pluginLinkedFolder 语义

`pluginLinkedFolder` 是一个以规范 relative folder path 表示的偏好项。

在 local filesystem mode 下：

- folder rename / move 时若命中该路径或其子路径，必须随之重映射
- folder delete 时若命中该路径，应清空或相应更新

Phase 1 不允许 `pluginLinkedFolder` 指向绝对路径或非规范路径作为稳定语义。

## 5. Relation API 语义与不变量

## 5.1 存储模型

`Entity.relatedPaperIds` 是论文 relation 的唯一持久化字段。

其 schema 为：

- Realm `list<objectId>`
- TypeScript 语义为 `OID[]`

Phase 1 中 relation 是“无向关系的对称存储”，不是独立 relation 表，也不是带属性边。

## 5.2 规范化规则

`PaperEntityRepository.makeSureProperties()` 与 `PaperService.setRelatedPaperIds()` 共同冻结以下规则：

1. relation ID 必须被规范化为 `ObjectId`
2. relation 集合必须去重
3. 不允许自关联（self relation）
4. 缺失值应视为空数组

因此：

- `relatedPaperIds` 中不应出现重复值
- `paperId` 不应出现在自己的 `relatedPaperIds` 中

## 5.3 核心 API

Phase 1 当前真正冻结并实现的核心 relation 写接口是：

- `PaperService.setRelatedPaperIds(paperId, relatedIds, fromSync = false)`

其他计划中的增量 API（如 add/remove/multi-select helper）不属于当前已冻结实现合同，除非未来代码补齐并更新合同。

## 5.4 setRelatedPaperIds 的语义

调用 `setRelatedPaperIds(paperId, relatedIds)` 时：

1. 将 `relatedIds` 规范化
   - 转字符串去重
   - 过滤掉 `paperId` 自身
2. 找到目标论文 `paperId`
   - 若目标不存在，抛错
3. 将目标论文的 `relatedPaperIds` 直接替换为规范化后的结果
4. 对每个新 relation 对端论文：
   - 若存在，则把 `paperId` 加入其 `relatedPaperIds`
   - 若不存在，则跳过，不报错
5. 对每个此前存在、但此次被移除的 relation 对端论文：
   - 若存在，则从其 `relatedPaperIds` 中移除 `paperId`
   - 若不存在，则跳过

因此它是“集合替换语义”，不是“增量 patch 语义”。

## 5.5 Relation 对称性不变量

Phase 1 的最核心不变量：

若论文 A 的 `relatedPaperIds` 包含 B，则在稳定收敛态下，论文 B 的 `relatedPaperIds` 也必须包含 A。

允许的瞬时例外只有：

- 事务执行中间态
- 远端 replay 尚未处理完成前的短暂状态
- 数据库内遗留脏数据尚未被修复的历史状态

但对外语义、后续写操作与回放都必须以“最终对称”为目标。

## 5.6 Relation 不存在目标的处理

当前实现中，对端论文不存在时采取“best effort”策略：

- 目标 paper 不存在：主调用失败并报错
- 某个 related paper 不存在：跳过该对端，不抛错

所以 Phase 1 不保证“输入 relation IDs 全部存在”这一前置条件；但稳定态只对真实存在的论文建立双向关系。

## 5.7 删除论文时的 relation 清理

`PaperEntityRepository.delete()` 冻结如下行为：

删除论文集合时：

1. 先收集待删除 `_id`
2. 遍历其余所有论文
3. 从其他论文的 `relatedPaperIds` 中删除所有已删除 ID
4. 再删除目标论文对象

因此删除论文后，不应保留悬挂的反向 relation 引用。

## 5.8 Relation 的身份与排序

Phase 1 中 relation 集合的语义仅取决于成员集合，不取决于顺序。

即：

- `[B, C]` 与 `[C, B]` 语义相同
- 不应把数组顺序视为用户意图
- 不应在兼容性层面对顺序作保证

## 5.9 Relation 边方向语义

持久层 relation 是无向的。

若上层 graph view 需要方向，则方向必须是派生语义，而不是存储语义。
当前规划文本已明确：箭头方向应由 publication time 等展示逻辑推导，而非 `relatedPaperIds` 本身决定。

因此：

- 数据库存储不含方向
- sync-log 不存储方向
- migration 不处理方向字段

## 6. Sync Log / Replay 语义

## 6.1 Sync log 存储位置

当前 `SyncService` 明确声明：为避免给当前 Realm 增加额外字段，sync log 存在 Electron Store，而不在 Realm 内。

因此 Phase 1 中 sync log：

- 不是 Realm 数据模型的一部分
- 不参与 Realm schema version 管理
- 不受 Realm migration 直接约束

## 6.2 SyncLog 基本结构

`SyncLog` 当前字段：

- `log_id: uuid`
- `operation: create | update | delete`
- `entity_type: feed | paper | folder | tag | supplement | author`
- `value: any`
- `timestamp`
- `created_at`
- `updated_at`

其中 relation 变更当前复用：

- `entity_type = "paper"`
- `operation = "update"`

## 6.3 Relation 变更的日志载荷合同

当前 relation 变更通过如下 payload 记录：

{
  "relatedPaperUpdate": {
    "paperId": "<OID>",
    "relatedIds": ["<OID>", "<OID>", ...]
  }
}

这里表达的是：

“将 paperId 的 relation 集合整体设为 relatedIds，并要求系统补全对称边。”

不是：

- 单边 patch
- 增删 diff
- 带版本向量的 CRDT

## 6.4 何时写 relation sync log

`PaperService.setRelatedPaperIds(..., fromSync = false)` 规定：

- `fromSync == false`：先写入 sync log，再执行本地关系更新
- `fromSync == true`：不重复写 log，避免 replay 再次产生日志回环

这是 Phase 1 relation sync 的核心防重放回环边界。

## 6.5 Replay 语义

`SyncService.invokeSync()` 在 merge/replay 远端日志时，对 paper/update 做如下分派：

若 `log.value.relatedPaperUpdate` 存在，则调用：

- `PLAPILocal.paperService.setRelatedPaperIds(paperId, relatedIds, true)`

因此 relation replay 的合同语义为：

1. 识别到该日志是 relation 专用更新
2. 将其作为“集合替换操作”重放
3. 重放时带 `fromSync = true`
4. 重放本身必须补全双向关系
5. 重放本身不能再次产生日志

## 6.6 Replay 幂等性要求

虽然当前实现没有显式幂等 token 检查，但 relation replay 的目标语义必须视为幂等：

对同一 `(paperId, relatedIds)` 重放多次，最终收敛状态应一致。

原因：

- `setRelatedPaperIds` 是集合替换
- relation 集合被去重
- 对称补全重复执行不会继续扩张

因此 Phase 1 合同上把 relation replay 视为“结果幂等”。

## 6.7 Replay 顺序与冲突边界

Phase 1 没有 CRDT、没有 per-edge clock、没有显式冲突解决层。
因此 relation 冲突语义冻结为：

- 以日志重放顺序为准
- 单条日志表达的是某篇论文完整 relation 集合的替换
- 最终状态近似 last-writer-wins（准确说是 last-replayed-set-wins）

注意：

由于 relation 是对称的，若两端同时提交不同集合，最终结果取决于日志排序与后续对称修补，不能保证保留双方所有并发意图。

这属于 Phase 1 明确接受的限制，而不是 bug。

## 6.8 Relation sync 的边界

Phase 1 当前只冻结“paper update 中的 relatedPaperUpdate 分支”这一专门通道。

不在本合同保证范围内的内容：

- folder/tag/supplement/author 的完整 replay 语义
- relation 层面的远端删除 tombstone
- relation 级别冲突可视化
- 对缺失目标的远端补偿修复

## 7. Migration 与向后兼容边界

## 7.1 当前数据库 schema version

`DatabaseCore` 当前冻结：

- `DATABASE_SCHEMA_VERSION = 11`

因此 Phase 1 文档所述持久化语义对应 schema version 11。

## 7.2 relatedPaperIds 的迁移语义

`migration.ts` 当前包含：

- local migration：`oldVersion <= 10` 时，为所有 `Entity` 初始化 `relatedPaperIds = []`
- sync migration：同样为实体补空数组

因此 `relatedPaperIds` 的兼容边界是：

1. v10 及以下数据库升级到 v11 时，旧实体自动获得空 relation 集合
2. 不尝试从任何旧字段推断 relation
3. 不存在 relation 历史数据迁移逻辑

## 7.3 向后兼容保证范围

Phase 1 保证以下兼容：

1. 老数据库升级后可正常打开
2. 旧论文对象至少拥有可用的空 `relatedPaperIds`
3. folder 根节点 `Folders` 可在初始化/同步过程中被重新建立
4. 旧的 folder 树若与新规范不一致，可被镜像重建流程覆盖

## 7.4 不保证的兼容项

Phase 1 明确不保证以下历史状态被保真保留：

1. 旧版本中把 folder 当成“多重分组标签”使用的语义
2. 非规范 path 形式（反斜杠、冗余 `/`、空白段等）的原样保留
3. 依赖 `PaperFolder` 对象 ID 稳定不变的外部逻辑
4. relation 数组顺序
5. 非对称 relation 脏数据的继续保留

## 7.5 Folder 兼容性收敛原则

如果旧数据存在以下情况：

- 论文挂多个 folder
- folder 名称不是规范 path
- 磁盘目录与数据库 folder 树不一致

则在 local filesystem mode 下，系统允许通过 `syncFoldersWithLibrary()` 把它们收敛到新规范：

- 单 leaf folder 或空
- 规范路径
- 以磁盘目录为准的树形镜像

这是兼容升级中的“允许纠偏”行为，不应被视为破坏性 bug。

## 8. Local vs Non-local 行为边界

## 8.1 Phase 1 folder 功能仅在 local mode 完整成立

`CategorizerService` 明确冻结：

涉及真实文件系统 folder 的能力，只在 `usesLocalFileSystem() == true` 时受支持。

包括：

- `syncFoldersWithLibrary()` 的实际执行
- folder create
- folder rename / move
- folder delete-empty
- 基于本地目录树的 folder mirror
- pluginLinkedFolder 的随目录移动更新

## 8.2 Non-local mode 下的 folder 行为

在 non-local mode 下：

1. `syncFoldersWithLibrary()` 直接 return，不执行镜像
2. `CategorizerService.update()` 对 `PaperFolder` 操作会抛错
3. `CategorizerService.delete()` 对 `PaperFolder` 操作会抛错
4. 错误文案明确为：
   `Filesystem-backed folders are only supported with the local file storage backend.`

因此 Phase 1 的合同结论是：

non-local mode 不支持 filesystem-backed folder 语义。

这不是“功能暂缺但可依赖”，而是明确的产品边界。

## 8.3 Relation 在 local / non-local 下的地位

relation 存储于 Realm `Entity.relatedPaperIds`，不依赖本地文件系统目录。
因此 Phase 1 中：

- relation 语义对 local / non-local 一致
- `setRelatedPaperIds()` 不要求 local mode
- relation sync / replay 不依赖 folder mirror

换言之：

folder 是 local-first 特性；relation 不是。

## 8.4 文件后端与 folder 语义的解耦边界

虽然 `FileService` 有 local 与 webdav backend，但当前 folder 镜像逻辑实际直接基于本地 `appLibFolder` 与 `fs` 操作建立。

因此 Phase 1 不应宣称：

- WebDAV backend 已支持与 local 同级的真实目录镜像语义
- 远端目录树是 `PaperFolder` 的权威来源

若未来要支持，需另立新合同。

## 9. Phase 1 必须维持的不变量清单

以下不变量在 Phase 1 中应被视为强约束：

1. `PaperFolder.name`（非 root）必须是规范 relative folder path
2. `Folders` 仅作为逻辑根存在
3. local mode 下，真实磁盘目录树是 folder 拓扑真相源
4. 一篇论文在稳定态下最多只有一个 leaf folder
5. folder 查询必须递归包含后代
6. folder count 必须是递归计数
7. `Entity.relatedPaperIds` 必须去重
8. `Entity.relatedPaperIds` 不得包含自身 `_id`
9. relation 稳定态必须对称
10. 删除论文时必须清理其他论文上的反向 relation
11. relation replay 不得再次写本地 sync log
12. non-local mode 不得假装支持 filesystem-backed folder 编辑

## 10. 明确接受的 Phase 1 限制

以下限制是当前合同认可的已知边界：

1. relation 只有集合替换 API，缺少完整增量 API 合同
2. relation 冲突解决近似 last-replayed-set-wins
3. relation 日志 payload 是 ad-hoc JSON，不是强版本化协议
4. folder mirror 允许重建并删除 stale folder 节点
5. folder identity 主要靠 name/path，不靠对象 ID
6. non-local mode 不提供对等 folder 语义
7. graph 方向不是数据层语义，而是展示层派生语义

## 11. 对后续 Phase 的约束

若后续 Phase 要变更以下任一项，必须显式更新合同，而不能仅改代码：

1. 一篇论文可属于多个 folder
2. non-local mode 也支持真实 folder mirror
3. relation 从无向改为有向存储
4. relation sync 从集合替换改为增量 patch / CRDT
5. folder 查询从递归改为非递归
6. `PaperFolder.name` 不再存规范 relative path
7. sync log 从 Electron Store 迁入 Realm

## 12. 建议测试断言（供父任务后续采用）

建议至少覆盖以下断言：

1. `normalizeFolderPath(" A\\B / C ") == "A/B/C"`
2. `getFolderPrefixQuery("A/B")` 同时匹配 `A/B` 与 `A/B/C`
3. local mode 下新建目录后，folder tree 出现对应节点
4. local mode 下重命名目录后，旧路径消失、新路径出现，`pluginLinkedFolder` 同步更新
5. local mode 下删除非空目录报错
6. `syncFoldersWithLibrary()` 后，每篇论文 `folders.length <= 1`
7. `setRelatedPaperIds(A, [B, C])` 后，B/C 均反向包含 A
8. `setRelatedPaperIds(A, [B])` 之后再设为 `[C]`，则 B 不再反向包含 A，C 反向包含 A
9. 删除 A 后，其他论文的 `relatedPaperIds` 中不再出现 A
10. replay relation log 时不会新增一条本地 relation sync log
11. non-local mode 下 folder create/rename/delete 抛出约定错误

## 13. 结论

Phase 1 的本质不是“给 Paperlib 增加一种新的抽象 folder/relation 模型”，而是冻结一种更具体的实现约束：

- folder 在 local mode 下是“本地目录树镜像 + 单 leaf 归属”模型
- relation 是“对称无向集合 + 集合替换 sync”模型
- migration 只保证平滑进入该模型，不保证保留旧脏语义
- non-local mode 明确不提供等价 folder 语义

后续所有开发、修复、测试、评审，都应以此为基线。