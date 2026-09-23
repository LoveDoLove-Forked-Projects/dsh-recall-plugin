# dsh v0.1.7-rc.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.7-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)（prerelease，2026-09-23 发布；npm dist-tag `next` 指向本版，`latest` 仍 0.1.5-rc.3、`alpha` 仍 0.1.7-alpha.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.1.7-rc.1` 全局实装（0.1.7-alpha.2 → 0.1.7-rc.1）；对照源：[dsh-0.1.7-alpha.2.md](./dsh-0.1.7-alpha.2.md)
> 评估方式：release notes 逐条筛查（新增功能 19 / 体验优化 24 / 问题修复 28 / 其他变更 29，**汇总自 v0.1.5-rc.3**）+ **全树内容级 diff 实证**（升级前对 alpha.2 整包做 robocopy 快照，升级后 `git diff --no-index` 全文件比对）+ 消费面契约文件 SHA256 逐字节比对与符号级计数比对 + **门禁实跑**（check:dsh 四层 / test:probe 49 例 / verify:host 装配断言 / typecheck + npm test 430 例）
> 总结论：**零破坏、无需改码**——插件消费面的三个契约文件（`ui-chat`/`ui-conversation` 的 `slots.d.ts`、`api-session-controller` 的 `contract/session.d.ts`）**字节级未变**，`dsh-session`/`dsh-shell`/`dsh-pwsh-local`/`dsh-settings`/`dsh-agent{,-loop}`/`dsh-host-webserver`/`dsh-client-connection` 等 23 个消费包只动版本号，门禁全绿；本版唯一需插件侧注意的新机制是**启动期插件/runtime 兼容性门禁（peer 范围驱动）**，本插件 6 条 `dsh-*` peer 全部放行 rc.1，无需豁免。

## 一、更新日志梳理与初步判断

release notes 说明本版是 0.1.7 系列首个候选版本、**汇总自 v0.1.5-rc.3 以来的变更**——其中 0.1.6/0.1.7-alpha 段的大部分条目已在前序评估（[0.1.6-alpha.1](./dsh-0.1.6-alpha.1.md)、[0.1.7-alpha.1](./dsh-0.1.7-alpha.1.md)、[alpha.2](./dsh-0.1.7-alpha.2.md)）逐项排除。下表只列「与插件系统 / 消息处理 / API 接口」相关且需要插件侧核查的条目，并标注该条目属于**本轮 alpha.2→rc.1 真实增量**还是**前序已覆盖**：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **插件安装和启动会检查与当前 DSH 版本的兼容性；不兼容时说明原因，并可对确切版本授予例外** | 其他变更 | **高相关——新增启动期门禁，直接决定插件能否加载** | **零破坏，但机制确认为本版新增**——判定完全基于 `peerDependencies` 里的 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 条目（`semver.satisfies(runtime, range, { includePrerelease: true })`），与 `dsh.compatibility.dshReleases` 台账无关；本插件 6 条 peer 全部放行 0.1.7-rc.1。详见 §2.3 |
| **`SandboxProvider.confine` 和 `ShellExecutor.start` 改为可取消的异步接口，准备时间计入超时** | 其他变更 | 中相关——shell 执行域 | 零交集（**前序已覆盖**）——`dsh-shell`/`dsh-sandbox-policy`/`dsh-pwsh-local` 本版**字节未变**（仅 package.json），该换代为 alpha.1 内容，插件 `runViaExecutor` 双分支已适配（I38） |
| **设置改由当前 Profile 的插件配置保存，支持声明过的实时更新字段；旧 settings.yaml 仅尝试导入一次** | 其他变更 | 中相关——插件设置卡片与 volatile 热更链 | 零交集（**前序已覆盖**）——`dsh-settings` 本版字节未变；settings 换代是 alpha.1 内容（I39 双分支 + volatile 门槛已落地） |
| **配置热更新取消事务回滚：解析失败保留原配置，插件激活失败可能部分生效** | 其他变更 | 中相关——volatile 热更失败语义 | 零交集——`dsh-config-editor`/`cordis-plugin-loader`/`dsh-hmr` 本版均未变；插件热更链只依赖 `loader/volatile-update` 与 `Fiber.entry` 形状（探针绿） |
| **插件组合包支持按顺序加载多个 patch 文件，原有单文件写法仍可使用** | 其他变更 | 中相关——插件 `dsh.bundle.patch` 声明 | 零交集——`cordis-plugin-include` 未变；本插件仍是单文件 `cordis.patch.yml`，官方承诺「单文件写法保留」且 `DshBundleManifest.patch: string \| string[]` 未变 |
| **插件可通过 locale 数据结构声明多语言标题和描述，通过 package.json 声明图标** | 其他变更 | 低相关——插件管理页展示 | 零交集（能力增强）——不影响加载与运行；列为可选后续项（§三 观察项 5） |
| **`agent/session-start` 改为异步串行的 `agent/created`** | 其他变更 | 中相关——agent 生命周期事件 | 零交集（**前序已覆盖**）——插件只订阅 `session/event`（`dsh-session` 本版字节未变），从不订阅 agent 域事件；`agents` 面只读 `list()`（I14） |
| **弃用 Session 的同步历史读取接口 `snapshotEvents`、`eventAt`、`ownEvents`** | 其他变更 | 中相关——内存事件读取（I9） | 零交集（**前序已覆盖**）——仅标 `@deprecated` 未移除，`dsh-session` 本版字节未变，插件降级链（内存 → sessionQuery → 磁盘）不变 |
| **Session 日志升级为 V4，附批量迁移工具，兼容部分缺轮次结束记录的 V3 会话** | 其他变更 | 中相关——会话日志格式与切点 | 零交集（**前序已覆盖**）——alpha.1 已核验（V4 保留原始 message id，插件以 id 为主键、以真实 `e.seq` 推切点）；本版 `dsh-session`/`dsh-session-query`/`dsh-session-format*` 均未实质变更 |
| **仅保存在自定义事件中的附件不再自动读取或导出，插件需适配** | 其他变更 | 中相关——附件回填链（I34） | 零交集（**前序已覆盖**）——本插件**不写任何会话事件**，回填附件取自 `user/message` 内容块的 `attachment.attachmentId`，链路 `readAttachment`/`createDrafts`/`addAttachments` 契约本版字节未变 |
| **Remote 工作区文件读取统一为 `readBytes`，插件需迁移旧接口** | 其他变更 | 低相关——官方文件 API | 零交集——插件零消费官方文件读写 API（文件操作全走自建 shell 模板驱动 git） |
| **工具返回按统一估算 token 预算保留首尾（`maxInlineBytes` → `maxInlineTokens`）** | 其他变更 | 无 | 零交集——插件 shell 输出截断走自建 spec 的 `stdoutMaxBytes`，不读官方 spill-policy |
| **管理会话归档：支持置顶、筛选、恢复，并在归档运行中会话时确认受影响的任务** | 新增功能 | 中相关——`archiveSession`（I7） | 零破坏——`dsh-workspace` 本版字节未变、`ui-workspace` 客户端只有 i18n 措辞改动（「子代理」→「子智能体」），`archiveSession(sessionId, { stopActivity })`、`archivedSessionIds`、`uiWorkspace.openSession` 全部在位且符号计数逐项相等 |
| **客户端 Session 支持多实例共存，相关 API 及 slot 有变化** | 其他变更 | 中相关——`sessions.binding`/fork 面 | 零破坏（**前序已覆盖**）——0.1.6-alpha.2 内容，已改码适配（I37）；本版 `contract/session.d.ts` 字节未变，`binding`/`fork`/`readAttachment`/`updateQueue` 符号计数相等 |
| **修复重启后待处理的 Inbox 消息无法恢复** | 问题修复 | 中相关——G1 陈旧排队项清理 | 零破坏——修复落在官方 Inbox 恢复路径（`dsh-api-session-controller`），仅新增 assistant 流 settle 记账；`updateQueue(itemId, {kind:'remove'})` 契约字节未变，插件 G1 行为不受影响 |
| **稳定会话与工作过程组的滚动跟随；改善历史分页与轮次跳转；减少发送消息的瞬间跳动或重复显示** | 体验优化 | 中相关——`ui-chat`/`ui-conversation` | 零破坏——`contract/slots.d.ts` 与 `contract/snapshot.d.ts` 的 slot/节点类型面未动（后者仅多 re-export 两个工具调用阶段类型），`conversation.chat.node` 与 `renderMessageImages` 符号计数相等 |
| **工具调用在生成参数时显示准备状态（`RunningToolCall` 拆出 `preparing`/`start` 两阶段）** | 体验优化 | 中相关——`ui-conversation` 的 `records.d.ts` 契约 | 零破坏——插件不定义 `ConversationNodeDefinition`、不消费 `RunningToolCall`/`ToolCallBlock`（源码零命中），只做 `conversation.chat.node` 的视图渲染 |
| **聊天中的本地图片可直接查看和放大；图片链接悬停/键盘聚焦预览** | 新增功能 | 中相关——插件用户消息重绘走官方 `renderMessageImages` | 零破坏——`ChatNodeSeat`/`MessageItem` 的 props 契约文件未变，`renderMessageImages` 符号计数相等 |
| **新增 Agent Team 面板实时成员/任务、Team 任务看板改只读、`spawn_teammate` 统一、默认队友上限 8→16** | 新增功能 + 其他变更 | 中相关——P0-1 `agentBusy` 守卫读 `agents` 服务 | 零交集——`dsh-agent`/`dsh-agent-loop` 本版字节未变，AgentRegistry 与 `status: idle \| running` 语义不变；`dsh-experimental-agent-team*` 为非插件消费的 Team 域 |
| **长时间命令与工作流转入后台，任务面板显示实时输出，作业完成后继续唤醒所属会话** | 体验优化 | 中相关——`dsh-tool-jobs` 唤醒 × P0-1 窗口 | 零交集（**前序已观察项**）——`dsh-tool-jobs` 本版只动 package.json，前版记录的「`maxConsecutiveWakes` 无默认值」行为延续，观察项保留（§三 观察项 4） |
| **Web 部署在反向代理子路径下无法访问（修复）** | 问题修复 | 中相关——插件用绝对路径 `/api/recall/*` | 零破坏（**新场景，非回归**）——`dsh-host-webserver`/`dsh-client-connection` 本版字节未变，普通部署路径注册面不变；子路径部署下插件 API 的绝对路径假设未验证，列为观察项（§三 观察项 2） |
| **扩展文件/命令/PTC 工具以支持 SSH 远端工作区** | 新增功能 | 中相关——影子仓库假定工作区在本机 | 零破坏（**新场景**）——属新增能力，本地工作区语义不变；远端工作区下插件行为未验证，列为观察项（§三 观察项 3） |
| **插件管理页支持安装/配置/启停/运行时卸载 + 安装源选择 + 插件安装弹窗可关闭** | 新增功能 | 低相关——插件配置卡片槽位（I12） | 零破坏——`plugins.bundle.config` 在新树 4 处命中（与旧树一致）、`slot-contract.d.ts` 未变；新增的失败类型（`incompatible-version`）只在版本不兼容时出现 |
| **Office/文档预览统一缩放、Excel 工作表、LibreOffice 随装、代码块样式统一、模型页/语音转写等** | 新增功能 + 体验优化 | 无 | 零交集——改动集中在 `ui-primitives`/`ui-tool`/`sidebar-*`/语音与模型包；插件消费的 20 个 `--dsw-alias-*` 设计令牌在新树全部存在 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.1.7-rc.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run check:dsh` | 本地已装 0.1.7-rc.1；cordis 4.0.4 在 `^4.0.1` 内、6 个 dsh-* peer 全在 `<0.1.8` 段内；初跑两处 ⚠ 文档漂移（reference 镜像 / dsh-contract 仍记 alpha.2），本轮已同步 |
| `npm run test:probe` | **52/52 全绿**（基线 49 例：3 条 fork 切点锚点、I7 客户端 `stopActivity`、I38 shell 接缝、I39 settings 换代与 volatile 热更链、I12 双代面 slot 断言；**新增 3 例 I40 子路径基址探针**，见 §三 观察项 2） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）；方言探针回归 `pwsh`（未降级直连通道） |
| `npm run typecheck` / `npm test` | 通过 / **435/435**（34 文件；基线 430 例 + 新增 5 例子路径基址解析单测） |
| `npm run build` | 产物随修复更新（`lib/client.js` 112112 字节），无其余漂移 |

### 2.2 差异比对方法与零改动集合

**方法**：升级前对全局安装树 `…/npm/node_modules/@deepseek-ai/dsh`（594 MB / 27531 文件）做 robocopy 快照，升级后对新树（27571 文件）用 `git diff --no-index` 做**全文件内容级比对**（行尾不敏感）：**915 条变更 = 853 修改 + 49 新增 + 9 删除 + 4 重命名**；剔除 `package.json` 后**647 个文件有真实内容差异**，其中 320 个是 `libreoffice-kit*` 的 Office 运行时负载、14 个是 dsh 主包的 lib 产物与 README，余 313 个散落在官方 UI/工具/市场包。

**零改动集合（本版仅 package.json 版本号变化，文件内容字节级一致）**：`dsh-session`、`dsh-session-query`、`dsh-shell`、`dsh-pwsh-local`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-client-connection`、`dsh-client-modules`、`dsh-shell-env`、`dsh-agent`、`dsh-agent-loop`、`dsh-attachment`、`dsh-attachment-local`、`dsh-api-workspace-controller`、`dsh-client-ui-slots`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-settings-plugins`、`dsh-settings`、`dsh-config-editor`、`dsh-workspace`、`dsh-subprocess-local`、`dsh-tool-jobs`、`dsh-host-plugin-inventory`；整个 cordis vendor 栈（`cordis` 4.0.4 / `cordis-plugin-{loader,include,timer,group}` / `cosmokit` 1.8.5 / `schemastery` 3.18.4）**版本号与内容均未变**；官方子包总数 276 → 276（无新增/移除包）。

→ 台账这些不变量的出处包在本版**未变动**，alpha.1/alpha.2 的核验结论与探针锚点原样成立：I6/I7（fork 与归档）、I9（sessions 内存 store）、I10（cordis inject 门禁）、I13（ModuleLoader 包裹）、I14（agents 面）、I20（pwsh `-Command` 单 argv）、I28（SessionHeader 无 title）、I30/I39（settings 面与 volatile 链）、I31（slots.entries）、I32（不得硬依赖 webServer）、I34（附件链）、I36/I38（shell 方言与执行接缝）、I37（归档集合与导航）。

**消费面真改动集合（4 个包 + 1 处 i18n）**：`dsh-client-ui-chat`（15 文件）、`dsh-client-ui-conversation`（9）、`dsh-api-session-controller`（8）、`dsh-client-ui-plugin-manager`（7）、`dsh-client-ui-workspace`（1，纯措辞）。

### 2.3 关键证据链逐项

| 消费点 | 0.1.7-rc.1 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位 props（I1/I2/I4/I5） | **契约文件 SHA256 相同**：`dsh-client-ui-chat/lib/types/client/contract/slots.d.ts`、`dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`；`renderMessageImages` 与 `conversation.chat.node` 在 `lib/client.js` 的符号计数逐项相等（19/32） | 哈希比对 + 符号计数 |
| fork / 队列（I6/I33/I35、G1） | **契约文件 SHA256 相同**：`dsh-api-session-controller/lib/types/client/contract/session.d.ts`；host 侧 `lib/index.js`（fork 实现）未在变更清单内；`readAttachment`/`updateQueue`/`binding`/`fork(` 符号计数逐项相等 | 哈希比对 + 符号计数 + 探针 3 条切点锚点全绿 |
| 会话控制器客户端实现 | 变更仅两处：`sessions/session.js` 的 assistant 流退休记账（`result.retireAttemptId` → `eventSource.settleAssistant`）与 `assistant-stream.*`（工具调用 preparing 阶段）——都是官方 UI 乐观提交/流式展示账本，插件零消费 | `git diff --no-index` 逐行核对（+4/−4 行） |
| `ui-conversation` 契约语义微调 | `contract/conversation.d.ts`：`ConversationStartMatch` 由 `ConversationNodeDefinition` 生命周期注释与 `SessionEvent` 放宽到 `SessionEventLike`（瞬态事件可作 start、「当前最早的 start 初始化 State、后续 Match 一律走 update」）；`contract/records.d.ts`：`RunningToolCall` 拆为 `PreparingToolCall \| StartedToolCall` 联合（工具参数准备态） | 两份 diff 全文核对；插件源码对 `RunningToolCall`/`ToolCallBlock`/`ConversationNodeDefinition` **零命中**（只渲染 `conversation.chat.node`） |
| 归档与导航（I7/I37） | `ui-workspace` 客户端唯一改动是 `archive.confirm.subagents.*`/`status.subagentsRunning.*` 两条中文文案（「子代理」→「子智能体」）；`archiveSession`(34)/`unarchiveSession`(19)/`openSession`(4)/`stopActivity`(1)/`archivedSessionIds`(24) 符号计数在新旧树逐项相等 | 逐行 diff + 符号计数 |
| 回填链（I34） | `dsh-client-ui-conversation/lib/client.js` 的 `createDrafts`(2)/`releaseDraftAttachments`(2)/`addAttachments`(4)/`setDraft`(13) 计数相等；`dsh-attachment`/`dsh-attachment-local` 字节未变 | 符号计数 + 哈希比对 |
| 插件配置卡片（I12） | `plugins.bundle.config`(4)/`plugins.item`(6) 计数相等；`ui-plugin-manager` 的客户端 slot 契约文件不在变更清单内（真改动只在 host 侧 `lib/index.js`/`types/*`/README） | 符号计数 + 变更清单过滤 |
| 设计令牌（视觉） | 插件消费的 20 个 `--dsw-alias-*` / `--dsw-specific-bubble` 令牌在新树**全部存在**（沿 `ui-primitives`/`ui-theme`/`ui-chat` 消费），仅使用处计数微增 | 全树关键字存在性扫描 |
| 客户端模块加载（I13） | `dsh-client-modules` 字节未变（`__ModuleLoader__.load({id, factory})` 原样） | 哈希比对 |
| **插件/runtime 兼容性门禁（本版新增）** | `dsh-app-boot` 新增 `plugin-compatibility` / `profile-compatibility` / `compatibility-preflight` 三块：① 逐条取 `peerDependencies` 中名字为 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的条目，用 `semver.satisfies(runtime, range, { includePrerelease: true })` 判定；② 启动期 `prepareProfileEntries`/`prepareProfilePatches` 对不兼容行**整行禁用**（`disabled`，原生 Include 整棵拒绝），`compatibility.json` 里的**精确 `包名@版本` → DSH 版本列表**豁免可放行；③ 安装命令在 pnpm 执行前检查，拒绝码 `incompatible-version`，CLI 走 `dsh plugin allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`。**本插件实测放行**：用官方自带的 semver 7.8.5 以 `includePrerelease: true` 验证 6 条 peer 的复合区间 `>=0.1.2-alpha.1 <0.1.3 \|\| … \|\| >=0.1.7-alpha.1 <0.1.8` 对 `0.1.7-rc.1` 返回 `true` → 不需要豁免。另：全树（新旧两树）**都没有** `dshReleases` 字面量，`dsh.compatibility.dshReleases` 仍是市场/台账层声明、不是安装门禁——与本仓库既有结论一致（CHANGELOG 2.3.11） | 新增 d.ts 三份 + `dsh-app-boot/lib/index.js` 实现段 + semver 实跑 + 全树字面量扫描 |

## 三、结论

* **影响程度：零破坏。** 本版是 0.1.7 线的功能汇总版（汇总自 0.1.5-rc.3），但相对插件当前基线 alpha.2 的**真实增量**很小且全部落在插件不消费的官方 UI/工具/市场层：消费面 4 个包的真改动是「工具调用准备态阶段模型」「会话契约注释与瞬态 start 语义」「assistant 流退休记账」与插件配置管理器的 host 侧扩展，另有 1 处纯文案。
* **具体表现：无需改码、无功能退化。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填）、G1 陈旧排队消息清理、P0-1 运行中拦截、设置页配置卡片与快照管理均无字段/签名/语义漂移；三个关键契约文件字节级未变，`typecheck` + 430 单测 + 49 探针 + 装配门禁四绿。
* **版本策略**：`dshReleases` 补 `0.1.7-rc.1: compatible`（台账声明）；peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖 rc.1，**无需新 tuple**（且新兼容性门禁实测放行，不需要 profile 豁免）；reference 镜像按 `dsh-v0.1.7-rc.1` tag 重拉，13 源中仅 `11-cookbook-conversation-node.md` 有实质差异（+182 字符，即 §2.3 的瞬态 start 语义），其余 12 份逐字节相同。
* **观察项（非阻塞）**：
  1. **peer 范围从「元数据」升级为「启动硬门槛」**：新门禁让 peer 区间直接决定插件能否加载——不兼容时插件行在启动期被整行禁用（`disabled`），这比过去「装上但运行时出错」更显式，但要求插件在每条新 minor 线发布时先核验再开窗。本插件策略（按 minor 线开窗、每线以首个核验版本为下限）与门禁兼容；后续 dsh 0.1.8 线出现时若未开窗，插件将被门禁直接禁用——属预期行为，不需要改码。
  2. ~~反向代理子路径部署~~——**实弹发现真实缺陷，已修复**（2026-09-24）：官方子路径支持依赖「客户端按 `document.baseURI` 解析服务端路径」（`<base href="./">` 注入 + 前端资源相对化 + `dsh-api-gateway` 的 `streamBaseUrl ?? document.baseURI` + connection RPC 的去前导斜杠相对路由），而插件客户端写的是根绝对 `fetch('/api/recall/<name>')`。实弹（起真宿主 + 仅映射 `/dsh/*` 的反向代理）：带前缀 `POST /dsh/api/recall/status` → **200**、根绝对 `POST /api/recall/status` → **404**，即子路径部署下插件全部调用失效。修复＝`src/client/util.ts` 的 `recallApiUrl`（按文档基址解析；基址缺尾斜杠按目录补齐；无 `document`／基址非法回落原路径），Host 端零改动（代理剥前缀后宿主仍见 `/api/recall/*`）；配套 5 条单测 + 3 条探针（I40），根部署解析结果与修复前逐字等价。详见 compat-audit I40。
  3. **SSH 远端工作区（本版新增能力，未覆盖场景）**：本机实装树里没有远端 shell/文件提供方（无 `ssh`/`remote` 执行包；`dsh-host-directory-picker-auto` 中的 ssh 指「本进程经 SSH 启动」的场景判定，不是远端工作区执行器），也无 SSH 目标可实弹。静态判定：影子仓库按本机路径设计（store 落 `~/.dsh/dsh-recall-snapshots`、git 命令带 `--work-tree=<工作区绝对路径>`），远端工作区下要么路径不存在、要么快照落错机器——属**未覆盖场景（已知限制）**，不是本版回归；若后续确有远端使用需求，需按官方远端提供方语义另行设计。
  4. **既有观察项延续**：`dsh-tool-jobs` 的 `maxConsecutiveWakes` 无默认值（P0-1 `agentBusy` 守卫窗口），本版 `dsh-tool-jobs` 字节未变；`sessionQuery.snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated` 未移除。
  5. **可选增强（非必须）**：本版支持插件通过 `dsh.locale` 声明多语言标题/描述与 `package.json` 图标，插件管理页可展示；当前包仅有中文 `description`，若要面向英文用户可后续补（与本次升级无耦合）。
  6. ~~环境清理~~：全局 `@deepseek-ai/.dsh-EBhnoWNL` **已删除**（2026-09-24）——实测它是 npm 在本次 rc.1 安装时把旧 `dsh` 目录改名停放的中转副本（内容为 **alpha.2 树**、594 MB；npm 因 safe-delete 批量阈值未能自行清理），删除后 `@deepseek-ai` 下只剩 `dsh`（0.1.7-rc.1）与用户有意保留的别名包 `dsh.bak-0.1.1-rc.2`；本次升级的临时基线快照（594 MB）用毕后亦已删除。

## 四、后续动作

1. ~~全局实装 0.1.7-rc.1 + 门禁复跑~~——已完成（§2.1）。
2. ~~归档评估 + compat-audit 头部核验段 + reference 镜像重拉 + dsh-contract / dshReleases / README 徽章同步 + CHANGELOG~~——本轮完成。
3. ~~观察项 2/3/4 的实弹~~：观察项 2 **已实弹并修复**（子路径部署，见 §三 观察项 2 与 compat-audit I40）；观察项 3 已完成静态判定（无远端承载，列为已知限制，待有远端环境时再验）；观察项 4（`dsh-tool-jobs` 唤醒窗口回归）本轮未跑 UI 实弹——相关包（`dsh-workspace`/`dsh-tool-jobs`/`dsh-jobs`/`dsh-agent{,-loop}`/`dsh-api-session-controller` 契约）在 rc.1 与 alpha.2 **字节级一致**，静态等价性成立，建议按 2.4.3 实弹记录的同款路径人工复跑一次。
4. ~~清理~~——已完成（2026-09-24，用户指示）：`.dsh-EBhnoWNL`（594 MB）已删除，删除后 `dsh --version` 复核仍为 `0.1.7-rc.1`。
