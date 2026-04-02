<div align="center">
<img src="./assets/icon.png" height="95" />
<br />
<img src="https://img.shields.io/badge/dynamic/json?label=Release&query=version&url=https://raw.githubusercontent.com/Future-Scholars/paperlib/master/package.json" />
<img src="https://img.shields.io/github/license/Future-Scholars/paperlib" />
<img src="https://img.shields.io/github/stars/Future-Scholars/paperlib" />
<h2><a href="https://paperlib.app/" > Paperlib </a></h2>
一个开源学术文献管理工具。
</div>

<p align='center'>
加入 <a href="https://discord.gg/4unrSRjcM9">Discord 社区</a>!
</p>

<p align='center'>
<a href='https://paperlib.app/en/'>官网</a> | <a href='https://paperlib.app/en/download.html'>下载</a> | <a href='https://paperlib.app/en/doc/getting-started.html'>开始指南</a> | <a href='https://github.com/users/Future-Scholars/projects/1/views/1'>开发路线</a>
</p>

![](./assets/ui.png)

---

📣 **我正在寻找合作伙伴来开发 Paperlib。** 📣

如果你有兴趣，请联系我。

## 介绍

我是计算机科学的博士生。在我的研究领域，会议论文占据主要地位，这与其他学科有所不同。由于没有 DOI、ISBN，很多会议论文的元数据很难查找（例如，NIPS、ICLR 等）。当我在草稿论文中引用一篇出版物时，我需要一遍又一遍地在 Google Scholar 或 DBLP 上手动搜索它的出版信息。

**为什么不是 Zotero、Mendeley？**

- 优秀的元数据抓取能力是论文管理工具的核心功能之一。不幸的是，世界上没有任何软件能很好地做到这一点，即使是商业软件也不行。
- 现代的用户界面。没有多余的无用功能。

我们可能需要的是：导入一篇论文，尽可能准确地抓取其元数据，简单地组织论文库，并在写论文时将其导出。

这就是 Paperlib。

## 亮点

- 使用多个抓取器抓取论文的元数据。支持编写你自己的元数据抓取器。适用于多个学科。
- 全文和高级搜索。
- 智能过滤器。
- 评分、标记、标签、组和 Markdown/纯文本笔记。
- 通过 RSS 订阅关注你研究主题的最新出版物。
- 从网上定位并下载 PDF 文件。
- 类似 macOS Spotlight 的插件，在写草稿论文时轻松复制粘贴引用。也支持 MS Word。
- 云同步，支持 macOS、Linux 和 Windows。
- 美观简洁的用户界面。
- 可扩展。你可以编写自己的扩展。

### 通过扩展，你可以：

- 显示引用次数。
- 使用 LLMs 总结论文。
- 使用 LLMs 自动标记论文。
- 使用自然语言语义搜索你的论文库，例如：“2024 年由 Geoffrey 撰写的论文”。
- 与 LLMs 讨论你的论文。
- 以及更多...

## 下载和安装

<a href="https://paperlib.app/cn/download.html" style="font-size: 16px"> » 在此下载 « </a>

### Windows

⚠️ 你可能会注意到，在 Windows 上安装 Paperlib 时会出现警告。原因是 Paperlib 没有代码签名，因为这非常昂贵。Paperlib 的源代码可以在这找到。它不会对你的电脑造成伤害，并且绝不会收集任何个人信息。请确保你使用 HTTPS 和我们的官方网站或 Github 下载安装程序。在安装`latest.exe`时，在“Windows 保护你的电脑”窗口中，请点击“更多信息”并“仍要运行”。

### macOS

⚠️ 你可能需要点击`偏好设置` - `安全与隐私` - `仍要运行`。

### Linux

请参见[此处](https://paperlib.app/cn/download-linux.html)。

## 快速开始

[介绍（英文）](https://paperlib.app/en/doc/getting-started.html)  
[介绍（中文）](https://paperlib.app/cn/doc/getting-started.html)

## 本 Fork 的本地测试说明

这个 fork 新增了类似 Obsidian 的本地文件夹工作流、论文关联关系以及论文图谱视图。以下步骤用于本地开发过程中的人工测试。

## 当前进度与接手说明

这个 fork 当前正在朝着“本地优先 + 高性能论文知识图谱”的方向推进。下面这部分是给后续新 session 快速接手用的。

### 当前已经完成

- 类似 Obsidian 的本地文件夹工作流已经落地，folder 语义与真实本地目录对齐。
- 论文间关系已实现，当前仍存储在 `relatedPaperIds` 模型上。
- 图谱视图已实现，包括：
  - 论文节点
  - 基于发表时间推导的边方向
  - 基于关系数量的节点大小
  - 基于顶层文件夹家族与子文件夹层级的颜色语义
- Phase 1 的本地优先加固已经完成一轮，覆盖：
  - 本地数据库与持久化 contract
  - 关系完整性与更新保留语义
  - 文件夹 / 文件变更以及 managed path 安全性
- Phase 2 内建抓取架构已经完成第一批落地：
  - `ScrapeService` 中已有优先级链式 provider 执行
  - 已内建 DOI / arXiv metadata provider
  - stable metadata provider 已通过 provider registry 挂入，而不是继续依赖 `ScrapeService` 中的硬编码分支
  - 请求 metadata provider 时，已经支持通过别名（如 `doi` / `arxiv`）筛选内建 provider，同时保留 hook fallback
  - 现有 refresh / import 流程仍保持兼容
- 最近新增的本地优先改进：
  - `PaperService.create()` 已恢复为真实 scrape/import 路径，不再走之前的占位假数据草稿路径
  - 当抓取结果为空或不完整时，仍会保留基于文件名的 fallback 元数据
  - 当用户把一个**没有 `default.realm`**、但已经包含 PDF 的本地论文文件夹设置为库时，现在会自动递归导入这些 PDF
  - bootstrap 导入做了并发保护，避免数据库初始化并发时重复导入同一个文件夹
  - 偏好设置中已把 cloud / WebDAV 降为兼容路径，不再作为主工作流强调
  - 数据库 bootstrap 现在还额外覆盖了两条回归测试：
    - 开启 flexible sync 时不应触发 bootstrap
    - 非本地文件存储模式下不应触发 bootstrap

### 下一步最值得做什么

后续最推荐的执行顺序是：

1. 继续补完稳定的内建 entry/import 路径：
   - 增加 built-in entry-provider fallback，并放在 `hook:entry` 之前
   - BibTeX
   - generic HTML metadata
   - scrape pipeline 内部的 PDF identifier bootstrap  
     （注意：这和现在已经有的“首次本地库自动导入 PDF”不是一回事）
2. 继续清理本地优先数据模型：
   - 谨慎削减旧 cloud/sync 残留
   - 明确 merge / finalization 边界
   - 默认保留本地管理字段
3. 进入下一阶段图谱性能工作：
   - 从 `relatedPaperIds` 邻接表逐步过渡到 canonical edge storage
   - 增加 relation / graph read API
   - 减少大库下的 whole-library scan

### 新开 session 时建议先读哪些文件

- `README.md`
- `README_zhCN.md`
- `docs/plans/phase1-local-db-contract.md`
- `docs/plans/phase1-edge-migration-seam.md`
- `docs/plans/phase2-scrape-architecture-contract.md`
- `docs/plans/phase2-scrape-provider-inventory.md`
- `docs/plans/phase2-safe-merge-policy.md`
- `docs/plans/2026-04-02-phase2-graph-db-performance-handoff.md`
- `app/service/services/paper-service.ts`
- `app/service/services/database-service.ts`
- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-provider-registry.ts`
- `app/service/services/scrape-builtin-metadata.ts`
- `app/service/services/scrape-stable-metadata-providers.ts`
- `app/renderer/ui/preference-view/cloud-view.vue`
- `tests/unit-tests/services/paper-service-create.spec.ts`
- `tests/unit-tests/services/database-service.spec.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`
- `tests/unit-tests/services/scrape-stable-metadata-providers.spec.ts`

### 当前已经完成到什么程度

- 本地文件夹工作流、论文关系、图谱视图都已经可用，并有对应回归测试保护。
- 本地库首次接管已有 PDF 文件夹时，bootstrap 导入已经能工作。
- DOI / arXiv 的内建 metadata provider 已经接入到 app 侧 scrape pipeline。
- stable metadata provider 的调度方式已经从硬编码分支收束到 provider registry。
- provider 请求筛选现在支持别名匹配，同时仍保留 hook fallback。

### 当前还没完成什么

- 还没有 built-in entry-provider fallback 来承接剩余稳定输入源。
- BibTeX 还没有以内建 entry/import 主路径落地。
- generic HTML metadata 还没有以内建 entry/import 主路径落地。
- scrape pipeline 自身的 PDF identifier bootstrap 还没有补完。
- 图谱底层仍然依赖 `relatedPaperIds` 邻接模型，canonical edge storage / relation read API 还没实现。

### 当前风险 / 已知缺口

- 新增的本地库 bootstrap 已有单元测试，但还没有做完整的 Electron 交互式 smoke test。
- scrape pipeline 还没补完剩余稳定的 built-in entry/import 路径，因此“完全以内建 provider 为主路径”还没有彻底收口。
- 图谱目前仍基于 `relatedPaperIds` 邻接模型，大库性能优化还没完成。
- cloud / WebDAV 只是 UI 上降权，兼容后端还在；后续要删也应谨慎。
- 真正面向大库的 relation / graph query 性能，仍然是后续工作，不应误判为已经完成。

### 新 session 建议最少跑的验证

```bash
pnpm run typecheck
pnpm exec vitest run \
  tests/unit-tests/services/scrape-stable-metadata-providers.spec.ts \
  tests/unit-tests/services/paper-service-create.spec.ts \
  tests/unit-tests/services/database-service.spec.ts \
  tests/unit-tests/services/file-service.spec.ts \
  tests/unit-tests/services/scrape-service.spec.ts
```

如果下一轮改动涉及图谱 / 关系逻辑，建议再补跑：

```bash
pnpm exec vitest run \
  tests/unit-tests/services/paper-relations.spec.ts \
  tests/unit-tests/renderer/paper-graph.spec.ts \
  tests/unit-tests/renderer/paper-graph-view.spec.ts
```

### 1. 准备开发环境

- 安装 Node.js 20.14+。
- 安装 pnpm。
- 安装依赖：

```bash
pnpm install
```

### 2. 以开发模式启动应用

```bash
pnpm run dev
```

这会启动 Electron 应用，并让 renderer 处于 watch 模式。

### 3. 推荐的本地测试目录

开始测试前，建议先在本机准备一个干净的本地论文库目录，例如：

```text
~/Paperlib-Test-Library/
  RL/
    Exploration/
    Reward-Shaping/
  LLM/
    Agents/
    RAG/
  Robot/
    Manipulation/
```

然后把若干 PDF 导入不同文件夹，以便验证：

- 顶层文件夹颜色家族是否正确区分（例如 RL / LLM / Robot）
- 同一颜色家族下，不同子文件夹的色阶微调是否合理
- 递归文件夹浏览行为是否正确
- 图谱节点大小与边方向是否正确

### 4. 人工测试清单

#### 文件夹结构行为

- 在 app 内创建文件夹，确认真实本地目录被创建。
- 重命名文件夹，确认真实本地目录也被重命名。
- 移动文件夹，确认真实本地目录也被移动。
- 删除空文件夹，确认真实本地目录被删除。
- 验证非空文件夹删除会被阻止，并给出明确反馈。
- 选择父文件夹时，确认会包含其所有子文件夹中的论文。
- 将论文拖入另一个文件夹后，确认其受管理的本地路径已更新。

#### 关联论文行为

- 打开某篇论文的详情面板并添加关联论文。
- 确认关联关系会在两篇论文上都显示出来。
- 删除关联关系，确认两侧都同步消失。
- 删除存在关联关系的论文，确认不会留下悬空关系。

#### 图谱视图行为

- 在 list、table、graph 视图之间切换。
- 确认 graph 视图会正确反映当前 query、搜索条件和文件夹范围。
- 确认每篇论文对应一个节点，附件不会进入图谱。
- 确认节点大小会随关联论文数量增加而变大。
- 确认边方向遵循发表时间顺序。
- 确认节点颜色按照顶层文件夹色系分组，并根据子文件夹做色阶变化。
- 确认点击、双击、悬停、缩放、平移、重置等交互都能正常工作。

#### 回归检查

- 编辑 tags，确认 tags 仍然独立于 folders 正常工作。
- 重启 app，确认 folders、relations、graph 数据仍然一致。
- 在提交代码前运行完整类型检查：

```bash
pnpm run typecheck
```

### 5. 可选的本地打包冒烟测试

如果你想验证应用在 macOS Apple Silicon 上仍能本地打包，可运行：

```bash
pnpm run build-mac-arm-dev
```

其他平台请使用 `package.json` 中对应的构建脚本。

## 捐赠

<a href="https://www.buymeacoffee.com/geoffreychen777" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="请我喝咖啡" height="41" width="174"></a>

<a href="https://www.buymeacoffee.com/geoffreychen777" target="_blank"><img src="./assets/wechat.png" alt="请我喝咖啡" height="174" width="174"></a>

## 使用演示

### 抓取 ICLR、ICML、NeurIPS 等会议论文的元数据

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/4ffc556e-ba9c-48f3-9066-0370487a90ca" style="width: 70%" />

### 与任何编辑器丝滑集成地写论文

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/fefb4e9e-7d6e-4259-b4f1-bc7109c87802" style="width: 70%" />

### 使用 LLM 总结你的论文。使用 LLM 标记你的论文

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/87040ded-dd4a-470a-bceb-73cd9d334cc3" style="width: 70%" />

### 使用标签、文件夹和智能过滤器组织你的图书馆

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/391ee552-a3be-4e16-8023-e1c57ba45481" style="width: 70%" />

### 三种视图模式

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/c8a06b1d-0dc2-4291-9f4b-d38b01e760c2" style="width: 70%" />

## 赞助商

<img src="https://user-images.githubusercontent.com/14183213/179353324-42ee9831-68a8-4816-97f5-cc7be7189ce8.png" style="width: 160px"/>

<a href="cloudflare.com"><img src="https://blog.cloudflare.com/content/images/2022/10/CF_logo_stacked_blktype.png" style="width: 160px"/></a>

<a href="https://www.digitalocean.com/">
  <img src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="160px">
</a>

## 贡献 Paperlib

### 扩展

请参考[链接](https://paperlib.app/cn/extension-doc/)了解开发文档。

### 新功能

我对任何新功能请求都持开放态度，我们可以在 issue 中讨论。

## 许可证

[GPL-3.0 许可证](./LICENSE)
