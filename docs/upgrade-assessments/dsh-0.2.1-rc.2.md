# dsh v0.2.1-rc.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)（prerelease，2026-10-17 发布，commit `687f282`，9 commits / 456 files / 3 contributors）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.1-alpha.4`，按 **alpha.4 → alpha.5 → rc.1 → rc.2 全链**评估（无 rc.0）；同日已全局实装 `0.2.1-rc.2` 并补跑门禁。对照源：[dsh-0.2.1-alpha.4.md](./dsh-0.2.1-alpha.4.md)
> 评估方式：逐版 release notes 筛查 + **双 lockfile 包清单精确对比**（alpha.4 / rc.2 各在独立临时目录 `npm install --package-lock-only` 生成）+ **34 个关键包 `lib/` 逐字节哈希/diff**（registry tarball 解压 vs 本机 alpha.4 实装；只 diff `lib/`）+ **rc.2 实装门禁实跑**
> 总结论：**零破坏、零改码、无需发版**。rc.2 自身只有模型适配与 Search/Fetch API 两条新特性；跨版本风险集中在 rc.1 的汇总版 Breaking，逐条排除——插件未注册 stats、不用 `invariant` / 工具展示 `both` / Agent Team、不读凭据、走 bundle patch 与 peer 判定路径；34 包 `lib/` 仅 3 处非功能漂移，`sessions.fork` / slot 定义方 / 设置面 / 门禁全部逐字节零变更。

## 一、更新日志梳理与初步判断

**版本链路**：`0.2.1-alpha.4`(10-15) → `alpha.5`(10-16) → `rc.1`(10-17) → `rc.2`(10-17)。**rc.1 是 0.2.1 首个候选版，release notes 汇总自 v0.2.0-rc.2 以来的全部变更（含大量 Breaking）**，其中多数在 alpha.1~alpha.5 已落地；rc.2 只是其上的 9 commit 小增量（2 条新特性，无修复 / 无 Breaking / 无依赖更新）。

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **适配 DeepSeek-V4.1-Flash-1017** | 新增（rc.2） | 低相关 | 零交集——落点模型目录 + Web 显示名徽标（新增 `dsh-client-ui-deepseek-model-label-1017`），插件不消费 |
| **适配 DeepSeek Search / Fetch API**（网页搜索设置内开关，默认关） | 新增（rc.2） | 低相关 | 零交集——新增独立插件 `dsh-web-deepseek-api`，注册两个工具；与撤回链路无共享面 |
| 输入区统计扩展拆为 `activity` / `usage` 两个独立入口（旧 `stats` 整行需改注册 ID） | Breaking（rc.1 汇总） | 中相关——slot 注册面 | **零影响**——插件从未注册 `conversation.input.stats`，仅注册 `conversation.chat.node` / `settings.plugin.item` / `plugins.bundle.config` |
| 新增扩展位：用户消息、文本与图片展示、新会话页、模型选择器 | 新增（rc.1 汇总） | 中相关——可能提供新渲染入口 | 零破坏——相关 slot 在 alpha.4 即已存在（`ui-chat` / `ui-conversation` / `ui-session` lib 零漂移）；rc.2 仅新增 `conversation.input.model.label`（模型选择器内部，见 §2.3） |
| 移除运行时 `invariant` 插件及各包 `./invariant` 导出 | Breaking（rc.1 汇总） | 低相关 | 零交集——插件未使用 |
| 移除工具展示 `both` 混合模式（仅 `native` / `ptc`） | Breaking（rc.1 汇总） | 低相关 | 零交集——插件不注册工具、不涉及展示模式 |
| 子路径插件不再读取独立 `package.json` | Breaking（rc.1 汇总） | 中相关——插件清单形态 | **零影响**——本插件是 bundle patch 形态（`dsh.bundle.patch` + 顶层 manifest），且 `dsh-app-boot` / `dsh-host-plugin-inventory` **lib 零漂移**（该逻辑 alpha.4 已生效） |
| 第三方插件兼容性优先按 `engines.dsh` 判定 | Breaking（rc.1 汇总） | 高相关——加载门禁 | **零影响**——`dsh-app-boot` 零漂移；插件未声明 `engines.dsh` → 走 peer 路径，六条 peer 对 rc.2 全满足（§2.4） |
| Agent Team 消息改为直接投递目标 Inbox（移除 outbox / 重试 / 去重） | Breaking（rc.1 汇总） | 低相关 | 零交集——插件不用 Agent Team |
| API Key 读取优先级变更（headless 不读已保存密钥） | Breaking（rc.1 汇总） | 低相关 | 零交集——插件不读凭据 |
| 新增实验性 Session 状态记录接口（插件可读写自己的会话记录） | 新增（rc.1 汇总） | 低相关 | 纯加法、可选——插件现有持久化（影子 git + index.json/lineage.json）不依赖该接口 |
| 已发送消息中的密钥 / 令牌默认识别并脱敏 | 新增（rc.1 汇总） | 中相关——消息渲染 | **零威胁**——脱敏由 `dsh-client-ui-secret-mask` 挂 `conversation.user.text.node`（priority 100）在渲染层打码，不回写 session 数据；该包 alpha.4 已存在且 rc.2 零漂移，**回填 draft 仍为原文** |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-rc.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run test:probe` | **54/54 全绿**（api-surface 52 + stdin-write 2）——双面契约、slot 名、`sessions.fork` / `setDraft` 等字段假设在 rc.2 下全部成立 |
| `npm run verify:host` | **装配断言全部通过**（inject=shell,sessions,agents，端点 13 项，agents 桩访问 1 次）；stderr 的 `ensureGit: 未检测到 git CLI` 是桩环境既有告警（桩 Context 不走真实 PATH），非 rc.2 引入 |
| `npm run check:dsh` | **`✔ 全部一致`**——本地 / 镜像 / 契约三方均 `0.2.1-rc.2`；六条 `@deepseek-ai/dsh-*` peer 对 rc.2 全满足，cordis `4.0.5`、schemastery `3.18.4` 在窗口内 |
| `npm run check:upgrade` | **三层门禁全绿**（check:dsh + test:probe + verify:host） |
| 单测 / client / typecheck | **未重跑**——本轮零源码改动，沿用 2.4.12 发版结果（单测 505、client 96、typecheck 零错误） |
| `lib/` 重建 | **未重建**——零源码改动，`lib/` 与已提交产物一致 |
| 宿主启停冒烟 / 浏览器活体 | **未做**——本轮为版本适配核验，非发版前全链冒烟；最近一次全链实弹基线见 [smoke-checklist-records.md](../plans/completed/smoke-checklist-records.md) 第十二节（alpha.4） |

升级副作用：`npm install -g` 后 npm 清理旧暂存失败，留下 `@deepseek-ai/.dsh-EBhnoWNL`（702.8 MB / 63638 文件，被 safe-delete 批量阈值 500 拦下），已删除；无其他残留。

### 2.2 差异比对方法与包集合

**方法**：alpha.4 / rc.2 各在独立临时目录用 `npm install --package-lock-only @deepseek-ai/dsh@<ver>` 生成完整依赖树 lockfile（311 / 313 个 `@deepseek-ai/*` 包），按包名 + 版本集合精确对比；再对 34 个关键包从 registry 下载 rc.2 tarball 解压，与本机 alpha.4 实装做逐文件 SHA256 清单比对，只对漂移文件 `git diff --no-index`（**只 diff `lib/`**，排除实装树包内嵌套 `node_modules` 假差异）。

**包集合**：
- **无移除**；**新增 2**：`dsh-client-ui-deepseek-model-label-1017`（模型徽标）、`dsh-web-deepseek-api`（DeepSeek Search/Fetch API 插件）——均与撤回链路零交集。
- **第三方依赖零漂移**：cordis `4.0.5`、schemastery `3.18.5`、pi-ai `1.3.0` 与 alpha.4 完全一致；且实装 cordis `4.0.5-alpha.2` 与正式 `4.0.5`、schemastery `3.18.5-alpha.2` 与 `3.18.5` 的 `lib/` 逐字节相同。
- 版本线：`@deepseek-ai/dsh*` lockstep `0.2.1-alpha.4 → 0.2.1-rc.2`。

**34 个包 `lib/` 逐字节 diff 结果**——有变更 3 个，**均非功能**：
- `dsh-client-modules`：1 行——`commit` 字面量 `cc6a8f5` → `332895e`（release 指纹）；
- `dsh-cordis-client-runner`：+38 行——slot 教学目录新增 `conversation.input.model.label` 一条（纯文档数据）；
- `dsh-api-remotes`：+14/−22——仅账号 bonus 的 zod schema（新增 `title`、字段放宽为 `json`）。

**零变更 31 个**：`dsh-session`（`sessions.fork`）、`dsh-session-query`、`dsh-session-persistence`、`dsh-session-projection`、`dsh-settings`、`dsh-shell`、`dsh-host-webserver`、`dsh-workspace`、`dsh-api-gateway`、`dsh-api-session-controller`、`dsh-api-settings-controller`、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-modules`（除指纹）、`dsh-client-ui-chat`（slot 定义方）、`dsh-client-ui-conversation`、`dsh-client-ui-attachment`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-settings-plugins`、`dsh-client-ui-slots`、`dsh-client-ui-secret-mask`、`dsh-client-ui-commands`、`dsh-cordis-host-runner`（host 插件加载器）、`dsh-host-plugin-inventory`、`dsh-host-frontend-static`、`dsh-app-boot`（兼容门禁）、`dsh-plugin-manager`、`dsh-hmr`、`dsh-base`、`dsh-web-app`、`dsh-web-frontend`、`dsh-agent`、`dsh-attachment`。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-rc.2 实装结论 | 出处 |
|---|---|---|
| 撤回按钮槽位（I1/I3/I4/I5） | `conversation.chat.node` 在 slot 目录中仍在；slot 定义方 `dsh-client-ui-chat` 与渲染链 `ui-conversation` **lib 逐字节零变更** | slot 目录 + lib diff |
| 新增 slot 冲突面 | 唯一新增 `conversation.input.model.label` 由 `conversation.input.model` 挂载，与 `conversation.chat.node` 无 key / priority 竞争；插件三个注册 key 全部在目录中 | slot 目录 diff |
| fork / 队列（I6/I33/I35、G1） | `dsh-session`（`sessions.fork`）、`dsh-api-session-controller`、`dsh-session-query` **lib 零变更**；`updateQueue` 未动 | lib diff |
| 归档 / 导航（I7/I37） | `dsh-workspace` **lib 零变更**；`archiveSession` 与 `openSession` 面未动 | lib diff |
| 回填链（I34 + `refillDraft`） | `setDraft(DraftInput)` 签名与行为不变（`ui-conversation` 零变更）；`createDrafts` / `releaseDraftAttachments` / `addAttachments` 未动 | lib diff |
| 用户消息内容 / 图片渲染（I2、issue #23） | `ui-chat` / `ui-conversation` / `ui-renderer` / `ui-attachment` 零变更；`renderFactorySlot` / `loadImage` 入口未动；rc.2 未引入新的官方内容渲染入口，现有「旧面闭包在场即旧面」判据不变 | lib diff |
| 密钥脱敏与回填 | `ui-secret-mask` **零变更**且只在 `conversation.user.text.node` 渲染层打码；插件新面内容走官方 Factory 自动继承脱敏，自绘兜底保持原文；回填 draft 取 session 原文，不受影响 | lib diff + slot 挂载 |
| 设置卡片与配置（I12/I39） | `dsh-settings`、`dsh-client-ui-settings-plugins` **零变更**；`settings.plugin.item` / `plugins.bundle.config` 仍有效 | lib diff |
| shell 执行接缝（I36/I38） | `dsh-shell` **零变更**；实装 cordis 4.0.5 与 4.0.5-alpha.2 逐字节相同 | lib diff |
| connection / API 路由（I32） | `dsh-client-connection`、`dsh-api-gateway`、`dsh-host-frontend-static` **零变更** | lib diff |
| 插件宿主 / client 加载（I13） | `dsh-cordis-host-runner`、`dsh-host-plugin-inventory` 零变更；`dsh-cordis-client-runner` 仅教学数据新增；`__ModuleLoader__` / react 供给未动 | lib diff |
| 事件触发与 cutSeq | `user/message` / `turn/end` 链零相关改动（`dsh-session` lib 零变更即含事件类型表），事件集 62 种不变 | lib diff |

### 2.4 兼容性门禁与 peer 判定

`dsh-app-boot` 的 `unmetRequirements`（`engines.dsh` 优先 + 未声明回落 peer）在 rc.2 **lib 逐字节零变更**——与 alpha.4 核验的判定逻辑完全一致。

对本插件的判定路径：
- `engines` 仅 `{node:">=20"}`（无 `dsh` 键）→ **走 peer 路径**；
- 六条 `@deepseek-ai/dsh-*` peer（当前线 `>=0.2.1-alpha.1 <0.3.0`）对 runtime `0.2.1-rc.2` **全部满足**（`check:dsh` 实测；同 tuple，prerelease 门槛天然放行）；
- cordis / schemastery 不参与 `dsh[-*]` 判定，其实装版本亦在窗口内。

**策略结论不变：维持不声明 `engines.dsh`**（多段逐线窗口无法用单段等价表达；声明即短路 peer 判定并放宽未验证版本，见 I43）。

### 2.5 观察项（非阻塞）

1. **rc.1 的 Breaking 是「汇总噪声」而非新变更**：多数条目（`engines.dsh` 优先、子路径 manifest、stats 拆分、新增 slot）在 alpha.4 及更早已落地；升级评估必须按全链逐版核对，只读 rc.2 notes 或只读 rc.1 汇总都会误判。
2. **`dsh-client-ui-slots` 包形态在 alpha.4 为内联、registry 仍有独立包**：从 tarball 补测确认 alpha.4 vs rc.2 的 slots 核心逐字节相同；插件只经 `ctx.slots` 消费，不直接 import，形态变化对其透明。
3. **ReleaseChangeGate 指纹随 release 变化**（`dsh-client-modules` commit 字面量）：升级后未刷新的旧页面会暂停模块图应用 / 插件更新直到刷新——既有机制，正向加固，非本版新增。
4. **本轮未做活体冒烟**：`test:probe` 54/54 + `verify:host` 全过已实证契约与装配面；发版前仍建议按既有清单跑一次真宿主全链（撤回 / 回填 / 归档 / 队列清理）。
5. **既有观察项延续**：远程非 owner 403、`fork.onCreated` 未用、旧面 `renderMessageImages` 分支保留至 ≤0.2.1-alpha.2 线退出窗口、`conversation.chat.user.content` 为内容级 Factory。

## 三、结论

* **影响程度：零破坏、零改码、无需发版。** rc.2 自身两条新特性与撤回插件零交集；rc.1 汇总版 Breaking 逐条排除；34 个关键包 `lib/` 仅 3 处非功能漂移，`sessions.fork`、slot 定义方、设置面、shell 接缝、兼容门禁全部逐字节零变更。
* **具体表现：** 插件 2.4.12 可直接运行在 dsh 0.2.1-rc.2 上，行为与 alpha.4 一致；间接正向——命令芯片草稿恢复、会话恢复 / 切换失败修复、插件样式误删修复、插件元信息不可读不再阻断请求。
* **版本策略：无需追加 peer 段。** `0.2.1-rc.2` 与既有 `>=0.2.1-alpha.1 <0.3.0` 同 tuple；cordis / schemastery 未动。
* **台账动作（已完成）：** ① `dshReleases` 补 `0.2.1-alpha.5` / `0.2.1-rc.1` / `0.2.1-rc.2`；② `docs/reference/` 九次重拉（13 源逐字节相同，仅更新头部两字段）；③ `docs/dsh-contract.md` 对应版本与沿革 ⑩；④ `docs/compat-audit.md` rc.2 核验段；⑤ README 双语徽章 / 范围；⑥ CHANGELOG `[Unreleased]`。
