# dsh v0.1.7-alpha.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.7-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.2)（tag commit `0010283`，2026-09-22 发布；npm dist-tag `alpha` 指向本版，`latest` 仍 0.1.5-rc.2、`next` 为 0.1.5-rc.3——与 alpha.1 同态）
> 本地基线：`npm install -g @deepseek-ai/dsh@alpha` 全局实装 0.1.7-alpha.2（旧基线 0.1.7-alpha.1；cordis 4.0.3 → 4.0.4、schemastery 3.18.3 → 3.18.4）；对照源：[dsh-0.1.7-alpha.1.md](./dsh-0.1.7-alpha.1.md)
> 评估方式：release notes 逐条筛查（体验优化 5 / 问题修复 8 / 其他变更 2）+ **全树内容级 diff 实证**（以 npm 残留的 alpha.1 整包副本为基线，对 alpha.2 实装树做 SHA256 全文件比对：277 包版本号变化、**342 个非 package.json 文件真实改动**）+ 消费面逐字签名比对 + **门禁实跑**（check:dsh 四层 / test:probe 46 例 / verify:host 装配断言 / typecheck + npm test 430 例）
> 总结论：**零破坏、无需改码**——插件全部消费面在位（契约文件字节级一致或仅注释变动），门禁全绿；仅两条观察项（`dsh-tool-jobs` 唤醒上限默认放开对 P0-1 守卫窗口的边际影响、既有死探针 I12），均不阻塞。

## 一、更新日志梳理与初步判断

release notes 中与「插件系统 / 消息处理 / API 接口」相关、需插件侧核查的条目：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **稳定会话滚动跟随 / 改善历史分页与轮次跳转 / 减少发送消息时的跳动与重复显示** | 体验优化 | 中相关——动 `dsh-api-session-controller` 与 `dsh-client-ui-chat` | **零破坏**——契约文件字节未变；实现层只有历史分页策略（`turnWindow` Turn 对齐）与客户端本地回声记账（Inbox claim watermark）两处改动，插件均不消费。详见 §2.3 |
| **重新编辑排队消息时保留换行** | 体验优化 | 中相关——队列域，插件 G1 用 `updateQueue(itemId, {kind:'remove'})` 清理陈旧排队消息 | **零破坏**——`dsh-client-ui-conversation` 仅 `QueueDock` 注释与 client 产物编辑路径改动；`QueueAction` / `updateQueue` 签名行逐字一致 |
| **修复持久 PowerShell 命令完成后仍需额外等待** | 问题修复 | 中相关——shell 执行域 | **零交集**——修复落在 `dsh-tool-pwsh-persistent`（插件不使用持久 shell 工具）；插件所用 `dsh-shell` / `dsh-pwsh-local` 字节未变，底座 `dsh-subprocess-local` 改动仅为「spill 失败进 logger」管道 |
| **修复会话停住等待输入 + 默认不再限制任务完成后连续唤醒 Agent 的次数** | 问题修复 | 中相关——agent 运行态关系到 P0-1 `agentBusy` 拦截 | **零破坏，留观察**——落点在 `dsh-tool-jobs`：`maxConsecutiveWakes` 由 `default(3)` 改为**无默认（不限）**；`dsh-agent`/`dsh-agent-loop` 的 AgentRegistry 与 `status: idle \| running` 语义字节未变。见 §三 观察项 1 |
| **修复 Web 服务重启后页面显示已连接却不再出回复** | 问题修复 | 低相关——插件 Client 用裸 `fetch('/api/recall/*')` | **零交集**——载体底座 `dsh-client-connection`（`connection` 服务 + `/api` 前缀挂载）与 `dsh-host-webserver` 字节未变 |
| **工具返回按估算 token 预算保留首尾（`maxInlineBytes` → `maxInlineTokens`）** | 其他变更 | 无 | 零交集——插件 shell 输出截断走自建 spec 的 `stdoutMaxBytes`，不读官方 spill-policy |
| **Cordis 等 vendor 包与 Node Addon System 自动依赖更新收窄为同 minor 内 patch** | 其他变更 | 低相关——依赖解析策略 | 零影响——本轮 vendor 包（cordis / cordis-plugin-loader / include / timer / group / cosmokit / schemastery）**全部只有 package.json 变化**，lib 产物逐字节相同（I39 volatile 热更链与 patch 语义不变） |
| 插件首次安装优先选可用 npm 源 | 体验优化 | 低相关 | 零交集——新增 Host 侧 `PluginRegistryProbe.fastest()`，仅插件安装选源时使用 |
| 代码块样式统一 / 长文件名越出气泡 / Excel 预览 / 语音识别 / 模型发现 / Agent Team 指引 | 体验优化 + 问题修复 | 无 | 零交集——`ui-primitives` 的 `user-text` / `CodeBlock` 改动为样式与文档注释；插件只消费 `renderMessageImages` 与 chat.node 槽位 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.1.7-alpha.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run check:dsh` | 本地已装 0.1.7-alpha.2；cordis 4.0.4 在 `^4.0.1` 内、6 个 dsh-* peer 全在 `<0.1.8` 段内；初跑两处 ⚠ 文档漂移（reference 镜像 / dsh-contract 仍记 alpha.1），本轮已同步 |
| `npm run test:probe` | **46/46 全绿**（含 3 条 fork 切点锚点、I38 shell 接缝、I39 settings 换代与 volatile 热更链） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）；方言探针回归 `pwsh`（未降级直连通道） |
| `npm run typecheck` / `npm test` | 通过 / **430/430**（34 文件）——本轮零源码改动，均为基线复核 |
| `npm run build` | 未跑（无源码改动，`lib/` 产物未动） |

### 2.2 差异比对方法与零改动集合

**方法**：npm 全局安装遗留的 alpha.1 整包副本（`@deepseek-ai/.dsh-EBhnoWNL`，560MB）恰好构成完整基线——对旧副本与新装树做**全文件 SHA256 比对**（排除 `.map`），得到本版真实改动面：**277 包版本号变化、342 个非 package.json 文件有内容差异**；再对插件消费面逐包下钻到文件级与签名级。

**零改动集合（字节级一致，仅版本元数据）**：`dsh-session`、`dsh-session-query`、`dsh-shell`、`dsh-pwsh-local`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-client-connection`、`dsh-shell-env`、`dsh-agent`、`dsh-agent-loop`、`dsh-attachment`、`dsh-attachment-local`、`dsh-api-workspace-controller`、`dsh-client-ui-slots`、`dsh-client-ui-renderer`、`dsh-client-ui-session`，以及整个 cordis vendor 栈（`cordis` 4.0.3→4.0.4、`cordis-plugin-loader` 1.0.4→1.0.5、`cordis-plugin-include` 1.0.8→1.0.9、`cordis-plugin-timer` 1.1.5→1.1.6、`cordis-plugin-group` 1.0.3→1.0.4、`cosmokit` 1.8.4→1.8.5、`schemastery` 3.18.3→3.18.4）。

→ 台账这些不变量的出处包在本版**未变动**，alpha.1 的核验结论与探针锚点原样成立：I9（sessions 内存 store）、I10（cordis inject 门禁）、I13（ModuleLoader 包裹）、I20（pwsh `-Command` 单 argv）、I28（SessionHeader 无 title）、I29（client runner guard）、I30/I39（settings 面与 volatile 链）、I31（slots.entries）、I32（不得硬依赖 webServer）、I36/I38（shell 方言与执行接缝）。

### 2.3 关键证据链逐项

| 消费点 | 0.1.7-alpha.2 实装结论 | 出处 |
|---|---|---|
| fork / 切点（I6/I33/I35） | 实现与探针锚点未动：`boundary = atSeq ?? latestCompletedPrefixBoundary(...)`、`events[boundary]?.seq !== boundary` 校验、`buildForkSeed(events, boundary)`、`inheritedEventCount: SessionLogOffset(boundary + 1)` 全绿 | `dsh-api-session-controller/lib/index.js`（Host diff 19/6 行，全在分页） |
| `updateQueue` / `readAttachment` / `QueueAction`（G1 / I34） | **签名行逐字一致**（`updateQueue(itemId, action): Promise<RemoteResult<{accepted: true}>>`、`readAttachment(attachmentId): Promise<RemoteResult<{attachment, data}>>`、`QueueAction` 含 `{kind:'remove'}`）；`createDrafts` / `releaseDraftAttachments` / `setDraft` / `addAttachments` 全在位 | `dsh-api-session-controller/lib/types/client/contract/session.d.ts`、`ui-conversation` 服务声明 |
| 历史分页 | `SessionPageRequest` 新增可选 `turnWindow{minMessages,minTurns}`、`SessionFollowRequest extends Pick<..., 'maxMessages' \| 'turnWindow'>`、`paginate()` 增 Turn 对齐、`validateFollowRequest` → `validateHistoryWindow`；只作用于官方客户端 `page`/`follow`（loadOlder/loadThrough），插件零消费 | `dsh-api-session-controller/lib/types/types.d.ts` + `lib/index.js` |
| 本地回声 / 排队行抑制 | 客户端 session 实现改回声退休时机与 Inbox claim watermark（「queued echoes 在队列接纳时退休，已终局 Chat 身份等 watermark 收尾」）——属官方 UI 乐观提交记账；插件不创建 submission，G1 仍按 item id 直删 | `dsh-api-session-controller/lib/client.js`（74/29） |
| chat.node 槽位（I1/I2/I4/I5） | **契约文件字节未变**（`ui-chat/contract/slots.d.ts`、`ui-conversation/contract/{slots,records,conversation}.d.ts`）；新增的仅是滚动钩子 `use-scroll-follow`/`use-process-scroll` 与 `use-chat-reading`/`use-chat-viewport` 调整 | 文件哈希比对 |
| 客户端模块加载器（I13） | `window.__ModuleLoader__.load({id, factory})` 注册形态**逐字在位**；新增 `importError(id)` 诊断、批量脚本传输失败重试一次、已执行脚本不重放（纯增强） | `dsh-client-modules/lib/client.js`、`lib/types/client/manifest.d.ts` |
| 插件管理页 bundle 配置（I12） | `plugins.bundle.config` 仍在（keyed/root）；`plugins.item` 标 deprecated（注释指向 `plugins.bundle.config`/`plugins.row.config`）；`ui-settings-plugins` 删 15 个内部 d.ts（该包本就不发布 slot 契约，与 0.1.6 线一致） | `dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts` |
| connection / API 路由（I32） | `connection` 服务提供包 `dsh-client-connection` 字节未变；`dsh-host-webserver` 未变 → `/api/recall/*` exact fetch 注册面稳定 | 哈希比对 |
| settings 面（I30/I39） | `dsh-settings` 仅删内部 `invariant.js/.d.ts`（导出面 `SettingsForms` 等不变）；`cordis-plugin-loader` 字节未变 → volatile 热更链与 `Fiber.entry` 形状原样 | 哈希比对 + 探针绿 |
| shell 底座（I36/I38） | `dsh-shell` / `dsh-pwsh-local` 字节未变；`dsh-subprocess-local` 仅新增 spill 失败日志管道（进程完成判定与输出收集语义未动） | 哈希比对 + diff 逐行核对 |

## 三、结论

* **影响程度：零破坏。** 本版属「体验与稳健性」版本：插件消费面的契约文件（`contract/session.d.ts`、`ui-chat`/`ui-conversation` slot 契约、`slot-contract.d.ts`、`client-modules` manifest）在 0.1.7-alpha.1 → alpha.2 之间**字节未变或仅注释变动**，实现层改动全部落在插件不消费的官方 UI 与工具层。
* **具体表现：无需改码、无功能退化。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填）、G1 陈旧排队消息清理、设置页配置卡片与快照管理均无字段/签名/语义漂移；`typecheck` + 430 单测 + 46 探针 + 装配门禁四绿。
* **版本策略**：`dshReleases` 补 `0.1.7-alpha.2: compatible`；peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖，无需新 tuple；reference 镜像按 `dsh-v0.1.7-alpha.2` tag 重拉（13 文件**零差异**，仅头部归档字段更新）。
* **观察项（非阻塞）**：
  1. **唤醒上限默认放开 × P0-1 守卫窗口**：`dsh-tool-jobs` 的 `maxConsecutiveWakes` 由 `default(3)` 改为无默认（不限），唤醒路径为 `owner.status === 'idle' && owner.followup(message)`。插件 `agentBusy` 只认 `status === 'running'`，因此「守卫看到 idle、下一拍被完成唤醒开新轮」的窗口在链式后台任务/一次性子代理场景下概率上升（原会话已归档、文件已 reset）。官方未公开「待唤醒」状态可读，本轮不改码；建议实弹项：先起后台命令或子代理任务再撤回，观察原会话是否被唤醒继续跑。
  2. **既有死探针**：`dsh-client-ui-settings-plugins/lib/types/client/slot-contract.d.ts` 自 0.1.6 线起不再发布，I12 探针一直是 `probeIf` 静默 skip（本轮核验 33 条 guard 中唯一缺席者，alpha.1 亦然）。建议后续退休该条或改锚 `plugins.*` 侧，避免「死探针绿灯」。
  3. `snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated`（与 alpha.1 相同，插件降级链已具备）。

## 四、后续动作

1. ~~全局实装 + 门禁复跑~~——已完成（§2.1）。
2. ~~归档评估 + compat-audit 头部核验段 + reference 镜像重拉 + dsh-contract / dshReleases 同步~~——本轮完成。
3. 待做（人工，可选）：§三 观察项 1 的实弹观察；观察项 2 的死探针处置。
4. 待做（清理）：已完成——全局安装遗留的 `@deepseek-ai/.dsh-EBhnoWNL`（560MB）本轮用毕后删除。
