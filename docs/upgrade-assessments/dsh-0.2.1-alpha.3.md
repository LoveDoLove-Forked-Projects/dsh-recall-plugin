# dsh v0.2.1-alpha.3 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-alpha.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.3)（prerelease，2026-10-14 发布；npm dist-tag `alpha` 指向本版，`latest`/`next` 仍 0.2.0-rc.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.2.1-alpha.3` 全局实装（0.2.1-alpha.2 → 0.2.1-alpha.3，55 增 / 7 删 / 554 替换包 / 7 分钟；对照源：[dsh-0.2.1-alpha.2.md](./dsh-0.2.1-alpha.2.md)）
> 评估方式：release notes 逐条筛查 + **全树内容级 diff**（npm 清理残留 `.dsh-EBhnoWNL` 恰为 `0.2.1-alpha.2` 整包副本（513.8 MB / 29150 条目）作基线；@deepseek-ai 包集合 304 → 301，关键契约文件逐行 diff）+ **门禁实跑**（check:dsh / 单测 499 / client 92 / test:probe 52 / verify:host）+ 镜像按 tag 重拉比对
> 总结论：**首个破坏性版本——`chat.node` 图片渲染入口换代**（`ChatNodeOwnerProps.renderMessageImages` 移除，改 `renderFactorySlot` + `loadImage` 的 `conversation.chat.user.content` Factory），插件原图片重绘链在新版静默失效（用户消息图片无声空白）；**修复已落地**（运行时双分支：旧面闭包 / 新面 Factory），探针与测试同步更新；并同日完成**密钥脱敏对齐**（文本改经官方 `conversation.user.text` Factory 投影，继承 secret-mask 规则链）。其余消费面零漂移、peer 窗口无需追加（同 tuple 段天然覆盖）。

## 一、更新日志梳理与初步判断

release notes 共 40 余条（新增 / 修复 / 优化 / 调整）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果，其余合并为末行：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **chat.node 图片渲染入口换代**（release notes 未单列，全树 diff 实证；对应「用户消息渲染」重构） | 调整 | **高相关** | **破坏性 + 修复已落地**——`renderMessageImages` 移除、`conversation.message.images` 拆为 `conversation.chat.message.images` + `conversation.chat.user.images`、`ChatNodeViewProps` 追加 `PropsRenderFactories`（`renderFactorySlot`）、`loadImage` 保留；插件图片重绘改双分支（§2.4） |
| **消息中密钥/令牌识别与默认脱敏**（Web 显示层打码、可按需查看） | 新增 | **高相关**——插件覆盖 user 节点渲染 | **观察到绕过面（观察项 ①）**——新包 `dsh-client-ui-secret-mask` 经 `ctx.uiConversation.userText.register(createSecretRule())` + `conversation.user.text.node`（key=`secret`）落在官方文本投影层；插件自绘 `.dsh-recall-bubble` 不经该层，撤回节点气泡中密钥为明文（非本轮破坏，官方保护在新渲染路径不自动继承） |
| **Web 版本机 HTTP 访问支持登录 DeepSeek 账号 + 新增 `dsh-api-remote-access`（方法级访问控制）** | 新增 | **高相关**——API 访问控制 | **边界收紧（观察项 ②）**——exact Fetch 路由明确「仅 owner Peer 可达、非 owner principal 一律 403」（`ConnectionFetchHandler.fetch(request, peer)` 新增必填 peer）；本机 web/desktop（owner）零影响 |
| **插件更新/重装后旧代码热重载修复**（启用热重载时立即替换，否则提示重启 + `RestartReason`） | 修复 | 中相关——插件加载 | 零交集——`dsh-package-manifest` / `dsh-host-plugin-inventory` **零内容变化**；`ui-plugin-manager` 仅新增 restartReason 展示面（插件不消费）；插件三 slot 注册路径未动 |
| **修复切换会话 / 收起工作过程 / 发送后续消息时的空白与滚动跳动** | 修复 | 低相关——会话区渲染 | 零交集——落点 ui-chat 内部（`use-chat-scroll` / ChatFlow / `collapseTiming` 新设置），`chat.node` 契约与 keyed 注册路径未动 |
| **重启应用后部分会话无法继续 + 历史消息兼容失败修复** | 修复 | 低相关 | 零交集——落点 session-persistence / 迁移链（**该包整包零内容变化**） |
| **子智能体可配置独立 Agent Preset**（`ISessions.create` / `SessionController.create` 支持 `agentPreset`） | 优化 | 中相关——会话创建面 | 零破坏——`create` 新增**可选** `agentPreset`（纯加法）；插件 fork 链路不消费 `create`，`fork` 签名未动 |
| **`--from-default-profile` 重建已有自定义配置时会替换该配置及其插件和设置** | 调整 | 低相关 | 零交集——插件安装/挂载方式不受影响；镜像 `05-publish.md` 已同步该语义（+9 B） |
| **卸载会话存储插件时最后的会话记录可能丢失修复 / 意外退出后任务显示「任务已停止」** | 修复 | 低相关 | **正向**——事件集新增 `job/registered` / `job/settled`（jobs 结算落日志）；与 I7 的「归档必须带 `stopActivity`」护栏同域，插件策略照旧成立 |
| 其余（旧版 Git worktree 修复、凭据文件容错、Azure 改名、API Key 优先级（headless）、SDK resume、PTC in-memory、Web 终端 / 字号 / Office 指引 / 会话菜单复制 ID 等） | 混合 | 零相关 | 零交集——落点均在插件不消费的 UI / 平台 / 分发面 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-alpha.3 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm install -g @deepseek-ai/dsh@0.2.1-alpha.3` | 成功（55 增 / 7 删 / 554 替换 / 7 分钟）；`npm ls -g` 实测 `0.2.1-alpha.3` |
| `npm run test:probe`（修复前） | **1/52 红**——`renderMessageImages 是官方字段` 探针命中 I2 换代（设计预警生效） |
| `npm run test:probe`（修复 + 脱敏对齐后） | **53/53 全绿**（双面契约断言：两代入口任一在位 + 新面 `PropsRenderFactories`/`loadImage`/ui-slots `renderFactorySlot` + 文本投影 `conversation.user.text` Factory 条件钉） |
| `npm run test:client` | **93/93**（6 文件；+3 图片双面/双缺降级/文本投影用例） |
| `npm test` / `npm run typecheck` | **499/499**（39 文件）、`tsc --noEmit` 零错误 |
| `npm run build` | `lib/` 全量重建（`lib/client.js` 156915 字节，+779 B） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run check:dsh` | **全绿**——本地 `0.2.1-alpha.3` 落在既有 peer 段 `>=0.2.1-alpha.1 <0.3.0` 内（**同 tuple，无需追加**）；cordis 4.0.5-alpha.1 → 4.0.5-alpha.2 仍在 `^4.0.1 || >=4.0.5-alpha.1 <4.0.6` 内 |
| 镜像重拉 | 按 tag `dsh-v0.2.1-alpha.3` 拉取 13 源：**11 份逐字节相同、2 份差异**（差异清单见 §2.3） |

### 2.2 差异比对方法与包集合

**方法**：npm 在全量升级时把 `0.2.1-alpha.2` 的旧包内容移入 trash 目录 `.dsh-EBhnoWNL`（清理被安全删除守卫拦下、内容完整保留），直接作全树内容级 diff 基线；两树逐文件 SHA256 比对（`package.json` 归一化 version 与 `@deepseek-ai/*` 依赖版本后比对），关键契约文件再逐行 diff。

**包集合（@deepseek-ai 304 → 301）**：
- **移除 6**：`dsh-webhook`、`dsh-webhook-github`、`dsh-hook-protocol`、`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-subagent-in-process-driver`（与 alpha.2 轮「移除 6」一致的收尾清理；插件零消费）。
- **新增 3**：`dsh-api-remote-access`（方法级 Remote 访问控制 + per-Peer access snapshot）、`dsh-client-ui-secret-mask`（消息密钥显示层脱敏）、`dsh-harness-dev-context`（插件不消费）。
- 版本线：`@deepseek-ai/*` lockstep `0.2.1-alpha.2 → 0.2.1-alpha.3`；cordis `4.0.5-alpha.1 → 4.0.5-alpha.2`（在 peer 窗口内）；schemastery 未动。

**插件的零改动集合（除 lockstep 版本号 / locale / README 外无文件变化**）**：`dsh-shell`、`dsh-session-query`、`dsh-session-persistence`、`dsh-fs-local`（**整包零内容变化**）；`dsh-settings`、`dsh-sandbox-policy`、`dsh-session-projection`、`dsh-client-ui-settings-plugins`（仅 package.json + locale）；`dsh-attachment`（仅 package.json）。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-alpha.3 实装结论 | 出处 |
|---|---|---|
| 图片渲染入口（**I2，本轮破坏点**） | `ChatNodeOwnerProps.renderMessageImages` **移除**；`RenderMessageImages` 类型从 ui-conversation 导出面删除；`conversation.message.images` 拆为 `conversation.chat.message.images`（输出图）+ `conversation.chat.user.images`（用户图）；`ChatNodeViewProps & PropsRenderFactories`（`renderFactorySlot`）；`loadImage` 保留。官方 `UserMessageNodeView` 改经 `renderFactorySlot('conversation.chat.user.content', { content, loadImage, facts, interactive })` 渲染；空 `text`/`extraBlocks` 时官方 `UserContent` 只出 attachmentRow（`showBubble = text !== '' \|\| extraBlocks.length > 0`） | ui-chat/`contract/slots.d.ts` 逐行 diff + 官方 `lib/client.js` 实现 |
| 撤回按钮槽位（I1/I3/I4/I5） | `'conversation.chat.node'` SlotMap 声明未动（kind/scope/keyProps 原样）；`ChatNodeKind` 全集探针全绿（`chat-nodes.d.ts` 仅新增可选 `groupTree`，纯加法）；`node.id`/`node.key` 分离语义未动；`sessionId` kit 注入未动 | 逐行 diff + 探针 |
| fork / 队列（I6/I33/I35、G1） | `sessions.d.ts` 仅 `create` 文档 + 可选 `agentPreset`；`updateQueue` 声明处（service.d.ts/session.js）未动；`Session` 实现仅 subagent prompt requestId 变化（插件不消费） | 逐行 diff |
| 归档 / 导航（I7/I37） | `archiveSession`（含 `stopActivity`）未动；`ui-workspace` 的 `navigation.d.ts` 仅 `openWorkspace`/`connectWorkspace` 加可选 `agentPreset`、`forkSession` 签名不变；`workspace-controller` 的 follow 新增 `replace` 帧（非 owner 过滤语义，插件不消费） | 逐行 diff |
| 回填链（I34 + `refillDraft`） | `ui-conversation/contract/input.d.ts` **整文件逐字节相同**（`setDraft`/`addAttachments` 面未动）；新增 user-text 投影族（`conversation.user.text` factory / `userText` registry）为纯加法 | 整文件哈希 |
| 事件触发与 cutSeq | `KNOWN_SESSION_EVENT_TYPES` 60 → 62，**仅新增 `job/registered` / `job/settled`、零删除**；`user/message` / `turn/end` / `turn/start` / `session/title` 全在；`SESSION_FORMAT_VERSION` 仍 4 | 集合差集 + 逐行 diff |
| shell 执行接缝（I36/I38） | `dsh-shell` **整包零内容变化** | 全包 hash |
| 设置卡片与配置（I12/I39） | `dsh-settings` 仅 locale + lockstep；`ui-plugin-manager` 仅 manager-store/presentation（restartReason 展示面）；`plugins.bundle.config` / `settings.plugin.item` 注册路径未动 | 逐行 diff |
| AgentRegistry（P0-1） | `dsh-agent` 类型面零变化（仅 `lib/index.js` 实现）、`dsh-base` 的 `lib/` 零变化（组合层 `cordis.patch.yml` 新增 `remote-access` 行） | 全包 hash |
| connection / API 路由（I32） | `connection.fetch.register` 签名未动；exact 路由语义收紧（owner Peer 门禁，观察项 ②）；`dsh-client-connection` 的 `OperatorPeer` → `Peer`/`Principal` 模型重构（插件只消费 `fetch.register`） | 逐行 diff |
| `uiConversation` 服务（草稿 / 队列） | `service.d.ts`（`createDrafts`/`updateQueue` 所在）未在变更清单；`QueueDock` 仅组件签名新增 `renderFactorySlot` prop（插件不实例化该组件） | 逐行 diff |
| 镜像文档 | 13 源中 11 份逐字节相同；2 份差异——`05-publish.md`（`--from-default-profile` 改「创建或重置」，+9 B）、`11-cookbook-conversation-node.md`（`exclusive` 认领语义 + `groupTree` 行位置表，+1880 B，对应 `ConversationMatchResult.exclusive` 与 `ChatGroupTree`） | SHA256 + 逐行 diff |

### 2.4 破坏性变更与修复（I2 换代）详述

**变更内容**（ui-chat `contract/slots.d.ts` 逐行 diff）：`ChatNodeOwnerProps` 移除 `renderMessageImages: RenderMessageImages`（类型同步从 ui-conversation 导出面删除）；`conversation.message.images` slot 改名并拆分；`ChatNodeViewProps` 追加 `PropsRenderFactories`；`loadImage` 从"并存下放"升为图片入口链的一环。

**对插件的影响**：`recall-node.ts` 的 `UserRecallNode` 覆盖了官方 user/steering 节点的整块渲染，图片重绘原读 `props.renderMessageImages`（`typeof === 'function'` 守卫）→ 新版该字段恒 `undefined` → **用户消息图片静默不渲染**（文本、file 卡片、JSON 块、撤回按钮与全部执行链不受影响；无报错，与 issue #9 的失效形态同类）。

**修复（已落地）**：运行时双分支（保住 peer 全窗口 0.1.2–0.2.x 行为一致）——
- 旧面（≤0.2.1-alpha.2）：沿用 `renderMessageImages` 闭包，`{ images, align: 'end' }` 载荷不变；
- 新面（≥0.2.1-alpha.3）：`renderFactorySlot('conversation.chat.user.content', { content: { text: '', attachments: imageBlocks.map(b => ({ type: 'image', image: { attachment: b.attachment } })), extraBlocks: [] }, loadImage, interactive: false, facts: {} })`——`text: ''` + `extraBlocks: []` 保官方 `showBubble = false`，只渲染 attachmentRow（图片经拆分后的 `conversation.chat.user.images` slot 走官方 MessageImages：鉴权 / 缓存 / 重试 / 灯箱全套保留），正文仍由插件自绘 `.dsh-recall-bubble`、不重复出官方文本气泡；
- 两入口都缺（未知契约）：静默跳过（降级面不变）。

**同步更新**：`tests/probe/api-surface.test.js`（双面契约断言）、`tests/client/recall-node.test.ts`（旧面/新面/双缺三例）、`src/types/client-contract.ts`（`ChatNodeProps` 双面字段 + slot 清单备注）、`AGENTS.md` I2 行、`compat-audit.md` I2 条目、`docs/dsh-contract.md` §1.2 与沿革。

### 2.5 观察项（非阻塞）

1. ~~密钥脱敏不自动继承到插件自绘气泡（新）~~ **（已对齐，同日跟进）**：`dsh-client-ui-secret-mask` 把脱敏做成 `userText.register` 规则 + `conversation.user.text.node`（key=`secret`）渲染器，只作用于官方文本投影路径；插件自绘的 `.dsh-recall-bubble` 原本是纯字符串渲染、密钥明文。现文本行已改经 `renderFactorySlot('conversation.user.text', { text, facts: {}, interactive: false, ellipsis: false })` 渲染——`facts` 空对象令官方 whitespace 规则读不到 flag 即禁用（显示与旧面逐字一致）、引用 chip 仅在显式 wire 格式下出现，密钥脱敏规则不读 facts 照常生效；旧面（≤0.2.1-alpha.2，无 `renderFactorySlot`）保持纯字符串渲染。测试与探针同步（client 93/93、probe 53/53）。
2. **exact Fetch 路由仅 owner Peer 可达（新）**：本机 web/desktop 零影响；远程非 owner 部署（trustedHosts + 登录）下插件 13 端点全部 403——撤回 UI 可渲染但执行必败。若官方把远程访问做成主场景，需评估迁移到 Remote 方法 + remote-access 授权模型（届时 I32 复查动作同步更新）。
3. **`conversation.chat.user.content` 是内容级 Factory**：插件以"空文本 + 附件行"的形态复用它渲染图片。若未来官方要求 chat.node 贡献者不得直接渲染该 Factory（或改输入签名），图片分支需随 I2 复查动作重适配。
4. **旧面 `renderMessageImages` 分支的退场时机**：保留以覆盖 peer 全窗口（0.1.2–0.2.x）；待 0.2.1-alpha.2 及更早版本线从 peer 窗口收缩后再删。
5. **既有观察项延续**：`fork.onCreated` 未用、`appendPluginRecord` 实验接口有 verify gate、`conversation.chat.flow` 中间层若要求迁移需跟进、`sessionQuery` 三 API 仍 `@deprecated`。
6. **官方「工作过程」摘要卡明文回显用户消息（新，非插件面）**：实弹会话中出现 `The user sent an image "smoke-a3.png" with text: "…AKIAIOSFODNN7EXAMPLE…"` 的**未打码**回显（官方摘要卡渲染面）。插件气泡已按 §2.5① 对齐打码，但该面既不由插件渲染、也不在 `dsh-client-ui-secret-mask` 的规则覆盖范围内——脱敏对齐的边界是「官方 user 文本投影层 + 复用该层的插件气泡」，若用户预期全界面打码需上游扩展覆盖面。

### 2.6 活体冒烟（2026-10-15，真宿主 + 浏览器；待办②销账）

> 环境：Windows 10 ｜ dsh `0.2.1-alpha.3`（全局）｜ 插件＝工作区未发版构建（web profile 以「构建覆盖」装入 registry 2.4.10 包：`lib/client.js` 170298 B + 兼容矩阵 `package.json`，其余文件逐字节相同）｜ `dsh web --no-open --port 3080`（token URL）｜ 测试工作区 `D:\tmp\recall-h0` ｜ 手法＝agent-browser（Playwright 内核）页内 React 处理器触发 + 页内 fetch 调插件端点 + 磁盘对账。

| 验收项 | 结果 |
|---|---|
| 图片渲染（新面 Factory 分支） | **通过**——带 PNG 附件的用户消息在插件重绘气泡内渲染（`<img>` 96×96 blob，`naturalWidth/Height=96`）；点击图片弹出官方灯箱（`interactive:false` 未阻断查看）；行内 1 图 1 气泡 1 stack，`content.text=''` + `extraBlocks:[]` 的 `showBubble=false` 契约生效、**无重复官方气泡** |
| 文本投影（密钥脱敏对齐） | **通过**——文本含 `AKIAIOSFODNN7EXAMPLE` 与 `sk-abcdefghij1234567890` → 气泡渲染为 `AKIAIOSF************` / `sk-abcde***************`（官方隐藏 8 位可读、其余打码）；**插件行内零原文**（`row.innerHTML` 不含原串） |
| 撤回全链（both） | **通过**——3 条消息各出快照（tag 00:11:38 / 00:12:25 / 00:13:42）→ 改文件后撤回消息 3：面板「共 2 个文件将变更（修改 1 · 删除 1）」+ 范围 radio 二选一 → 确认：`a3.txt` 恢复、新增文件被删、安全快照 `snap-pre-rollback-1791994471867`、lineage 追加 `childId=session-5c91d82d… ← parentId=session-c1c2a210…`、原会话进归档（`workspace.json` 归档集合 8→9）、视图切子会话（3→2 行）、**子会话重绘后图片与脱敏文本仍正确**、标题继承无「 2」递增、被撤回消息回填输入框、无残留排队项、`recall-intent.json` 清零、心跳 `50696 1791994472`（PID 与宿主进程实测一致） |
| 错误面 | **通过**——`POST /api/recall/status` → `{ok:true,errors:[]}`；宿主 stderr 仅第三方 `better-sidebar` pending 与 `recall shell dialect probe: pwsh`，**无 skip/compat 行** |

> **未覆盖**：① 旧面分支（≤0.2.1-alpha.2 的 `renderMessageImages` 闭包）未活体重跑——该分支语句与已发 2.4.10 逐字相同（本轮 diff 仅把它移入 `if`），实弹需先降级 dsh；② session-only 范围与设置页三卡片不在本轮范围（本次改动未触碰）。
> **执行记录**见 [plans/completed/smoke-checklist-records.md](../plans/completed/smoke-checklist-records.md) 2026-10-15 节（含过程备忘：排队消息形态导致 cutSeq=null；本机 shell 沙箱拦截 junction 遍历故 link 模式不可用，改「构建覆盖」接入）。

## 三、结论

* **影响程度：破坏性（单点），已修复；其余零漂移。** 官方在 0.2.1-alpha.3 对 `conversation.chat.node` 的图片渲染入口做了换代（`renderMessageImages` → `renderFactorySlot` + `loadImage` 的 `conversation.chat.user.content` Factory），这是插件自 0.1.7-alpha.1（shell/settings 接缝换代）以来**第二次消费面破坏**，也是首个"官方移除既有字段"形态的破坏。插件受影响面**仅用户消息气泡中的图片渲染**（撤回按钮、preview/execute 执行链、fork、归档、回填、G1 队列清理、P0-1/P0-3 护栏、设置页三卡片全部不受影响）；修复为运行时双分支探测，已随本轮落地（探针/单测/client 测试同步更新，全部门禁恢复绿色）。
* **具体表现：** 升级到 0.2.1-alpha.3 而未修复时——插件启用后用户消息中的图片在气泡内静默消失（文本与文件卡片正常），零报错；修复后新旧版本行为一致。
* **版本策略：无需追加 peer 段。** `0.2.1-alpha.3` 与既有 `>=0.2.1-alpha.1 <0.3.0` 同 tuple，prerelease 门槛天然放行；cordis 4.0.5-alpha.2 仍在 `^4.0.1 || >=4.0.5-alpha.1 <4.0.6` 内；schemastery 未动。台账动作：`dsh.compatibility.dshReleases` 补 `0.2.1-alpha.3: compatible`、`docs/dsh-contract.md` 与 `docs/reference/README.md` 版本字段随镜像同步、镜像 2 份覆盖、compat-audit 头部核验段与 I2 重写、AGENTS.md I2 行、README 双语兼容范围与徽章（均已完成，未提交）。
* **待办（需用户拍板）**：① 是否把本轮修复 + 兼容声明发一个 patch 版本（`dshReleases` 是市场台账、不参与启动判定，不发版也能工作；但 npm 用户升级 dsh 到 alpha.3 后装旧版插件会遇图片退化）；② ~~发版前活体冒烟~~ **已于 2026-10-15 完成——真宿主 + 浏览器实弹，图片渲染 / 文本投影 / 撤回全链 / 错误面四项全过、无阻塞项（见 §2.6 与冒烟执行记录）**。**原观察项①「密钥脱敏」已于同日对齐（见 §2.5）。**
