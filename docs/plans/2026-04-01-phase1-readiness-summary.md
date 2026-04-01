# Phase 1 就绪度总结

日期：2026-04-01
状态：Phase 1 readiness summary
适用范围：`/Users/komorex/Develop/paperlib` 当前仓库状态

## 1. 总结

本次 Phase 1 的可交付物已经形成了文档、审计、执行交接与最小回归测试四个层次的基础闭环：

- 合同文档已明确冻结 folder / relation / sync / migration 的 Phase 1 语义，作为后续实现与评审基准。
- 实现审计已把当前分支与合同之间的差异按“已符合 / 部分符合 / 不符合”分层，并点名高优先级 mismatch。
- 执行交接文档已把 P1-3 / P1-4 / P1-5 的目标、边界、顺序、验证与评审检查点写清楚。
- 仓库中已出现针对高风险不变量的回归测试文件，说明 Phase 1 不只是“写文档”，而是已经开始把合同转成可执行保护。

但从“Phase 1 是否完全收口”来看，结论仍然不是完全 Go，而是“有条件进入 Phase 2 / conditional go”。

原因很明确：审计报告中列出的若干 critical mismatch 目前仍以已知风险的形式存在于仓库材料里，尤其是：

- SyncService 对 folder/tag 的合同未闭环
- migration 中仍有把 `/` 扁平化为 `-` 的旧逻辑风险
- repository 仍可能绕过“文件系统为 folder 事实来源”的边界
- `PaperService.create()` 的 debug bypass 仍被审计认定为高优先级问题

因此，Phase 1 的“合同冻结、问题显化、测试起步”已经完成；但如果按 `.hermes/plans/2026-04-01_211331-phase1-contract-freeze-plan.md` 的 Definition of Done 来判断，当前更准确的状态是：Phase 1 已接近完成，但仍需要以显式 defer 和下一轮 guardrails 的形式继续控风险，而不应把所有剩余风险当作已清零。

## 2. 已完成的交付物

对照 Phase 1 计划，当前仓库里已经可确认的交付物如下。

### 2.1 合同文档

已存在：`docs/plans/2026-04-01-phase1-contract-freeze.md`

该文档已经冻结并明确了：

- folder 路径规范化规则
- `PaperFolder.name` 必须存储为规范 relative folder path
- local mode 下文件系统是 folder 拓扑的事实来源
- `syncFoldersWithLibrary()` 的 folder 重建与 count 语义
- 单论文 canonical leaf folder 语义
- 递归 folder query 的 exact-or-prefix 语义
- `pluginLinkedFolder` 的规范路径约束
- relation 的对称存储、不变量与 sync replay 语义
- migration / backward-compat 边界
- local 与 non-local backend 的覆盖边界
- Phase 1 必须维持的不变量与明确接受的限制

这满足了 Phase 1 对“contract note”交付物的要求。

### 2.2 审计报告

已存在：`docs/plans/phase1-implementation-audit-2026-04-01.md`

该报告已经：

- 以只读方式对服务层、仓储层、migration、renderer 关键入口做了核对
- 标出当前实现中已经符合合同的骨架能力
- 标出“部分符合”的灰区
- 标出“不符合”的高/中优先级 mismatch
- 给出文件定位、原因说明与修复建议
- 明确 local-only 边界与 open questions

这满足了 Phase 1 对“具体 mismatch list”的要求。

### 2.3 执行交接文档

已存在：`docs/plans/2026-04-01-phase1-execution-handoff.md`

该文档把 P1-3、P1-4、P1-5 的执行顺序、允许范围、验证命令、评审检查点、建议文件范围与最终完成标准写成了可直接委派的说明，降低了 Phase 2 前的协作歧义。

### 2.4 最小合同回归测试

已存在：

- `tests/unit-tests/services/paper-relations.spec.ts`
- `tests/unit-tests/base/folder.spec.ts`

其中已覆盖的高风险合同点包括：

- relation 对称性
- relation 去重
- relation 集合收缩时的反向清理
- 无效/self/nonexistent relation id 的稳定处理
- 删除论文后的 reverse relation cleanup
- folder prefix query 的规范化与递归匹配语义
- quote escaping 的 Realm 查询安全性
- `isFolderPathInside()` 的父子路径判断边界
- 从 relative file path 推导 folder path 的规范化行为
- internal library path 过滤规则

这说明 P1-4 至少已经有了第一批真实落地的 regression coverage，而不是停留在建议层面。

## 3. 已落实或已显式冻结的能力

结合合同文档与审计报告，以下能力可以认为已经在 Phase 1 中被成功冻结，并能作为后续实现基线：

1. Folder canonical 语义以规范 relative path 为中心，而不是旧的平面名称语义。
2. Local mode 下 folder 树以真实文件系统为 source of truth。
3. `CategorizerService.syncFoldersWithLibrary()` 是当前 folder 树收敛的核心机制。
4. Folder 查询采用 exact-or-prefix 的递归匹配，而不是仅匹配当前节点。
5. Paper 的 folder 语义被定义为“最多一个 canonical leaf folder”。
6. Relation 的稳定态语义是无向关系的对称存储，集合意义优先于顺序意义。
7. Phase 1 明确接受 local-only 的 folder 完整语义，不对 non-local backend 作虚假承诺。

这些冻结点已经足以为 Phase 2 的功能扩展提供统一语言和评审标准。

## 4. 已修复或已补强的 mismatch

基于仓库中的实际测试落地与计划材料，可确认以下 mismatch 已至少得到部分修复或显著补强：

### 4.1 relation 对称性与去重风险已被测试收口

`tests/unit-tests/services/paper-relations.spec.ts` 直接验证：

- `setRelatedPaperIds()` 会保持双向对称
- 重复 relation id 会被去重
- relation 集合缩小时，会清理陈旧反向链接
- 非法、自关联、无对应实体的 id 不会污染稳定态
- 删除论文时会清理剩余论文中的 dangling relation

这至少说明审计和总计划中反复强调的 relation invariants 已进入可执行保护范围，是 Phase 1 最有价值的实质进展之一。

### 4.2 folder query 语义分叉风险已被测试补强

`tests/unit-tests/base/folder.spec.ts` 明确把以下行为编码成合同测试：

- 规范化输入后再生成 prefix query
- 只匹配当前 folder 或其 descendants
- 对特殊字符进行 escape
- 路径包含关系的边界行为不能回退到错误匹配
- internal library artifacts 不得被识别为用户 folder

这对防止 folder 语义重新退化回“字符串拼接随处散落”的状态有直接价值。

### 4.3 Phase 1 关键语义已从“隐含实现”转为“文档 + 审计 + 测试”三方锚定

虽然这不是单点代码修复，但它是 Phase 1 最核心的 mismatch 修复：

- 过去的主要问题是语义分散、边界模糊、不同调用方可能各自解释；
- 当前已经有合同文档、审计报告与 regression tests 共同指向同一套语义。

这显著降低了下一阶段并行实现时“在错误假设上继续开发”的概率。

## 5. 仍未收口、但已明确的 deferred / outstanding items

以下问题在现有仓库材料中仍应视为 outstanding，不能误判为已完成。

### 5.1 高优先级 deferred / 未闭环项

1. SyncService 与 folder/tag 合同未闭环
- 审计明确指出：`SyncLog.entity_type` 声明支持 folder/tag，但 `invokeSync()` 实际只处理 paper/feed。
- 若 folder/tag 仍属于正式合同的一部分，则这是未完成项；若决定延期，必须在下一轮明确从“已冻结合同”或“当前实现承诺”中排除。

2. migration 扁平化旧逻辑风险
- 审计指出 `migration.ts` 的旧分支仍可能执行 `folder.name.replaceAll("/", "-")`。
- 这与路径层级化合同直接冲突，属于必须持续追踪的 compatibility 风险。

3. repository 仍可能绕过文件系统创建或维护 folder
- 审计明确指出 repository 仍保留旧式 folder 维护能力。
- 这会削弱“文件系统为事实来源”的单一真相边界。

4. `PaperService.create()` debug bypass
- 审计把它列为高优先级问题。
- 即使它不是 folder/relation 合同本身的问题，它也会影响 Phase 2 把该分支当作稳定基线的可信度。

### 5.2 中优先级 deferred / 边界未完全收紧项

5. 删除 paper 后的 folder 收敛流程未完全统一
- 审计认为 delete 之后没有显式 `syncFoldersWithLibrary()`，因此 folder tree 最终态仍可能依赖其他路径清理。

6. “单 leaf folder” 仍更像目标而不是全边界强约束
- 审计指出当前实现仍保留多 folder 的兼容逻辑。
- 这意味着 canonical membership 尚未在所有写入边界完全硬化。

7. folder 查询构造尚未彻底统一
- 仍存在某些位置内联查询而不是统一复用 helper 的风险。

8. sync 的 last-write-wins 注释与实现未完全一致
- 这属于 sync semantics 文档与实际代码的潜在偏差，需要下一轮实现继续收口。

## 6. 本轮新增的回归覆盖

当前仓库中已能确认的新增回归覆盖如下。

### 6.1 relation regression coverage

文件：`tests/unit-tests/services/paper-relations.spec.ts`

已覆盖场景：

- relation 对称写入
- 重复 relation 去重
- relation 缩减后的 stale reverse cleanup
- invalid/self/nonexistent ids 的容错处理
- 删除 paper 后的 reverse cleanup

价值：

- 直接覆盖了计划文档中 P0 级别的 relation invariants
- 为后续 batch relation editing、graph 邻域功能、sync replay 调整提供了最低安全网

### 6.2 folder regression coverage

文件：`tests/unit-tests/base/folder.spec.ts`

已覆盖场景：

- `getFolderPrefixQuery()` 的规范化与递归语义
- folder 查询字符串的转义安全
- `isFolderPathInside()` 的精确父子判断
- `getFolderPathFromRelativeFile()` 的路径推导
- internal library path 过滤

价值：

- 直接锁定了 folder semantics 中最容易被“方便改法”破坏的底层规则
- 为 renderer / repository / service 之间统一 folder 语义提供了测试锚点

## 7. Phase 2 go / no-go 结论

结论：conditional go（有条件进入 Phase 2）

理由：

- Go 的依据：
  - 合同已冻结
  - mismatch 已审计并分类
  - 最关键的一批 relation / folder 不变量已有 regression coverage
  - Phase 2 已经具备共享语义基线，后续委派不必再在核心定义上反复猜测

- 不能直接判定为完全 Go 的依据：
  - 审计中的若干 critical mismatch 仍未在当前文档集合中被证明已全部清零
  - migration、sync folder/tag、repository 绕过边界、create debug bypass 等问题仍会影响“稳定基线”可信度
  - 若不加 guardrails 就扩大并行实现，Phase 2 仍有把 deferred 风险扩散到更多功能面的可能

因此建议的判断不是 no-go，而是：

- 可以开始 Phase 2 的受控实现；
- 但必须把已知 deferred 风险当作进入条件的一部分显式管理；
- 任何会触及 folder/sync/migration/relation 边界的新工作，都必须先对照本次 Phase 1 合同与审计结论。

## 8. 下一轮实现的建议 guardrails

为避免 Phase 2 把 Phase 1 已冻结语义重新打散，建议下一轮严格采用以下 guardrails。

1. 任何新功能不得重新定义 folder/relation 语义
- renderer、graph、batch 操作都只能消费现有 service contract。
- 若发现合同不够用，先补合同/审计说明，再改实现。

2. 触及 relation 写路径的改动，必须保留或扩展现有 relation regression tests
- 不允许在无对应测试的情况下修改 `setRelatedPaperIds()`、删除清理或 replay 路径。

3. 触及 folder query/path helper 的改动，必须同步跑或扩展 `tests/unit-tests/base/folder.spec.ts`
- 任何内联字符串拼接都应被视为风险信号。

4. 明确 local-only 边界，不允许 non-local backend 假装支持同等 folder mirroring 语义
- 若要扩展 WebDAV 支持，应作为单独合同议题，而不是在 Phase 2 中隐式混入。

5. migration 与 compatibility 改动必须优先保证幂等与不可逆损坏防护
- 尤其要避免再次引入 folder path 扁平化或隐式降级。

6. repository 层不得继续扩大“自建 folder 真相源”的能力
- Phase 2 若触及 folder 相关存储，应继续朝“文件系统 + reconcile”单一真相收拢，而不是回到双重来源。

7. 对任何审计里仍属 critical / important 的 deferred 项，都要在对应实现 PR 或任务中显式声明是否会受影响
- 避免 deferred 项在多人并行时失踪。

8. Phase 2 开工前，建议先把 outstanding items 建成明确追踪清单
- 至少拆成：sync、migration、repository boundary、paper create 四类。
- 每类都应标明：是否 Phase 2 前置、是否可继续 defer、谁负责验证。

## 9. 最终判断

如果把 Phase 1 看作“为下一轮并行实现建立统一合同、识别关键风险、把最高风险不变量转成测试”的阶段，那么当前仓库已经达到了这个目标。

如果把 Phase 1 看作“所有 critical mismatch 都已经在代码层彻底清零”的阶段，那么当前证据仍不足以支持完全完成的判断。

因此，本 readiness summary 的最终结论是：

- Phase 1 文档冻结：完成
- Phase 1 审计显化：完成
- Phase 1 最小回归覆盖：已建立
- Phase 1 全量风险收口：未完全完成
- Phase 2 进入建议：conditional go

建议下一轮以“受控推进 + 明确 defer + 测试先行”的方式进入 Phase 2，而不是把当前分支当作已经无条件稳定的最终基线。
