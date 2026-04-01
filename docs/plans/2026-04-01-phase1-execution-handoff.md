# Phase 1 执行交接说明（P1-3 / P1-4 / P1-5）

> 目的：在计划阶段完成后，为下一轮实现提供可直接委派的执行说明。本文不定义新需求，只把已有两份计划里的 Phase 1 后半段工作整理成可落地的子任务、文件范围、验证命令、评审检查点与推荐顺序。

## 1. 输入依据

本交接说明基于以下材料整理：
- `.hermes/plans/2026-04-01_210932-paperlib-fork-master-plan.md`
- `.hermes/plans/2026-04-01_211331-phase1-contract-freeze-plan.md`
- 既有实现计划：`docs/plans/2026-04-01-obsidian-folder-graph.md`
- 仓库当前脚本与测试入口：`package.json`

本说明默认以下前置项已经完成，或至少已有可供引用的产出：
- P1-1：合同文档已写成
- P1-2：合同对照审计已完成，并给出 critical / important / minor 分级

如果 P1-2 尚未形成明确的 mismatch 列表，则不要启动 P1-3。

## 2. Phase 1 后半段的总体目标

P1-3 到 P1-5 的职责不是继续扩功能，而是把合同冻结阶段收口，形成“可并行开发”的安全起点：
- P1-3：修复审计中确认的 critical 行为缺口，必要时顺带关闭少量低风险 important 问题
- P1-4：把最高风险合同不变量转成可执行回归测试
- P1-5：汇总 readiness，明确 Phase 2 是否可进入更大范围并行实现

核心原则：
- 先修服务/数据语义，再补测试，最后给 readiness verdict
- 不做与合同无关的 UI 扩张或重构清理
- Renderer 不自行发明 folder/relation 语义；如存在调用边界违约，仅做止血式修正
- 每个子任务都必须经过“实现者 -> 规格符合性评审 -> 代码/制品质量评审”三段式审查

## 3. 推荐执行顺序

严格按以下顺序推进：

1. 锁定 P1-2 审计清单
   - 先把所有 critical mismatch 列成待办，逐条给出文件定位、预期合同、当前偏差、建议修法。
2. 执行 P1-3
   - 仅处理 critical，外加“顺手且低风险”的少量 important。
3. 对 P1-3 结果做定向验证
   - 至少完成 `pnpm run typecheck`，并跑与修复点对应的最小可执行检查。
4. 执行 P1-4
   - 只为已经冻结的合同不变量补测试；测试不抢跑未来功能。
5. 跑 Phase 1 回归验证
   - 包括 typecheck 与 repo 支持的测试入口。
6. 执行 P1-5
   - 依据合同文档、审计结论、已合入修复、测试结果，给出 go / conditional go / no-go。

不建议的顺序：
- 未完成审计就开始修
- 先补测试再修语义
- 在 P1-3 中顺手做批量关系编辑、graph 邻域过滤、偏好设置扩展等 Phase 2 工作

## 4. 子任务 P1-3：修复 critical contract mismatches

### 4.1 任务目标

根据 P1-2 审计结果，修复最可能破坏后续并行开发的合同缺口，重点集中在：
- folder canonical semantics
- relation API semantics
- sync-log / replay semantics
- migration / backward compatibility 的最低安全线

### 4.2 允许范围

允许：
- 服务层、仓储层、模型层、迁移层的对齐修复
- 为阻断调用边界违约而做的小范围 renderer 调用修正
- 为保持合同一致性而补充默认值、去重、幂等、防自关联、删除清理等逻辑

不允许：
- 新增大范围 UI 能力
- 重写已有架构
- 顺手做产品增强型需求
- 把 important/minor 问题扩成大重构

### 4.3 优先处理的 mismatch 类型

应优先修复以下类型，只要它们在 P1-2 中被标为 critical：

1. 关系语义破坏
- `relatedPaperIds` 非对称
- 重复关系积累
- 允许 paper relate to itself
- 删除论文后残留反向 dangling relation
- 单篇与批量关系接口语义不一致

2. 文件夹语义破坏
- 本地模式下 folder membership 不是“替换 canonical membership”而是继续 append
- 论文真实文件路径与存储 folder membership 可能长期失配且无 reconcile
- 递归 folder query 与合同不一致
- 非空文件夹删除没有被正确阻止或没有清晰失败路径

3. sync/replay 语义破坏
- 关系更新未走 canonical sync payload
- replay 过程中重复发出 sync log
- replay 后破坏关系对称性
- relation update 与普通 paper draft update 混淆，造成重放语义不稳定

4. 兼容性底线问题
- 旧数据缺失 `relatedPaperIds` 时可能在读取/启动/更新时报错
- reconcile/migration 非幂等
- 非本地 backend 被误当作支持本地 folder mirroring

### 4.4 可能涉及的文件

按计划与仓库现状，P1-3 可能触达以下文件：

核心服务/数据文件：
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- `app/base/folder.ts`

高概率相关的模型/仓储/迁移文件：
- `app/models/entity.ts`
- `app/models/paper-entity.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/database/core.ts`
- `app/service/services/database/migration.ts`
- `app/service/services/database/cache-core.ts`

可能需要检查但仅在审计确认违约时才修改的调用方：
- `app/renderer/services/querysentence-service.ts`
- 关系编辑相关 renderer 组件
- 与 folder 操作相关的 sidebar / context menu 调用方

### 4.5 推荐委派方式

建议把 P1-3 拆成最多 3 个顺序子切片，不要一次性大包：

P1-3A：relation semantics 修复
- 目标：对称、去重、幂等、自关联保护、删除清理
- 主要文件：`paper-service.ts`、`paper-entity-repository.ts`、相关 model 文件

P1-3B：folder canonical semantics 修复
- 目标：canonical membership、路径对齐、递归查询、删除边界
- 主要文件：`file-service.ts`、`categorizer-service.ts`、`folder.ts`、必要时 `querysentence-service.ts`

P1-3C：sync/migration compatibility 修复
- 目标：relation sync payload、replay 安全、legacy default compatibility
- 主要文件：`sync-service.ts`、`database/migration.ts`、`database/core.ts`、model/repository 文件

只有在前一个切片完成并通过评审后，才进入下一切片。

### 4.6 实施完成标准

P1-3 完成时，必须满足：
- P1-2 中所有 critical mismatch 都已修复，或逐条给出明确 defer 理由
- 每个修复点都能映射回某条合同或审计条目
- 未引入新的产品范围扩张
- `pnpm run typecheck` 可通过
- 至少存在与修复点对应的定向执行验证

### 4.7 建议验证命令

最低必须：
```bash
pnpm run typecheck
```

如需要完整 repo 测试入口：
```bash
pnpm run test:e2e-dev
```

建议在提交说明里额外记录“针对修复点的最小验证路径”，例如：
- relation add/remove/set 后检查双向一致性
- 删除被关联论文后检查其他论文的 reverse cleanup
- 旧数据缺失 `relatedPaperIds` 时完成读取与更新
- folder 选择命中父目录时包含子目录论文

### 4.8 P1-3 评审检查点

规格符合性评审必须确认：
- 修复是否准确对应审计中的 critical 项
- 是否严格遵守合同，而不是凭实现者理解扩写语义
- 是否只动了必要范围

代码质量评审必须确认：
- 幂等、去重、空值、重复 id、无效 id、自关联等边界条件有处理
- 迁移/默认值逻辑不会在旧库上引入启动风险
- sync/replay 不会双写或形成循环副作用
- renderer 如有改动，仅是回到服务合同边界，而非新建平行语义

## 5. 子任务 P1-4：补充最小合同回归测试

### 5.1 任务目标

把 Phase 1 最重要、最容易回归、且最影响后续并行开发的不变量变成可执行测试。P1-4 的重点不是覆盖率数字，而是风险封口。

### 5.2 测试范围优先级

优先级从高到低如下：

P0 必测：
1. 关系对称性
2. 关系去重
3. 删除论文后的 relation cleanup
4. 缺失/legacy `relatedPaperIds` 的兼容读取与默认处理
5. 递归 folder query 行为

P1 建议补：
6. canonical folder membership 的 replace-not-append 语义
7. relation API 对重复 id / 无效 id / 自关联 id 的稳定处理
8. replay 不重复制造额外关系副作用

P2 仅在成本很低时补：
9. graph/list/table 一致性 smoke path
10. 非本地 backend 的显式降级行为

### 5.3 可能的文件目标

当前仓库已有测试目录较少，P1-4 预计会新增或修改这些位置：
- `tests/unit-tests/` 下新增服务或工具测试
- `tests/unit-tests/services/` 下新增 `paper-service` / `file-service` / `categorizer-service` 相关 spec
- `tests/` 下新增更偏集成的 contract regression 测试文件
- 如 folder 工具适合做纯函数测试，可增加针对 `app/base/folder.ts` 的测试文件
- 如 migration/default compatibility 更适合集成验证，可放在 `tests/` 的更高层级测试入口

可参考当前已有测试风格：
- `tests/unit-tests/services/log-service.spec.ts`
- `tests/unit-tests/services/preference-service.spec.ts`

### 5.4 推荐拆分方式

建议按合同主题拆，不按技术栈拆：

P1-4A：relation regression tests
- 断言对称、去重、自关联保护、删除 cleanup、legacy default
- 目标优先落在 service 层或 repository/service 集成边界

P1-4B：folder semantics regression tests
- 断言 recursive query、canonical membership、必要时 folder path helper 行为
- 若 `app/base/folder.ts` 为纯工具层，优先先补纯单测

P1-4C：compatibility / replay smoke tests
- 仅在仓库现有测试基础易于落地时加入
- 不要为了补一个测试新搭复杂 harness

### 5.5 测试编写要求

测试名必须直说合同，不要写成模糊实现细节：
- 应表达“should keep relations symmetric when ...”
- 应表达“should remove reverse relatedPaperIds when deleting a paper”
- 应表达“should include descendant folders when querying a parent folder”
- 应表达“should treat missing relatedPaperIds as empty relation set for legacy entities”

每个测试至少体现以下之一：
- 合同不变量
- 旧数据兼容边界
- 容易回归的历史风险点

不要在 P1-4 中做的事：
- 为了测试方便重构大段生产代码
- 引入与现有仓库不一致的新测试框架
- 写只能证明当前实现、却不能表达合同要求的脆弱测试

### 5.6 建议验证命令

最低建议：
```bash
pnpm run typecheck
pnpm run test:e2e-dev
```

如果新增的是更窄的测试文件，建议在交付说明中同时写出：
- 全量可用命令
- 本次最小回归命令
- 若某测试入口较重，需要解释为何仍选用该入口

### 5.7 P1-4 完成标准

P1-4 完成时，至少应满足：
- 已覆盖所有 critical 合同不变量，或对未覆盖项给出明确原因
- 测试命名与断言能直接映射回合同条目
- 新测试在当前仓库支持的入口下可执行
- 测试不会依赖未冻结的未来功能

### 5.8 P1-4 评审检查点

规格符合性评审必须确认：
- 测试覆盖的是合同，不是随意挑选的代码路径
- P1-3 修过的 critical 点都有至少一个回归保护

代码质量评审必须确认：
- 断言稳定，不依赖偶然顺序/时间/环境
- fixture 与 mock 不掩盖真实合同风险
- 测试粒度合理，失败时能指向具体语义问题

## 6. 子任务 P1-5：写 Phase 1 readiness summary

### 6.1 任务目标

在 P1-3 与 P1-4 完成后，形成一个供总控直接决策的 readiness note，明确：
- Phase 1 是否完成
- Phase 2 是否可并行展开
- 还有哪些已知限制与延期项
- 后续子流的推荐切分方式

### 6.2 输出文件建议

建议创建在 `docs/plans/`，文件名可采用：
- `docs/plans/2026-04-01-phase1-readiness-summary.md`
- 或 `docs/plans/2026-04-01-phase1-execution-readiness.md`

如果希望给主控智能体留更偏操作性的短说明，可补一份 `.hermes/plans/` 版本，但 repo 内正式交付建议放 `docs/plans/`。

### 6.3 必须包含的内容

1. 输入引用
- 合同文档路径
- 审计文档路径
- P1-3 修复说明/PR 或提交范围
- P1-4 测试文件与验证结果

2. 完成情况
- 哪些合同区域已冻结并落地
- 哪些 critical mismatch 已清零
- 哪些 important/minor 项仍保留

3. 验证结果
- `pnpm run typecheck` 结果
- 测试入口结果
- 如有未执行命令，必须说明原因与风险

4. Readiness verdict
- Go：可进入 Phase 2 并行开发
- Conditional Go：可开始，但必须遵守限制清单
- No-Go：仍有阻塞性缺口

5. Deferred items
- 明确保留到 Phase 2 的事项，例如：
  - 批量 relation UX
  - graph 邻域过滤
  - 大图性能退化策略
  - 偏好与颜色映射增强

6. 下一轮推荐委派
- 服务/数据流
- UI/交互流
- QA/回归流
- 性能/兼容流

### 6.4 推荐结构

建议 readiness 文档按以下节结构写：
- 背景与目标
- 输入文档
- 本轮完成项
- 剩余风险与延期项
- 验证结果
- Readiness verdict
- Phase 2 handoff

### 6.5 P1-5 完成标准

P1-5 完成时，必须满足：
- 可以让未参与本轮实现的人快速理解 Phase 1 是否真正收口
- go/no-go 结论有证据支撑，而不是口头判断
- 明确哪些后续工作可以并行，哪些仍需串行或先补合同

### 6.6 P1-5 评审检查点

规格符合性评审必须确认：
- 文档确实在回答 readiness，而不是复述计划
- 结论与前置产出一致

制品质量评审必须确认：
- 风险表述具体，不含糊
- defer 项不会被误判为已完成
- handoff 建议能直接转成下一轮子代理任务

## 7. 推荐的下一轮子代理分工

建议由总控按以下顺序派发，不要并行启动全部任务：

第 1 轮：
- 子代理 A：P1-3A relation semantics 修复
- 评审代理 A1：规格符合性评审
- 评审代理 A2：代码质量评审

第 2 轮：
- 子代理 B：P1-3B folder semantics 修复
- 评审代理 B1：规格符合性评审
- 评审代理 B2：代码质量评审

第 3 轮：
- 子代理 C：P1-3C sync/migration compatibility 修复
- 评审代理 C1：规格符合性评审
- 评审代理 C2：代码质量评审

第 4 轮：
- 子代理 D：P1-4 relation + folder regression tests
- 评审代理 D1：规格符合性评审
- 评审代理 D2：测试质量评审

第 5 轮：
- 子代理 E：P1-5 readiness summary
- 评审代理 E1：规格符合性评审
- 评审代理 E2：文档质量评审

原因：
- relation / folder / sync-migration 三块虽然有关联，但 critical 修复往往共享服务层，直接并行容易冲突
- 测试应基于已稳定的修复结果编写，否则会反复改断言
- readiness 只能在实现与验证收口后写

## 8. 交付时建议附带的最小清单

每个执行子代理交付时，建议统一附上：
- 修改文件列表
- 对应审计条目编号
- 对应合同条目编号
- 运行过的命令
- 结果摘要
- 未解决问题与建议 defer

建议总控在合并前检查以下问题：
- 是否有 critical mismatch 未被追踪
- 是否有修复没有测试保护
- 是否有测试在表达未冻结需求
- 是否有 readiness 结论与实际验证不一致

## 9. 最终判定门槛

只有当以下条件同时满足时，Phase 1 才应被视为可交接完成：
- 合同文档存在且可引用
- 审计报告存在且已分级
- critical mismatch 已修复或被明确阻断说明
- 最小回归测试已建立
- `pnpm run typecheck` 通过
- 至少一个 repo 支持的测试入口完成并记录结果
- readiness note 已写明 go / conditional go / no-go

若以上任一项缺失，则 P1-5 应给出 `Conditional Go` 或 `No-Go`，而不是直接放行到 Phase 2。
