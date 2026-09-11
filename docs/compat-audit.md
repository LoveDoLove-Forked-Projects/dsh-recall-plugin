# compat 台账：官方 API 耦合点矩阵

> 本文是「一直成立的事实」规范（非计划）：把 AGENTS.md「已知坑」的散文列表升级为
> 「子系统 × 不变量 × 探针」矩阵，供 **dsh 升级后定点复查**——升级后先过本表，逐条
> 核对「出处」是否漂移，替代全文重读 AGENTS.md。AGENTS.md「已知坑」保留为一行一条
> 索引，细节住这里，避免双写漂移。
>
> 出处标注为 2026-09-01 核验（alpha.3）；每次 dsh 升级后按「复查动作」更新本节「核验日期」。
>
> **0.1.5-rc.2 核验（2026-09-11）**：**npm 已发布**（dist-tag `next` 指向 0.1.5-rc.2、`latest` 仍为 rc.1，
> `dsh-v0.1.5-rc.2` tag commit `fb2c4b9`，2026-09-10 发布），全局实装，桌面端 DSH Desktop 0.1.5-rc.2 同源。
> 三层门禁：`test:probe` 31/31 + `verify:host` 装配断言通过 + `npm test` 307/307；`check:dsh` 报镜像/契约漂移，
> 本次同步处理，8 个 peer 在 rc.2 全部在范围内。**消费面零类型 diff**：rc.1→rc.2 tag 对比（4 commits / 300 文件）
> 按消费面包 + 类型源过滤后唯一命中 `packages/client/ui-chat/src/client/chat/TurnTailNodeView.module.css`（+3 行
> 纯 CSS 间距）；`sessions.d.ts`、`slots.d.ts`、`slot-contract.d.ts` 等类型源全部未动。reference/ 镜像按 rc.2 tag
> 重拉：13 源中 12 份内容相同、11 号仅 CRLF 噪声（逐行相同）。**兼容声明同步**：`dshReleases` 矩阵补
> `0.1.5-rc.2: compatible`；peer 范围沿用按 minor 线开窗（`>=0.1.5-alpha.1 <0.1.6`）天然放行同 tuple 的 rc.2，
> 无需改 peer 串；reference/README 与 dsh-contract.md 版本字段同步至 0.1.5-rc.2。评估实证见
> upgrade-assessments/dsh-0.1.5-rc.2.md。结论：接口层面零破坏、行为层面无回归，无需改码；本版发布（2.3.12）
> 同时修复 DSH Desktop 安装校验对历史包 peer 的解析失败（见 CHANGELOG 2.3.12）。**2.3.14 追加**：0.1.5-rc.2
> 实弹暴露 `sessionQuery.readSession` 对 seeded 会话（撤回 fork 出的子会话）恒抛——子会话内撤回预览对全部
> 消息误报「该消息是本会话中第一条用户消息」（I33）；修复＝降级 `observeSession` 读取全量逻辑日志，
> 真机 API（dsh web + `/api/recall/preview`）复验通过。
>
> **0.1.5-rc.1 核验（2026-09-10）**：**npm 已发布**（dist-tag `latest` 与 `next` 指向 0.1.5-rc.1，
> `dsh-v0.1.5-rc.1` tag commit `183f08e`，2026-09-10 发布；0.1.5 系列首个候选版本，汇总自 v0.1.2-rc.1
> 以来的变更），`npm install -g @deepseek-ai/dsh@0.1.5-rc.1` 全局实装。三层门禁：`test:probe` 31/31 +
> `verify:host` 装配断言通过；`check:dsh` 报镜像/契约漂移与 peer 越界，本次同步处理。**依赖面源码零 diff**：
> tree-SHA 比对 alpha.2↔rc.1，插件消费的包（`dsh-session`、`dsh-client-ui-chat`、`dsh-client-ui-conversation`、
> `dsh-api-session-controller`、`dsh-client-ui-settings-plugins`、`dsh-settings`、`dsh-shell`、`dsh-session-query`、
> `dsh-host-webserver`、`dsh-sandbox-policy`、`cordis`、`schemastery`）目录树哈希**全部逐字节相同**——rc.1 相对
> alpha.2 是纯发布层推进（版本号 + 依赖 pin），无契约变化。reference/ 镜像按 rc.1 tag 重拉，13 源与 alpha.2
> 归档**内容零差异**（仅 11 号文件换行符 CRLF/LF 噪声，`--ignore-cr-at-eol` 比对为空）。release notes 中三项
> 开发者相关 API 调整（移除 `ctx.agent` 单数、`Inbox` 改 type-only、Web 面板 `conversation`→`main.conversation`）
> 均已在 alpha.1/alpha.2 逐项排除（见对应核验段），rc.1 无新增契约点。**兼容声明同步扩展**：package.json
> `dshReleases` 矩阵补 `0.1.5-rc.1: compatible`、7 个 peerDependencies 各补 `>=0.1.5-rc.1 <=0.1.5-rc.1` tuple；
> reference/README「归档 dsh 版本」与 dsh-contract.md「对应版本」同步至 0.1.5-rc.1。评估实证见
> upgrade-assessments/dsh-0.1.5-rc.1.md。结论：接口层面零破坏、行为层面无回归，无需改码；alpha.1 遗留观察项
> （旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟。
>
> **0.1.5-alpha.2 核验（2026-09-10）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.5-alpha.2，
> `dsh-v0.1.5-alpha.2` tag commit `b2e3b2a`，2026-09-09 发布），`npm install -g @deepseek-ai/dsh@0.1.5-alpha.2`
> 全局实装。`npm run check:upgrade` 三层门禁：`test:probe` 31/31 + `verify:host` 装配断言通过；`check:dsh`
> 报镜像/契约漂移与 peer 越界，本次同步处理。**依赖面源码零 diff**：tree-SHA 比对 alpha.1↔alpha.2，插件消费的
> 类型源（`dsh-session/lib/types/types.d.ts`、`dsh-client-ui-chat`/`dsh-client-ui-conversation` 的 `slots.d.ts`、
> `dsh-api-session-controller` 的 `sessions.d.ts`、`dsh-client-ui-settings-plugins` 的 `slot-contract.d.ts`）
> 全部未变；reference/ 镜像 13 源中仅 `09-architecture.md` 一行措辞变化（agentTeams「私有」→「公开发布」，
> 与插件零交集），其余 12 源 SHA 未动。**本次唯一需深挖项：release notes「Web 插件面板 API 调整——原 `conversation`
> Slot 迁移为 `main` 的 `conversation` key」**——实证：顶层布局槽位确已改名（`ConversationSlotProps =
> PropsRuntime<'main.conversation'>`），但插件从不注册顶层 `conversation` slot，只用 `conversation.chat.node`
> （keyed/session，路径不变）与 `settings.plugin.item`（不变）；`ctx.get('conversation')`（refillDraft 回填）
> 是**服务**访问（`InputHub`，`ctx.conversation.input`）非 slot，与被改名的槽位是两回事，不受影响。其余变更
> （Sidebar 文档预览、模型交付文件、`/feedback` 明细、pi-ai 配置、Base URL 校验、文件夹选择器、Composer 占位、
> 子代理工具指导、MCP 分页、`fs-ext` 编译修复、minimal 默认工具、设置本地化）均与撤回链路零交集。**兼容声明同步扩展**：
> package.json `dshReleases` 矩阵补 `0.1.5-alpha.2: compatible`、7 个 peerDependencies 各补 `>=0.1.5-alpha.2
> <=0.1.5-alpha.2` tuple；reference/README「归档 dsh 版本」与 dsh-contract.md「对应版本」同步至 0.1.5-alpha.2。
> 评估实证见 upgrade-assessments/dsh-0.1.5-alpha.2.md。结论：接口层面零破坏、行为层面无回归，无需改码；
> alpha.1 遗留观察项（旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟。
>
> **0.1.5-alpha.1 核验（2026-09-09）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.5-alpha.1，
> `dsh-v0.1.5-alpha.1` tag commit `5dda764`，2026-09-09 发布），`npm install -g @deepseek-ai/dsh@0.1.5-alpha.1`
> 全局实装，reference/ 镜像重拉归档（13 文件映射表未变；05/09/13 有官方文字修订——09 新增桌面应用节 +
> 系统提示词改经 `system/message` 历史传递的 agent-loop 语义细化，非 API 契约变化），`test:probe` 31/31 +
> `verify:host` 装配断言通过（check:dsh 报镜像/契约漂移与 peer 越界，本次同步处理）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 与 loadImage 并存不变；I4 node.id/key
> 语义不变；I6 fork 签名逐字一致（`sessions.d.ts`）；I7 archiveSession 路由仍在；I28 SessionHeader 仍无 title；
> I30 installSection 未回归。**本次核心变更：Session format V3**（一进两改：新增 `system/message`、
> `tool/code-dispatch*` 更名 `tool/ptc-dispatch*`、新增 `feedback/message-put`/`message-delete`，全集 51→54 种）——
> V2→V3 迁移插入 system 事件并 remap seq，但**保留原始 message id**；插件对 seq 位移免疫（读取全走官方恢复后
> 内存态、消息定位以 id 为主键、cutSeqCache 内存态不跨版本），scanCutSeq 用 `e.seq` 实际值非数组下标，天然鲁棒。
> 另两项 API 调整零交集：移除 `ctx.agent`（单数）——插件只用 `ctx.agents` 复数注册表（rg 实证零处单数引用）；
> `Inbox` 改 type-only——插件零处 `Inbox`/`hasPending`/`claim` 引用。**兼容声明同步扩展**：package.json
> `dshReleases` 矩阵补 `0.1.3-alpha.2`（修正 2.3.7 遗漏）+ `0.1.5-alpha.1`、7 个 peerDependencies 范围各补
> `>=0.1.5-alpha.1 <=0.1.5-alpha.1` tuple；`src/types/dsh-contract.ts` 事件 union 同步至 54 种（备忘面，零消费）。
> 评估实证见 upgrade-assessments/dsh-0.1.5-alpha.1.md。结论：接口层面零破坏，无需改码，升级后 `test:probe`
> 与 `verify:host` 机器化盯防继续有效；V3 迁移语义待 0.1.5 正式版发布后按本段定点复查（重点：旧 V2 会话
> 撤回切割实弹 + `assistant/attempt`/`system/message` 是否进入插件消费面）。
>
> **0.1.3-alpha.2 核验（2026-09-08）**：**npm 已发布**（dist-tag `alpha` 指向 0.1.3-alpha.2，
> `dsh-v0.1.3-alpha.2` tag commit `82a5fd6`，2026-09-07 发布），`npm install -g @deepseek-ai/dsh@0.1.3-alpha.2`
> 全局实装（依赖 dsh-settings 0.1.3-alpha.2、schemastery 3.18.2），reference/ 镜像重拉归档
> （13 文件，映射表未变；仅 09-architecture.md 官方文字修订——agent-loop 请求不可变语义、migration
> 只读 open 不发布后继/写 open 排他发布与 interrupted turn/end 补齐规则细化，非 API 契约变化），
> `npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过，
> peer 兼容声明随本次扩展见下）。重查关键产物证据链：I1/I29 guard.d.ts shadowing priority 分配不变；
> I2 renderMessageImages 与 loadImage 并存不变（0.1.3-alpha.1 下放形态延续）；I5 ChatNodeKind 全集探针
> 断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致（`fork({sessionId, atSeq?, increaseTitle?})`）；
> I7 archiveSession 路由 workspaceRegistry 仍在；I28 SessionHeader 仍无 title；I30 installSection 未回归。
> alpha.2 相对 alpha.1 **无新增契约点**（官方变更集中在 session migration 语义细化与 agent-loop 文档，
> 与插件耦合点零交集）。**兼容声明同步扩展**：package.json `dshReleases` 矩阵补
> `0.1.3-alpha.2: compatible`、7 个 peerDependencies 范围各补 tuple `|| >=0.1.3-alpha.2 <=0.1.3-alpha.2`
> （沿 2.3.4 逐 tuple OR 窗口先例；CHANGELOG 待发版 2.3.7 时补记）。结论：无插件破坏性变更，无需改码，
> 升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.3-alpha.1 核验（2026-09-07）**：**npm 未发布**（dist-tags latest 仍 0.1.2-rc.1），本地
> `dsh-v0.1.3-alpha.1` tag 源码构建（检出 `D:\workspace\DSH\deepseek-harness0.1.3-alpha.1`，
> `pnpm install` + `pnpm run build`）后 `npm link` 全局实装，reference/ 镜像重拉归档
> （13 文件，映射表未变；来源改记 tag 检出而非 master），`npm run check:upgrade` 三层门禁全绿
> （check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言通过）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 仍在、I5 ChatNodeKind
> 全集探针断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）；I7 archiveSession 路由 workspaceRegistry 仍在；
> I28 SessionHeader 仍无 title；I30 installSection 未回归。**新契约点（非漂移）**：
> ChatNodeOwnerProps 新增必填 `loadImage: MessageImageLoader` 下放（原 Omit 剔除形态撤销，插件未用、
> 仍走 renderMessageImages，消费方无破坏）；sessionQuery.readSession 增强 `inheritedEventCount`
> （读取侧可选字段）；事件集 `assistant/chunk` 移除 + `assistant/attempt` 新增（v2 迁移，插件只扫
> user/message + turn/end 零交集）；SessionHandle 为 persistence seam 内部重构不外泄。
> 结论：无插件破坏性变更，无需改码，升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.2-alpha.4 核验（2026-09-02）**：`npm install -g @deepseek-ai/dsh@alpha`
> 实装 alpha.4，reference/ 镜像重拉至 alpha.4 归档（13 文件，映射表未变），
> `npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 +
> test:probe 31/31 + verify:host 装配断言通过）。逐条抽查关键产物证据链：
> I1/I29 `dsh-cordis-client-runner/lib/types/client/guard.d.ts` register 代理仍分配
> shadowing priority（allocatePriority 签名未变）；I2 `dsh-client-ui-chat/.../slots.d.ts`
> ChatNodeOwnerProps.renderMessageImages 仍在；I4 conversation.d.ts node.id/key 语义不变；
> I6 `dsh-api-session-controller/.../sessions.d.ts` fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）；I28 SessionHeader 仍无 title
> （title 折叠自 session/title 事件）；I30 dsh-settings 仍只暴露 `installSection`
> （`installSettingsSection` 未回归）。结论：无插件破坏性变更，无需改码，
> 升级后 `test:probe` 与 `verify:host` 机器化盯防继续有效。
>
> **0.1.2-rc.1 核验（2026-09-03）**：`npm install -g @deepseek-ai/dsh@next` 实装 rc.1
> （候选发布版，相对 alpha 线代码冻结；alpha tag 已升至 alpha.5 基线），reference/ 镜像
> 重拉归档（映射表未变），`npm run check:upgrade` 三层门禁全绿（check:dsh 漂移一致 +
> test:probe 31/31 + verify:host 装配断言通过）。重查关键产物证据链：
> I1/I29 guard.d.ts shadowing priority 分配不变；I2 renderMessageImages 仍在、I5
> ChatNodeKind 全集探针断言全绿；I4 node.id/key 语义不变；I6 fork 签名逐字一致
> （`fork({sessionId, atSeq?, increaseTitle?})`）——**JSDoc 语义澄清**：cut 边界取
> `atSeq` 之后第一次 `turn/end`（at-or-after），open turn 内锚点「不可用而非向后裁剪」，
> 已写入 I6 条目与 dsh-contract §1.1（resolveCutSeq 传最近 turn/end 语义兼容，运行中
> 回合由 P0-1 agentBusy 拦截兜底）；I28 SessionHeader 仍无 title；I30 installSection 未回归。
> 结论：无插件破坏性变更，无需改码。
>
> **0.1.2-alpha.2 核验（2026-08-31）**：新增 I30（settings 辅助函数移除）；
> I1/I2/I4/I5 的 chat.node 出处均为 ui-chat 包（探针已改双包探测）；事件信封
> `ignorable` 在 alpha.2 恢复（§1.3，插件不读无影响）；其余矩阵条目复查无漂移。
>
> **0.1.2-alpha.3 核验（2026-09-01）**：对照官方 release（117 commit）逐条评估，
> 本版本无插件破坏性变更——
> 1. **移除 SQLite Session 持久化后端**（`refactor(session)!`，breaking）为存储层裁剪：
>    删除 `dsh-session-persistence-sqlite`，仅留 JSONL provider；插件走 `ctx.sessions`
>    服务契约面（fork/open/search/list），不依赖持久化后端实现，**契约未漂移**。
>    I6 已对照 alpha.3 `session-controller/contract/sessions.ts` 核对，`ISessions.fork`
>    签名逐字一致（`fork({sessionId, atSeq?, increaseTitle?})`）。
> 2. **图片可靠投递**（steer/follow-up 图片）：仅把 `SubagentPromptRequest.content`
>    类型迁至 `dsh-attachment`（`PromptContentPart[]`），不触及插件的 chat.node slot、
>    `renderMessageImages`、fork。I1/I2/I4/I5 复查无漂移。
> 3. 其余（导航预览/渲染优化/权限文案/read_image/Tab 补全/断连误判/标题窄视口）均为
>    UI 与工具层，与插件耦合点无关。
> 结论：无需改码；升级后仍跑 `npm run check:dsh` + `npm run test:probe` 机器化钉住。
>
> **0.1.2-alpha.3 本地实装核验（2026-09-01）**：全局 dsh 已实装 alpha.3
> （`npm install -g @deepseek-ai/dsh@alpha`），reference/ 镜像已重拉至
> alpha.3 归档——官方 docs/ 目录重构后源路径迁移（如
> `docs/develop/basic/*` → `docs/user/develop/basic/*`、
> 11 号文件并入 `docs/subsystems/conversation.zh.md`），映射表已写入
> reference/README.md「更新方式」。实机验证：
> 1. `npm run test:probe` 17/17 绿——fork 签名（I6）、renderMessageImages（I2）、
>    SessionHeader 负向断言（I28）、stdin 字节保真（I27）官方字段假设无漂移；
> 2. `npm run verify:host` 装配门禁绿——inject 声明/12 端点/installSection
>    兼容分支（I30 在 alpha.3 导出面未再变）；
> 3. `npm test` 285/285 绿；`npm run check:dsh` 漂移一致安静退出。
> 结论：I1–I30 逐条复查无新增漂移，无需改码（09-architecture.md 新镜像仍写
> `fork(source, boundary?, childSessionId?)`，经 .d.ts 实机核验为文档示意写法而非
> 另一签名——唯一契约是对象形态 `fork({sessionId, atSeq?, increaseTitle?})`，见 I6）。
>
> **复查方式增强（2026-09-01）**：针对「确认未变」类复查动作缺证据链的审查结论
> （实证漏检：I5 的 context 键 0.1.2-alpha.1 已新增但探针零感知；I1 priority 语义与
> I29 的 guard 强制覆盖事实脱节），完成三项增强：
> 1. I1/I3/I4/I5/I7/I9/I12/I18/I20 的复查动作全部补官方产物证据链（读哪个包哪个
>    文件、断言哪个字段/语义），I1 与 I29 对齐，I5 补「context 已评估无害」结论；
> 2. 新增负向探针：I5 的 ConversationNode kind 全集断言（官方新增 kind 即红，逼人
>    评估是否需覆盖）、I6 的 atSeq/increaseTitle 严格可选断言（变必填即红）；
> 3. 新增 `npm run check:upgrade` 一键门禁：串联 check:dsh + test:probe +
>    verify:host，dsh 升级后一条命令全跑，并提示在本文头部追加核验记录。
>
> **PR #13 合并收尾（2026-09-01）**：合并外部贡献的两项修复（dsh-turn-fold 槽位
> priority 动态避让 + POSIX diff awk 多余点号），新增 I31（slots.entries /
> inject 回调时机 / StoredEntry 形状的新调用点）并补 api-surface 双包探针；
> CHANGELOG Unreleased 补记 awk 条目。矩阵其余无漂移。

## 矩阵

### I1 conversation.chat.node keyed slot：负值 priority + 冲突递减重试
- **依赖的官方行为**：keyed slot（key=`user`）不指定 priority 会因与默认渲染器同 key
  冲突而拒载整个插件；负值 priority 覆盖默认实现。
- **出处**：slot 注册契约（0.1.2-alpha.1 迁包：`dsh-client-ui-chat` 的 contract/slots.d.ts；0.1.1-rc.2 在 `dsh-client-ui-conversation`，声明内容逐字段一致）+ `dsh-cordis-client-runner/lib/types/client/guard.d.ts`（0.1.2 起 register 代理强制分配 shadowing priority，见 I29）。
- **探针/单测**：`tests/probe/api-surface.test.js`（guard 的 allocatePriority/shadowing 断言）+ 冒烟「撤回按钮出现」覆盖。
- **失效症状**：插件白屏/整体拒载，或撤回按钮不渲染。
- **复查动作**：读 `dsh-cordis-client-runner/lib/types/client/guard.d.ts` 确认 register
  代理仍强制分配 shadowing priority（「later registrations sort first」）——0.1.2 起
  插件传入的 priority 被覆盖（I29 实证），app.js 的负值递减重试循环因此失效但无害
  （插件注册晚于官方默认渲染器，shadowing 排序后仍排前、等效覆盖默认实现）；若官方改回
  尊重插件 priority 值，可恢复重试循环原始语义。`['user','steering']` 两 key 仍独立注册
  （kind 集合由 I5 探针盯防）。

### I2 chat.node props：renderMessageImages 为图片渲染入口（0.1.3 起 loadImage 下放）
- **依赖的官方行为**：`renderMessageImages({ images: [{attachment}], align })` 是图片
  渲染入口；`loadImage` 在 0.1.2-alpha.1 被 `Omit<MessageImagesOwnerProps,'loadImage'>`
  明确剔除，**0.1.3-alpha.1 起作为必填 `loadImage: MessageImageLoader` 直接下放**
  （session 授权图片加载器，供 chat-node 渲染附件展示槽用）。插件撤回重绘仍只走
  `renderMessageImages`，读 `loadImage` 属误用。
- **出处**：`dsh-client-ui-chat/lib/types/client/contract/slots.d.ts`（ChatNodeOwnerProps；
  0.1.3-alpha.1 实证 `loadImage: MessageImageLoader` 与 `renderMessageImages` 并存、
  Omit 剔除形态撤销；ui-conversation 构建产物仍保留历史 Omit 类型命名）。
- **探针/单测**：`tests/probe/api-surface.test.js`（renderMessageImages 存在 + Omit 整型匹配；
  0.1.3-alpha.1 产物下仍全绿——Omit 类型在 ui-conversation 产物中以历史形态保留）。
- **失效症状**：图片永久无声空白（issue #9：读不存在的 loadImage，守卫 return，零报错）。
- **复查动作**：重跑 test:probe；确认 images 仍传 image 块数组（非裸 attachment）；
  若未来去掉历史 Omit 类型导致探针红，改为断言 loadImage 下放形态即可。

### I3 session-scope slot props 合成：props.sessionId 由 kit 注入
- **依赖的官方行为**：`props = {...kit, ...injected, ...slotInjected.props, ...ownerProps}`，
  kit 注入 `sessionId/useSession/useSessions/useWorkspaces/useProjection`；owner 同名覆盖 kit。
- **出处**：`dsh-client-ui-renderer` standardProps/renderEntry（构建产物）。
- **探针/单测**：`tests/probe/api-surface.test.js`（standardProps/renderEntry 存在性断言）+ UserRecallNode 读取 `props.sessionId`/`props.renderMessageImages`。
- **失效症状**：撤回按钮按 `sessionId` 查询失效（按钮出现但快照查询错会话）。
- **复查动作**：读 `dsh-client-ui-renderer/lib/client.js` 的 `standardProps`（L549）与
  `renderEntry`（L650）——确认合成顺序仍为 `{...kit, ...injected, ...slotInjected.props,
  ...ownerProps}`：kit 最先展开（sessionId/useSession 等 kit 注入项仍在）、ownerProps
  同名覆盖 kit 的语义未变。

### I4 消息节点 id：node.id 是快照主键，node.key 是位置键
- **依赖的官方行为**：`node.id` 是真实消息 ID；`node.key` 是位置键（如 `13:input`）。
- **出处**：`dsh-client-ui-chat` ChatNode 类型（0.1.2-alpha.1 迁入，`node.id`/`node.key` 语义不变）。
- **探针/单测**：`tests/probe/api-surface.test.js`（ConversationViewNode 同时声明 id/key）+ 冒烟「撤回 → 文件恢复正确」覆盖。
- **失效症状**：快照查询永远 miss，撤回按钮永不出现或撤回错消息。
- **复查动作**：读 `dsh-client-ui-conversation/lib/types/client/contract/conversation.d.ts`
  L94-100 `ConversationViewNode`——`id`（消息 ID）与 `key`（位置键）两字段仍存在且分离；
  `dsh-client-ui-chat` 的 ChatNode 仍继承该接口（chat-nodes.d.ts L3-8）。

### I5 chat.node keyed key 与 UI 投影 kind 对齐（user + steering）
- **依赖的官方行为**：agent 运行中插入的转向指令投影为 `steering`（非 `user`），存储层
  `role` 恒 user；只注册 `key:'user'` 时 steering 节点落到官方默认渲染、撤回按钮缺失。
- **出处**：`dsh-client-ui-chat` 投影 kind 定义（0.1.2-alpha.1 迁入；完整 ChatNodeKind 全集见 dsh-contract.md §1.1，含新增 `context` 键）。
- **探针/单测**：`tests/probe/api-surface.test.js`（ConversationNode kind 全集负向断言：
  官方新增 kind 即红，逼人评估是否需覆盖）+ 冒烟「agent 运行中转向指令带撤回按钮」覆盖。
- **失效症状**：转向指令消息无撤回按钮（静默缺失）。
- **复查动作**：跑 test:probe 的 kind 集合断言。现状 kind 全集 11 个（user/assistant/
  steering/context/model-retry/turn-error/turn-max-tokens/tool-result/command/
  compaction/unknown，`dsh-client-ui-conversation/lib/types/client/contract/records.d.ts`
  L248 ConversationNode）——其中 `context`（官方 0.1.2-alpha.1 新增）已评估**无害**：
  context 注入行不需要撤回按钮，落官方默认渲染即可，无需注册 key；其余 kind 同理
  （assistant/tool 等是助手侧内容）。只有 user/steering 是「用户气泡」形态需覆盖。

### I6 sessions.fork：不传 increaseTitle（标题「xxx 2」回归钉）
- **依赖的官方行为**：`fork({ sessionId, atSeq?, increaseTitle? }) → Promise<SessionId>`；
  `increaseTitle` 会把子会话标题改为「xxx 2」并递增。
- **出处**：`dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` L97
  （0.1.2-alpha.1 由 `dsh-client-runtime` 迁入该新包；fork 签名与 0.1.1-rc.2 逐字段一致）。
- **探针/单测**：`tests/probe/api-surface.test.js`（fork 双包探测 + atSeq/increaseTitle 严格可选负向断言）。
- **失效症状**：撤回后标题变「xxx 2」且多次撤回递增。
- **复查动作**：确认 fork 签名未变、increaseTitle 仍可选；本项目仍不传它。另注：
  docs/reference/09-architecture.md「新行为归属位置」表写
  `ctx.sessions.fork(source, boundary?, childSessionId?)`（2026-09-01 镜像）——
  **是文档的示意写法，不是另一个签名**：alpha.3 实装
  `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` L94-98 的
  `ISessions.fork(opts: {sessionId, atSeq?, increaseTitle?})` 是唯一契约（JSDoc 明示
  opts 即 source session id / anchoring cut 的 event seq / 标题递增开关），文档的
  第三个参数 `childSessionId?` 在契约中不存在；Host 侧 `dsh-session` 只有
  `CreateSessionOptions.seed`（种子回放），无 fork 方法。本项目撤回走
  `fork({ sessionId, atSeq })` 对象形态（src/client/recall-node.ts），与契约逐字
  匹配，探针钉住。

  **0.1.2-rc.1 语义澄清（2026-09-03）**：JSDoc 明示 cut 边界语义——boundary 是
  `atSeq` 处或之后第一次 `turn/end`（at-or-after），且当锚点在 open turn 内时
  「不可用而非向后裁剪」（fork 决议失败而非改绑前一个 turn/end）。与插件
  `resolveCutSeq`（取目标消息之前最近一次 turn/end 的 seq 传入）语义兼容：
  传的 seq 本身即 turn/end 则 at-or-after 命中同一点；唯一差异场景是目标消息
  位于运行中的回合内（无已闭合 turn/end）——官方拒绝 fork 而非裁剪，P0-1
  agentBusy 拦截已挡运行中撤回，实际触发面小。签名与探针零变化，无需改码。

### I7 archiveSession 语义：归档 = 从分组表面隐藏（F1 lineage 链断裂根因）
- **依赖的官方行为**：`archiveSession(sessionId)` 把会话移入 registry-global set，
  **hidden from grouping surfaces**（日志与记账槽保留）。
- **出处**：`dsh-api-workspace-controller/lib/types/client/contract/`（0.1.2-alpha.1 由
  `dsh-client-runtime` 迁入该新包）。
- **探针/单测**：`tests/probe/api-surface.test.js`（archiveSession Remote 方法存在 + workspaceRegistry 路由）；F1 用 Host 记录 fork lineage 绕过该限制。
- **失效症状**：纯 client 侧从 sessions.list 读不到已归档中间版本的 parentId。
- **复查动作**：读 `dsh-api-workspace-controller/lib/index.js` L279-282——`archiveSession`
  方法仍存在且路由到 `workspaceRegistry.archiveSession`（归档 = 从分组表面隐藏、日志与
  记账槽保留）；若官方改为可列举或删除该方法，F1 的 lineage 链记录可相应简化。

### I8 sessionQuery.listSessions：会话 id 在 header.id
- **依赖的官方行为**：listSessions 记录形如 `{header, live, persisted}`，会话 id 在
  `header.id`；顶层 `record.id` 恒 undefined。
- **出处**：`dsh-session-query/lib/types/corpus.d.ts`（`header: SessionHeader`）。
- **探针/单测**：`tests/probe/api-surface.test.js`（header: SessionHeader + listSessions + SessionRecord 顶层无 id 负向断言）。
- **失效症状**：预热重建的孤儿快照 sessionId 记空，树形管理落「已删除会话」。
- **复查动作**：确认 SessionRecord.header 结构未变。

### I9 冷启动 sessions.list() 为空：exclude 枚举须叠加 home 容器磁盘兜底
- **依赖的官方行为**：`ctx.sessions.list()` 是纯内存 Map，冷启动惰性载入常为空。
- **出处**：官方部分 = `dsh-session/lib/index.js`（SessionStore 纯内存 Map，L1480-1481）；项目部分 = `resolveHomeContainer` 磁盘兜底（src/host/store.ts，**非官方耦合**——dsh 升级复查不涉及，改 store 代码时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（SessionStore 服务名 + 内存 Map 形态断言）+ 冒烟「冷启动设置页可见排除配置」覆盖。
- **失效症状**：设置页误报「尚未创建快照存储」，exclude 编辑不可见。
- **复查动作**：读 `dsh-session/lib/index.js` L1480-1481 `SessionStore`——`store` 仍是
  纯内存 Map（注释明示「Persistence is intentionally not implemented here」）、`list()`
  （L1723）仍同步返回该 Map；冷启动为空、依赖持久化插件经 `session/event` 重放填充的
  语义未变。`resolveHomeContainer` 磁盘兜底路径（本项目 src/host/store.ts）仍有效。

### I10 cordis inject 门禁：ctx.<service> 必须在 inject 声明
- **依赖的官方行为**：cordis 4 要求服务在插件 `inject` 声明才可经 `ctx.xxx` 访问，漏声明
  抛 `cannot get property "xxx" without inject`，被守卫式 try 吞掉后静默 fail-open。
- **出处**：`dsh/node_modules/@deepseek-ai/cordis/lib/index.js`（ReflectService handler）。
- **探针/单测**：`scripts/verify-host.mjs`（真实 Context apply 不抛 = inject 完整）。
- **失效症状**：如 agentBusy 恒返回「不忙」、撤回防护失效（P0-1 实证）。
- **复查动作**：新增 `ctx.<服务>` 调用点同步加进 `inject`；verify:host 变红即修。

### I11 Host import @deepseek-ai/* 按模块真实路径解析（junction）
- **依赖的官方行为**：npm/git 安装走 profile 树（hoisted）；link: 开发安装走工作区，
  须自备 `node_modules/@deepseek-ai/{schemastery,dsh-settings}` junction。
- **出处**：ESM 无全局 node_modules 回退；AGENTS.md「开发与验证」节 junction 重建命令。
- **探针/单测**：`verify:host` / `npm test` 能 import 即通过。
- **失效症状**：`ERR_MODULE_NOT_FOUND`（1.6.0 实证）。
- **复查动作**：link 模式开发前确认 junction 存在；丢失按 AGENTS.md 命令重建。

### I12 settings.plugin.item 按 namespace 交集分发
- **依赖的官方行为**：`settings.plugin.item` 是 root 级 keyed slot，按 settings namespace
  作为 entryKey 分发；卡片 key 必须与 Host namespace（`dsh-recall`）一致。
- **出处**：`dsh-client-ui-settings-plugins` configurable 标签页声明。
- **探针/单测**：`tests/probe/api-surface.test.js`（settings.plugin.item 仍为 keyed + root）+ 冒烟「设置页撤回卡片出现」覆盖。
- **失效症状**：设置卡片永不渲染（key 不匹配，静默）。
- **复查动作**：读 `dsh-client-ui-settings-plugins/lib/types/client/slot-contract.d.ts`——
  `settings.plugin.item` 仍是 `kind:'keyed'; scope:'root'`、按 settings namespace 作为
  key 分发（「Keying on the namespace is what lets a plugin … the tab pairs the two」）；
  卡片 key 与 Host namespace（`dsh-recall`）一致的分发约定未变。

### I13 ModuleLoader：单文件 CJS factory 包裹（R1 路线 B 依据）
- **依赖的官方行为**：插件 bundle 由 `serveBundle` 原文 serve 为 `text/javascript`，浏览器
  以 classic `<script>` 执行；factory 的 `require(spec)` 只按「包名」粒度解析（seed →
  loadCache → 已注册 factory），不认相对路径，未命中 throw（bundle purity gate）。
- **出处**：`dsh-client-modules/lib/index.js` L212（`window.__ModuleLoader__`）、
  serveBundle、`dsh-client-modules/lib/client.js` makeRequire（miss 分支）——
  注意两处 `lib/client.js` 不要混淆：前者是官方包内文件，后者是本仓库的构建产物
  （A8 澄清）。
- **探针/单测**：`scripts/build-client.mjs` 产物断言（factory(require) 包裹 + 无顶层 import）。
- **失效症状**：ESM 多文件相对 import → 顶层 import SyntaxError 拒载（白屏）。
- **复查动作**：dsh 升级后确认 loader 仍为「单文件 CJS table」；若支持 ESM 多文件，
  R1 可换路线 A。

### I14 pwsh 对 native 非零退出不抛：关键命令显式查 $LASTEXITCODE
- **依赖的官方行为**：PowerShell 的 `$ErrorActionPreference` 不作用于 native 命令，非零
  退出码不抛；不显式检查会「旧索引/空树假成功」。
- **出处**：`src/host/scripts.pwsh.ts`（snapshot/diff/rollback/rescue 模板的显式 throw）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（模板结构断言）。
- **失效症状**：空树假成功（1.7.0 实证）。
- **复查动作**：新增 pwsh native 命令模板时维持 `$LASTEXITCODE` 检查。

### I15 runShell 失败兜底：g='<store.git>' 赋值约定 + RECALL_CLEANUP 哨兵
- **依赖的官方行为**：runShell 失败路径从脚本文本提取 `g='<store.git>'` 清孤儿进程与
  stale 锁；清扫脚本带 `RECALL_CLEANUP` 哨兵防递归。
- **出处**：`src/host/store.ts` extractGitDir / cleanupAfterGitFailure（**非官方耦合**：项目内约定，dsh 升级复查不涉及；改 runShell 失败兜底时复核）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（STORE_SCRIPTS 的 g= 约定 + 哨兵）。
- **失效症状**：孤儿 git 持锁 30+ 分钟；清扫脚本自递归。
- **复查动作**：新增带 store 脚本模板必须维持 g= 赋值；scripts-contract 变红即修。

### I16 POSIX while 循环体禁用 cond && cmd
- **依赖的官方行为**：`set -e` 下 `cond && cmd` 条件为假时整条管道退出码 1，杀脚本。
- **出处**：`src/host/scripts.posix.ts`（snapshotScript 的 if/fi 用法）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（结构断言，间接）。
- **失效症状**：快照脚本在「无跳过」路径整条退出码 1、set -e 杀脚本。
- **复查动作**：新增 posix while 循环体一律 if/fi；不回归 cond && cmd。

### I17 git init <dir>：repo 与 git 是两个路径概念
- **依赖的官方行为**：`git init <dir>` 把真实 git-dir 建在 `<dir>/.git`。
- **出处**：`src/host/store.ts` makeStore（repo=dir/git、git=dir/git/.git）。
- **探针/单测**：无直接探针；冒烟「中文路径工作区快照/撤回」覆盖。
- **失效症状**：脚本 `--git-dir` 指向错误路径，快照/回退全失败。
- **复查动作**：git init 语义为 git 固有行为，无 dsh 升级风险；改 store 布局时复核。

### I18 子进程不继承 DSH_HOME：POSIX home 探测三档回退
- **依赖的官方行为**：DSH bash 执行器洗刷子进程 DSH_* 变量，用户导出的 DSH_HOME 在
  bash 里通常不可见。
- **出处**：官方部分 = `dsh-shell-env/lib/index.js`（DSH_ENV_PREFIX 注册表 + RESERVED_BASH_ENV_KEYS 含 DSH_HOME_ENV）；项目部分 = `src/host/store.ts` posixHomeBaseResolve（**非官方耦合**，改 store 代码时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（DSH_ENV_PREFIX / RESERVED_BASH_ENV_KEYS / DSH_HOME_ENV 断言）+ 冒烟「POSIX 下快照存对 home」覆盖。
- **失效症状**：快照存错 home 目录（或降级到项目内）。
- **复查动作**：读 `dsh-shell-env/lib/index.js`——`DSH_ENV_PREFIX` 注册表与
  `RESERVED_BASH_ENV_KEYS`（含 `DSH_HOME_ENV`）机制未变：模型侧 shell 工具的 DSH_*
  变量由该注册表统一产出，用户随意导出的 DSH_HOME 不可见；三档回退顺序仍正确；第三档
  落点为 `homedir/.dsh`（I24，勿回退成裸 homedir）。

### I19 快照索引两段式补全：manage list 字段补全 + messageTexts null 缓存
- **依赖的官方行为**：`sessionQuery.readSession` 冷读整日志解压很贵（10 秒级），快照管理
  列表首屏不等冷标题/消息文本，由 client 异步二次请求补齐。
- **出处**：`src/host/index.ts` manage titles/messages 端点 + `lib/client.js`（src/client 构建产物）两段式（**非官方耦合**：项目内时序约定，dsh 升级复查不涉及；改 manage 端点时复核）。
- **探针/单测**：`tests/unit/client-pure.test.js`（buildTree）+ 冒烟「树形展开见标题/消息」。
- **失效症状**：冷会话标题/消息永不补齐，或无文本消息每次刷新重复解压冷日志。
- **复查动作**：确认 readSession 契约未变；messageTexts null 也缓存（避免重复冷读）。

### I20 批量删 tag 分块（每 100）：win32 命令行 32767 上限
- **依赖的官方行为**：DSH pwsh 执行器把命令串作为 `-Command` 单个 argv 元素 spawn，Windows
  命令行 32767 字符上限。
- **出处**：官方部分 = `dsh-pwsh-local/lib/index.js`（命令串作为单个 argv 元素传 `-Command`）；项目部分 = `src/host/index.ts` deleteSnapshotsByFilter / `src/host/maintenance.ts` purgeSession 分块实现（**非官方耦合**，改批量命令时复核）。
- **探针/单测**：`tests/probe/api-surface.test.js`（-Command 单 argv 断言）+ 冒烟「长历史工作区批量删除」覆盖。
- **失效症状**：长历史工作区批量删 tag spawn 失败。
- **复查动作**：读 `dsh-pwsh-local/lib/index.js` L75-78——命令串仍作为**单个 argv 元素**
  传给 `-Command`（无中间 shell、无 shell-quoting 层），Windows 命令行 32767 字符上限的
  生效前提未变；新增批量命令时维持分块（每 100，见本条目依赖行为）。

### I21 ps1 测试文件带 BOM（PS 5.1 无 BOM 按 ANSI 解析）
- **依赖的官方行为**：Windows PowerShell 5.1 对无 BOM 的 .ps1 按 ANSI(GBK) 解析，中文路径乱码。
- **出处**：AGENTS.md 已知坑；真实链路（argv 直传 + UTF8_PRELUDE）不受影响。
- **探针/单测**：无（测试文件约定）。
- **失效症状**：手写 .ps1 测试里中文路径乱码。
- **复查动作**：新增 .ps1 测试文件必须带 BOM。

### I22 Client 查 snapshot-info 前必须等 ensureInit 回调
- **依赖的官方行为**：Host 端 init 要跑数条 shell（建仓/loadIndex），是异步预热；快照捕获
  也是异步的。client 侧「单槽缓存 init promise + 有界轮询」是自有时序约定（非官方字段）。
- **出处**：`src/client/util.ts` ensureInit / `src/client/recall-node.ts` UserRecallNode 轮询（**非官方耦合**：项目自有时序约定，dsh 升级复查不涉及；改 client 轮询时复核）。
- **探针/单测**：无直接探针；冒烟「冷启动撤回按钮出现」覆盖。
- **失效症状**：冷启动误判 `has:false` 且不重试，撤回按钮永不出现。
- **复查动作**：确认 init 仍为每会话一次的异步预热；轮询窗口/次数与快照耗时匹配。

### I23 manage list 同 id 去重须字段补全（磁盘先占位、内存后补）
- **依赖的官方行为**：快照列表是「磁盘 dump + 内存缓存」并集，同一 id 可能磁盘先占位
  （root 缺失）、内存后补全；按「首次命中即丢弃」会让节点落「未知工作区」。
- **出处**：`src/host/index.ts` manage list 的 push 补全逻辑 / collectAllSnapshotRecords（**非官方耦合**：项目内并集去重实现，dsh 升级复查不涉及；改 manage list 时复核）。
- **探针/单测**：无直接探针；冒烟「跨工作区快照树形归组正确」覆盖。
- **失效症状**：树形一级节点落「未知工作区」，批量删除按工作区/会话匹配不到。
- **复查动作**：确认 store 目录仍是 root 的单向哈希（磁盘反查 root 依赖 root.txt/index）。

### I24 POSIX home 三级回退第三档缺失 .dsh 子目录（issue #11 修复）
- **依赖的官方行为**：win32 第三档是 `Join-Path USERPROFILE .dsh`；POSIX 版曾直接用
  裸 `os.homedir()`，两平台第三档布局不一致，快照落 `~/dsh-recall-snapshots` 而非
  `~/.dsh/dsh-recall-snapshots`（issue #11 截图实证）。
- **出处**：`src/host/store.ts` selectPosixHomeBase / resolvePosixHomeBase（第三档补 `/.dsh`
  + 旧容器一次性迁移四态编排）vs `src/host/scripts.pwsh.ts` homeDirScript；迁移模板
  `src/host/scripts.posix.ts` legacyHomeMigrateScript。
- **探针/单测**：`tests/unit/store-path.test.js`（三分支 + 迁移四态 + 模板形状）。
- **失效症状**：POSIX 快照落 `~/dsh-recall-snapshots`；改 base 而无迁移时存量用户
  「看不到」历史快照。
- **复查动作**：改 POSIX home 解析链时核对第三档仍拼 `/.dsh`；legacyHomeMigrateScript
  四态输出未漂移（MIGRATE_OK/OLD_ABSENT/BOTH_PRESENT/MIGRATE_FAIL）；parity SKIP
  集合三处（src/host/store.ts checkScriptParity、scripts-contract.test.js）仍含该平台专属导出。

### I25 失败清扫分级：心跳 + 新锁保护活跃实例（issue #11 根因治理）
- **依赖的官方行为**：POSIX `kill -0` / win32 `Get-Process -Id` 探活；`find -mmin` 与
  `.LastWriteTime` 的 mtime 判定；心跳文件内容为「宿主 PID + epoch 秒」ASCII 单行
  （pwsh 侧必须 ascii 编码——utf8 会带 BOM 破坏 POSIX 侧首字段解析）。
- **出处**：`src/host/scripts.pwsh.ts` / `src/host/scripts.posix.ts` killOrphansScript（三级出口
  CLEANUP_OTHER_INSTANCE / CLEANUP_SKIPPED_FRESH_LOCK / CLEANUP_DONE）+
  ensureGitScript/snapshotScript 的 heartbeatBlock 写入 + `src/host/store.ts`
  parseCleanupResult / cleanupAfterGitFailure。
- **探针/单测**：`tests/unit/diagnostics.test.js`（parseCleanupResult + 接线）+
  `tests/unit/scripts-contract.test.js`（出口标记、心跳接线、STALE_LOCK_MIN /
  HEARTBEAT_TTL_S 两侧同值）。
- **失效症状**：多实例互踩死循环回归（清扫误杀对方活跃 git → 对方也失败 → 循环）。
- **复查动作**：改锁清单或阈值时两侧常量必须同步；心跳写保持 fail-open（不连累
  快照主流程）；parseCleanupResult 的标记名与模板输出逐字一致。

### I26 影子仓库固化 info/attributes 字节保真（issue #12 修复）
- **依赖的官方行为**：`git archive` 与 `git add` 都应用「快照树里项目自己的
  .gitattributes」——`text=auto` + 缺省 `core.eol=native`（Windows 即 CRLF）会让
  archive 解包把 LF 转 CRLF，仓库级 `core.autocrlf=false` 挡不住（属性驱动的转换
  看 core.eol，不看 autocrlf，实测）。`$GIT_DIR/info/attributes` 是优先级最高的
  属性源，对全部路径一票否决树内与全局属性。另两个实测细节：`git add
  --renormalize` 无 pathspec 是空操作（必须 `-- ':(top)'` 顶层魔法 pathspec，
  且不能加 --literal-pathspecs）；属性变更后裸 add -A 受 stat 缓存影响时序依赖
  地跳过重哈希（racy 复查只覆盖「add 与文件同秒写入」），存量归一化条目需要
  显式 renormalize 迁移。
- **出处**：`src/host/scripts.pwsh.ts` / `src/host/scripts.posix.ts` FIDELITY_ATTRS 常量 +
  ensureGitScript 的 info/attributes 固化 + snapshotScript 的 attrsMigrateBlock
  （一次性 renormalize，标记文件 attrs-v1.stamp，失败不 throw 保快照主流程）。
- **探针/单测**：`tests/unit/scripts-contract.test.js`（两侧常量逐字同值、固化行、
  renormalize + ':(top)' + 迁移标记）；issue #12 分析的实验矩阵与真实模板端到端
  复验（2026-08-29，本机 system autocrlf=true + 恶意 .gitattributes，16 项全过）。
- **失效症状**：text=auto / eol=crlf 项目回退后换行符漂移（LF↔CRLF 双向失真，
  capture 侧归一化 + restore 侧反向转换）；`export-ignore` 声明让文件从回退归档
  静默消失（快照有、恢复无、零报错）；clean filter / $Id$ / working-tree-encoding
  改写恢复内容。
- **复查动作**：git 升级后复核 info/attributes 优先级仍高于树内 .gitattributes、
  archive 仍应用属性转换（若 git 未来改为「archive 不做转换」，固化即冗余无害）；
  FIDELITY_ATTRS 两侧同值；改动属性内容须同步换 attrs-v1.stamp 标记名（版本化，
  让存量仓库重新迁移）。

### I27 PS 5.1 stdin 文本读取按输入代码页解码；dsh pwshPath 解析实际常落 PS 5.1（PF-2 探针）
- **依赖的官方/环境行为**：① PowerShell 5.1（.NET 4.x）的 `[Console]::In` 读重定向
  stdin 按 `Console.InputEncoding`（中文机器 GBK 936）解码——UTF-8 字节流会乱码
  （字节数漂移、中文损坏）；官方 `ENCODING_PREAMBLE` 与插件 `UTF8_PRELUDE` 只设
  `OutputEncoding`，救不了输入侧；`[Console]::InputEncoding` 对重定向 stdin 设置
  行为不可靠。可靠读取手法是 `[Console]::OpenStandardInput()` 读原始字节 +
  `UTF8Encoding($false)` 显式解码（与代码页无关，PS 5.1/pwsh 7 双解释器实测
  逐字节保真）。② dsh-pwsh-local 的 `candidateExists` 用 `lstatSync`+isFile/
  isSymbolicLink 判存在——WindowsApps 的 pwsh 应用执行别名是 appexeclink
  reparse point，`lstatSync` 报 ENOENT 判否：本机只装 WindowsApps 别名 pwsh 时
  **生产口径就是 powershell.exe 5.1**，5.1 兼容性不是兜底考量而是主路径。
- **出处**：`dsh-pwsh-local/lib/index.js`（ENCODING_PREAMBLE / resolvePwshPath /
  candidateExists，2026-08-29 构建产物源码）；`dsh-subprocess-local/lib/index.js`
  （stdin 经 `child.stdin.end(data)`，Node UTF-8 编码）。
- **探针/单测**：`tests/probe/stdin-write.test.js`（与执行器同 argv 形态 spawn，
  OpenStandardInput 形态逐字节保真回归钉）；实弹见 plan-performance.md PF-2 探针
  结论（形态 A Console.In 在 PS 5.1 红的实证）。
- **失效症状**：若改回 `[Console]::In.ReadToEnd()` 读 stdin——中文机器上
  index.json/lineage.json/exclude.txt 写入内容乱码、JSON.parse 失败、误走损坏隔离。
- **复查动作**：dsh 升级后核对执行器 stdin 写侧仍是 `child.stdin.end`（UTF-8）；
  若未来官方 preamble 加设 InputEncoding 或执行器默认 PS 7 真身，探针仍绿（字节
  流形态与编码无关），可保持现状。

### I28 SessionHeader 无 title 字段（PF-7 titles 半项废弃依据）
- **依赖的官方行为**：`SessionHeader` 持久化字段只有 version/id/createdAt/cwd/
  parentSession/seedLength/origin/delegationDepth/agentPreset——会话标题不在
  header 里，住在事件日志的 `session/title` 事件（session-info.js
  titleFromEvents 的既有读取路径）。因此 `listSessions()`（目录级 header 枚举）
  拿不到冷会话标题，只能拿 id/cwd。
- **出处**：`dsh-session/lib/types/types.d.ts`（SessionHeader 接口，2026-08-29 核验）。
- **探针/单测**：`tests/probe/api-surface.test.js` 负向断言（SessionHeader 体内
  不含 `readonly title`——未来官方加 title 时探针红，提示可重启 titles 优化：
  冷标题免 readSession 冷读）；header.id 存在的正向断言（sweep 依赖，I8）。
- **失效症状**：无（titles 半项未实施，维持 readSession 现状）；若未来误按
  `header.title` 取标题会恒 undefined。
- **复查动作**：dsh 升级后探针红（官方加了 title）→ 重新实施 plan-performance.md
  PF-7 的 titles 半项（listSessions 建 id→title Map，冷标题零 readSession）。

### I29 Client 插件必须声明式 inject + 属性访问服务（0.1.2 服务作用域重组，UI 全消失实证）
- **依赖的官方行为**：client runner 用 `dynamicCordisContext`
  （`cordis-client-runner/src/client/guard.ts`）包插件 apply 收到的 ctx——属性
  访问 `ctx.<service>` 只对插件对象 `inject` 数组声明过的服务做跨 scope 解析；
  `ctx.get(name)` 虽不做声明检查，但解析结果取决于服务在插件 fiber 作用域内
  是否可见。**guard 门禁 0.1.1-rc.2 已存在且语义相同**（0.1.2 仅把 import 从
  `dsh-client-runtime` 换成 `dsh-client-ui-renderer`，guard.ts/runtime.ts/
  index.ts 其余零变更）；真正触发失效的是 **0.1.2 的 client 服务层大迁移**：
  `client/runtime` 包整体删除，slots 服务迁入 `ui-renderer`、sessions 迁入
  `api/session-controller`（新包）、workspaces 迁入 `api/workspace-controller`
  （新包）——未声明 inject 的插件 fiber 在新拓扑下经 `ctx.get('slots')` 解析
  不到服务（返回 undefined）。0.1.1-rc.2 时 slots 由同作用域的 client/runtime
  提供，`ctx.get('slots')` 可用。**升级后未声明式改造的插件 apply 首行
  `if (!ctx.get('slots')) return` 静默退出**：CSS 不注入、slot 全部不注册、
  entry 仍 active（apply 无异常），页面无任何失败提示。同批第三方插件
  （better-sidebar、archive-manager）同样消失，dshmarket 活着是因为它本来就
  声明 `inject: ['slots','locale','theme']`。
- **出处**：`cordis-client-runner/src/client/guard.ts`（dynamicCordisContext/
  readService：属性访问 requireDeclaration=true、get=false；guardedSlots 对
  keyed 等 shadowing kind **强制 allocatePriority 覆盖插件传入的 priority**，
  「later registrations sort first」——插件侧 priority 冲突递减重试循环失效
  但无害）；官方 denyRead 教学语明确要求
  `{ inject: ['slots', …], apply(ctx) { … } }`。cordis 4 对「inject 声明未满足」
  的语义见 `cordis-client-runner/src/client/runtime.ts` L390-394（「Settled but
  not active = legal pending on an unsatisfied declaration」）与
  `@deepseek-ai/cordis` Fiber._checkImpl（服务不可得即不启动、不报错）。
- **探针/单测**：无直接探针（浏览器端行为，CI 外）。修复以实弹验证钉：CSS
  `<style data-plugin="dsh-recall-plugin">` 注入 + 设置卡渲染 + 撤回按钮 DOM
  （2026-08-30 dsh 0.1.2-alpha.1 link 模式全过）。
- **双版本兼容（2026-08-31 cordis 4.0.1 实测钉）**：修复的 inject 清单为
  `['slots','sessions','workspaces','timer']`——**不含 `conversation`**：
  conversation 服务 0.1.2 才存在（ui-conversation `service.ts` 提供，
  0.1.1-rc.2 无），静态声明它会让 0.1.1-rc.2 上的插件走「声明未满足」路径
  静默不启动（fiber settled 但 apply 不执行，UI 全灭且无报错——与 I29 症状
  相同但成因不同）；故 conversation 统一走 `ctx.get('conversation')` 探测 +
  降级（guard 的 get 对缺失服务安全返回 undefined；0.1.1-rc.2 上回填输入框
  功能本来就不存在，0.1.2 主流程不受影响）。
- **失效症状**：本插件 UI 全部消失（按钮 + 设置卡），无报错无声息；Host 半
  API 正常（`/api/recall/*` 200）——「Host 活 Client 死」即此症。
- **复查动作**：dsh 升级后核对 guard.ts 的门禁语义是否放宽（get 恢复跨 scope
  或声明要求变化）；插件 `src/client/entry.ts` 的 inject 清单与官方 client 域
  服务清单比对（声明缺失服务会让 fiber 静默不启动——styles 已从声明剔除、
  conversation 走 get 探测）；0.1.2 之后若 conversation 成为两端稳定服务，
  可重新评估是否进 inject；guard 的 slots register 优先级覆盖策略若改回尊重
  插件值，可恢复 priority 重试循环的原始语义。

### I30 settings 独立辅助函数移除：installSettingsSection → SettingsProvider.installSection（0.1.2-alpha.2 破坏性变更实证）
- **依赖的官方行为**：Host 侧 settings namespace 接入路径随版本迁移——0.1.2-alpha.1
  及以前用独立导出 `installSettingsSection(ctx, ns, schema, entry, hooks)`；
  0.1.2-alpha.2 起独立函数**移除**，改为 `SettingsProvider` 实例方法
  `installSection(owner, ns, schema, entry, hooks)`（owner 是调用插件 ctx），
  官方 bash-local / pwsh-local 同款写法 `ctx.inject(['settings'], sctx => sctx.settings.installSection(...))`。
- **出处**：已装 0.1.2-alpha.2 产物 `dsh-settings/lib/index.js`（导出面仅
  `SettingsConflictError`/`SettingsProvider`/`redactSecrets`，无 installSettingsSection）vs
  alpha.1 镜像 `settings/settings/lib/index.js:638`（仍导出）。两个签名逐字段一致
  （entry 为组合 base、hooks 为 setSource/onChange/validate）。
- **探针/单测**：无静态探针（import 到不存在的命名导出会直接 SyntaxError，探针
  读 .d.ts 也不覆盖）；`verify:host` 装配门禁在升级后必红并给出此症状——插件
  `src/host/index.ts` 静态 import 即崩。已做双版本兼容分支
  （`typeof dshSettings.installSettingsSection === 'function'` 走旧函数，否则走
  `ctx.inject(['settings'])` + `installSection`），verify-host 桩补 installSection。
- **失效症状**：插件 Host 半启动即崩——SyntaxError `does not provide an export
  named 'installSettingsSection'`，`/api/recall/*` 全 404，UI 按钮可能报 snapshot
  失败。若 npm 版与本地并行（本机曾装 alpha.1 未发 npm），新旧并存时此症状
  只出现在新 dsh 环境。
- **复查动作**：dsh 升级后 `npm run verify:host` 必跑；若官方再次调整接入路径
  （如 installSection 改名/改签名），同步兼容分支与 verify-host 桩。

### I31 slots.entries 快照与 slots.inject 回调执行时机（PR #13 动态避让依赖）
- **依赖的官方行为**：`conversation.chat.node` 的 priority 动态避让
  （`nextShadowPriority`）依赖三个官方语义：① `slots.entries(key)` 返回该槽位
  已注册条目的只读快照（稳定引用，render-erased 视图）；② 条目形状
  `StoredEntry`，priority 在 `entry.options.priority`（可选字段，缺失/非法按 0
  兜底）；③ `slots.inject(key, cb)` 的回调**在声明已存在时同步执行、否则延迟到
  声明 register() 提交后执行**——旧实现外层 try/catch 捕获不到延迟回调里的
  keyed 冲突异常，priority 递减重试实际从未生效（I1 的「冲突递减重试」在 inject
  延迟路径上是死代码，dsh-turn-fold 占 `-1` 即暴露）。guard 环境（0.1.2）下
  register 代理强制 allocatePriority 覆盖插件传入值（I29），动态计算值被丢弃但
  无害——避让的真实生效面是无 guard 的直连环境与官方未来尊重插件 priority 的
  场景。
- **出处**：`dsh-client-ui-renderer/lib/types/client/registry.d.ts`
  （`entries(key): readonly StoredEntry[]` L154；`inject` 文档注释「runs
  synchronously when the declaration already exists; otherwise it runs inside
  the declaring register() call」）；`StoredEntry` 本体声明内嵌于
  `dsh-cordis-client-runner/lib/client.js` 声明表（ui-slots 包不独立发布，
  `options: { key?, id?, order?, label?, priority? }`）；0.1.1-rc.2 等价面在
  `dsh-client-runtime/lib/types/client/slots.d.ts` L129（同签名，npm tarball
  核验）。
- **探针/单测**：`tests/probe/api-surface.test.js` 新增双包探测（entries 签名
  + StoredEntry options 形状）；`tests/unit/client-pure.test.js` 的
  `nextShadowPriority` 5 例（空 entries / 同 key 占用 / 连续冲突 / 非法值 /
  空形状容错边界）。
- **失效症状**：entries 删除/改名 → inject 回调内 TypeError 被 catch
  （console.error），撤回按钮不注册；StoredEntry.options 形状变化 → 计算退化
  （NaN/undefined 按 0 兜底），避让失效回到 keyed 冲突拒载。
- **复查动作**：dsh 升级后 `npm run test:probe`（新探针红即 entries/形状漂移）；
  若 guard 改为尊重插件 priority，动态避让成为主路径，需与 dsh-turn-fold 实弹
  复验共存。

### I32 载体无关路由：host 插件不得硬依赖 webServer（桌面端 composition 禁用该 row）
- **依赖的官方行为**：桌面端（DSH Desktop）复用 web 组合但禁用网络与浏览器启动行——
  `desktop.cordis.patch.yml` 对 `webserver`/`web-runtime`/`web-startup` 等 row 置
  `disabled: true`，`connection` row 保留并把 inject 覆盖为 `[credentials]`；
  `dsh-desktop-host` 取 `ctx.get('connection')` 后用 `createSharedFetchHandler('/api')`
  直接分发 `/api/*`。因此 host 插件把 webServer 写进顶层 inject 会让 fiber 永久
  pending（`waiting for service: webServer` → 「1 entry did not activate」整树加载失败）。
  API 路由必须走 connection 的载体无关 exact fetch 路由：route =
  `{ path: '/api/<...>', methods: ['GET'|'HEAD'|'POST'], requestBody: 'buffered' | 'streaming',
  fetch: (request: Request) => Promise<Response> }`——web 端由 client-connection 把 `/api`
  挂到 webServer、桌面端由 desktop-host 分发，客户端 URL 与方法两端一致。
- **注册生命周期（本项目踩点）**：`connection.fetch.register` 的本体挂在 connection
  插件 fiber 的 effect 上（实现里 `owner = this.ctx`，不是调用者），返回**异步
  disposer**。插件侧必须 `ctx.inject(['connection'], cb)`（可选注入，服务缺席不 pending，
  仅 Client API 降级不可用）+ `cb.effect(() => cb.connection.fetch.register(route))` 包裹，
  否则 HMR 重载会撞 `exact Fetch route ... is already registered`、卸载后路由残留。
- **出处**：`@deepseek-ai/dsh-desktop-host/config/desktop.cordis.patch.yml`（webserver
  `disabled: true`；connection 行覆盖 inject）；`dsh-desktop-host/lib/index.js` L337/L344/L379
  （`ctx.get('connection')` → `createSharedFetchHandler('/api')` → `/api/` 前缀分发）；
  `dsh-client-connection/lib/index.js`（`get fetch()` 的 owner 闭包、`registerFetchRoute`
  的 `owner.effect` 包裹与重复注册抛错）；类型面 `dsh-client-connection/lib/types/rpc.d.ts`
  （`ConnectionFetchRoute` / `HostConnectionFetch.register(): () => Promise<void>`）。
- **探针/单测**：`scripts/verify-host.mjs` 以 connection 桩断言——每端点一条 exact 路由、
  路由形状（methods 含 POST / requestBody=buffered / fetch 可调用）、fetch 分发响应 200
  且 body 带 `ok`、未知 path 404、卸载后注册清零（异步 disposer 由 cordis 等待）；
  `src/types/dsh-contract.ts` 按官方 `.d.ts` 建模消费面（HttpRequest/HttpResponse 已删）。
- **失效症状**：① webServer 加回顶层 inject → 桌面端 fiber 永久 pending、插件树加载失败
  （错误页 / 无撤回按钮）；② connection 改为硬 inject → 旧版 dsh 或未装配 connection 的
  部署同样 pending（现为可选注入，缺席时仅 Client API 不可用）；③ 忘记 effect 包裹
  register → HMR 重载报 route 已注册、或卸载后路由残留。
- **复查动作**：dsh 升级后 `npm run verify:host`（路由注册/形状/清零断言）；桌面端冒烟
  看启动日志无 pending；官方若新增 Fetch 路由约束（path 前缀、方法集），以
  `dsh-client-connection` 的 `assertFetchRoute` 源码为准同步。


### I33 seeded 会话的会话读取：readSession 恒抛，须降级 observeSession（撤回 fork 子会话误报「第一条用户消息」）
- **依赖的官方行为**：`sessionQuery.readSession` 内部以
  `Session.create(id, events, header, inheritedEventCount)` 做回放校验；官方 `Session` 构造器在
  快照模式（`Session.create` 装配）下要求 seeded 头 `inheritedEventCount === log.length`
  （「seeded session constructor seed must equal its inherited prefix」）。而读取面交给它的是
  全量逻辑日志——`snapshotLive` 走 `session.snapshotEvents()` 无参＝`slice(0, log.length)` 全量，
  冷读 `handle.read(0)` 返回完整存储日志（继承前缀物理存在）——inheritedEventCount 是 fork 时的
  前缀长度，两者必然不等，`readSession` 对任何 seeded 会话直接抛错。正确读取面是
  `sessionQuery.observeSession(id)`：经 `Session.fromRestore` 恢复（restore 模式无该约束），
  租约 `events` 为全量逻辑日志（含继承前缀）；读毕必须释放（`Symbol.dispose`，prepared 缓存项
  靠它减引用）。
- **项目踩点（2.3.13 → 2.3.14 修复）**：`resolveCutSeq` 此前把读取异常静默折成 null，与「真首条」
  不可分——在撤回 fork 出的子会话（本插件自己造的 seeded 会话）里点**任何**消息都显示
  「该消息是本会话中第一条用户消息」，重启/重装不恢复（确定性，非缓存）。真机实测（dsh web
  0.1.5-rc.2 + 插件走 `/api/recall/preview`）：修前子会话 6 条消息 cutSeq 全 null、父会话全部正常
  （43/62/88/156）；修后子会话 156/43/62/88/197、真首条（你好）仍 null，父会话不变。降级链：
  readSession →（抛错 / 事件里缺该消息）→ observeSession；只有「消息在、其前无 turn/end」不降级；
  两跳都失败才落到 null。
- **出处**：`dsh-session/lib/index.js`（构造器 seeded 校验；`snapshotEvents(fromSeq=0,
  toSeqExclusive=this.seq)` 全量语义；`ownEvents()` 前缀后切片）；`dsh-session-query/lib/index.js`
  （readSession 的 `Session.create(loaded.events, ...)` 校验、`snapshotLive`、
  `readColdSessionLog`、`observeSession` 租约）；`dsh-session-persistence-jsonl/lib/index.js`
  （handle.read 的 slice 语义、`inheritedEventCount` getter、`encodeMaterialization`）。
- **探针/单测**：`tests/unit/snapshots-cutseq.test.js`（抛错降级 / 缺消息降级 / 真首条不降级 /
  两跳失败保底 null / 旧版无 observeSession 维持原行为 / 租约释放与缓存命中）；真机验证＝
  `dsh web --no-open` 后 POST `/api/recall/preview`（本次核验即此法）。
- **失效症状**：seed​ed 会话（撤回子会话、或任何 fork 调用产生的会话）内撤回预览对全部消息都显示
  「该消息是本会话中第一条用户消息、无法回退对话」；文件回退仍可执行（cutSeq null 只是跳过对话
  回退），重启不恢复。
- **复查动作**：dsh 升级后跑 `npm test`（本档单测）；真机冒烟＝在撤回产生的子会话里对非首条消息
  preview，面板应显示「对话将一并回退」而非「第一条用户消息」；官方若修 readSession 或调整
  sessionQuery 读取面，以 `dsh-session-query/lib/index.js` 源码为准同步本降级链。


### I34 撤回回填的附件重建：readAttachment + createDrafts + addAttachments（探测式消费，全链降级）
- **依赖的官方行为**：撤回回填把被撤回消息的附件（image/file 块，均带 durable
  `attachment.attachmentId` 引用）也放回输入框，链路与官方 composer 的 `addFiles` 等价：
  1) `sessions.binding(sessionId).session.readAttachment(attachmentId)`——wire 调
  `remote.session.attachment({ sessionId, attachmentId })`，返回
  `{ attachment: { mediaType, ... }, data: Uint8Array }`（官方历史图片回显
  `HistoricalImageCache.loadCanonical` 同款调用）；
  2) `conversation.createDrafts(sessionId, files)`——浏览器 `File` → 运行时草稿附件
  （图片=object URL 预览，其他文件立即后台上传），返回按输入顺序的描述符；
  3) `shell.actions.addAttachments(ids)`（官方 composer 走 `shell.addAttachments`；
  未接纳返回 false 时 `conversation.releaseDraftAttachments(drafts)` 回滚）。
- **会话授权（本项目踩点）**：`readAttachment` 的 sessionId 是「消息所在会话」——被撤回消息
  不在 fork 出的子会话日志里，故插件在 execute 一开始用**源会话**早读字节（此刻源会话仍在册、
  归档尚未发生），fork + open 后再把 `File` 注册进**子会话**的草稿。直读子会话会拿不到授权。
- **出处**：`dsh-cordis-client-runner/lib/client.js`（ISession 声明：`readAttachment` 签名与
  `ImageAttachmentRef` 返回）；`dsh-api-session-controller/lib/types/client/sessions/session.js`
  （readAttachment 实现：`remote.session.attachment({sessionId, attachmentId})` + base64 解码）；
  `dsh-client-ui-conversation/lib/client.js`（`SessionInputShell.actions.addAttachments`、
  `ConversationController.createDrafts / releaseDraftAttachments`、composer `addFiles` 组合、
  `HistoricalImageCache` 对 readAttachment 的用法）。
- **探针/单测**：无直接探针——官方这些 client 面未随附 `.d.ts`（ui-conversation 无类型文件、
  session-controller 的 client 目录仅 `.js`），字段以源码核验；纯逻辑
  `attachmentRefsFromBlocks` / `defaultAttachmentName` 由 `tests/unit/client-pure.test.js` 钉。
- **失效症状**：撤回回填只回来文本、附件不回（服务面缺失时静默降级；不影响撤回主流程与文本回填；
  旧版 dsh 恒降级）。
- **复查动作**：dsh 升级后对照上述三处源码是否漂移（方法名、返回形状、`addAttachments` 的布尔
  语义、`createDrafts` 的 descriptor 形状）；真机冒烟＝对带图片的消息撤回，输入框应出现附件
  缩略图（smoke-checklist 可追加项）。


### I35 fork 切点携带 inbox 入队事件：撤回后被撤回的消息以「排队消息」复活
- **依赖的官方行为**：`sessions.fork({ sessionId, atSeq })` 的切点不是「切点事件本身」——host 侧
  取 `boundary = events.find(e => e.type === 'turn/end' && e.seq >= atSeq)`，再令
  `cut = boundary.seq + 1` 并**向后跳过非 `turn/start` 的事件**，seed = `events.slice(0, cut)`。
  于是「boundary 那条 turn/end 之后、下一个 turn/start 之前」的整段事件都会进入子会话。排队
  投递的用户消息，其 inbox 入队事件（`agent/inbox/spliced`，`target: 'next-turn'`，
  `data.inserted[].source.rpcId`）必然落在「上一个 turn/end」与「领取它的那个 turn/start」
  之间——正好落进该窗口。
- **症状**：撤回后 fork 出的子会话重放 seed 时重建出该 inbox 项，UI 的 QueueDock 在输入框上方
  显示一条与被撤回消息同内容的「排队消息」（与回填的草稿重复）。日志实证：父会话 seq 93
  `turn/end` → 94 入队（`rpcId 4aa8cdb6`）→ 95 `turn/start` → 96 领取后移除 → 100
  `user/message` 落日志；子会话 seed 恰止于 94，重放出同一入队项。
- **插件对策**：Host 侧 `scanStaleQueueRpcIds` 扫窗口内 inbox 入队项、取 user 来源的 `rpcId`，
  经 execute 响应的 `staleQueueRpcIds` 下发；Client 侧按 `placement === 'queued'` + rpcId 匹配，
  逐项调官方 `updateQueue(itemId, { kind: 'remove' })`（等价 QueueDock 的「删除排队消息」）。
  用 rpcId 而非内容比对：撤回后新发的消息带自己的 rpcId，不被误删。
- **出处**：`dsh-api-session-controller/lib/index.js`（fork 的 boundary/cut 推进）；
  `dsh-api-session-controller/lib/types/client/contract/session.d.ts`（`ISession.updateQueue`、
  `SessionFace = ISession & ObservableSnapshot<SessionSnapshot>`，`getSnapshot()` 读取面）；
  `dsh-client-ui-conversation/lib/client.js`（QueueDock 的 `placement === 'queued'` 过滤与
  `updateQueue` 行级操作）；`agent/inbox/spliced` 事件形状由本机会话日志解压实证。
- **探针/单测**：无直接探针（fork 行为在 host 内部过程）；纯逻辑 `scanStaleQueueRpcIds` /
  `resolveStaleQueueRpcIds` 由 `tests/unit/snapshots-queue-residue.test.js` 钉，
  `pickStaleQueueItemIds` 由 `tests/unit/client-pure.test.js` 钉。
- **失效症状**：拿不到 live 事件（冷会话）或 `updateQueue` 服务面缺失 → 不清理，残留排队消息
  仍显示（用户可在 QueueDock 手动删除）；撤回与回填主流程不受影响。
- **复查动作**：dsh 升级后看 fork 的 cut 推进规则是否变化（若官方改为在 `turn/end` 处精确切分，
  本清理自动退化为无匹配的空操作）；真机冒烟＝对「agent 运行中发送、随后被撤回」的消息撤回，
  输入框上方不应出现排队消息。


## 与 E1 verify-host 的对应关系

装配层条目（I10 inject 门禁、端点注册、Config schema、卸载清零）由
`scripts/verify-host.mjs` 机器化断言；字段层条目（I2/I6/I8 等）由 `tests/probe/`
字段探针断言；纯逻辑与脚本契约由 `tests/unit/` 断言。矩阵里「探针/单测」标注
`无直接探针` 的条目即为测试缺口，dsh 升级后优先补。
