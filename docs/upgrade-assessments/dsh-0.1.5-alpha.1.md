# dsh v0.1.5-alpha.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.5-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)（commit `5dda764`，2026-09-09 发布；pre-release，npm dist-tag `alpha` 已可装）
> 本地基线：dsh 0.1.5-alpha.1（全局实装，`npm install -g @deepseek-ai/dsh@0.1.5-alpha.1`）；对照源：0.1.3-alpha.2（上一评估基线）
> 评估方式：release notes 筛查 + **三层门禁实跑**（check:dsh 报漂移/peer 越界 + test:probe 31 项探针全绿 + verify:host 装配断言全过）+ 插件依赖契约逐项 diff 全局 0.1.5 实装包 + **V2→V3 迁移源码实读**
> 总结论：**接口层面零破坏（探针与装配门禁实证），行为层面无回归——插件对会话格式 V3 天然免疫（读取全走官方恢复后的内存态、消息定位以 id 为主键、cutSeq 缓存为内存态不跨版本）。唯一需跟进的是 peer 范围上界越界与文档镜像漂移，均为发布前例行同步，非代码缺陷。**

## 一、更新日志梳理与初步判断

按「是否命中插件依赖面」筛选 release notes（对照 [dsh-contract.md](../dsh-contract.md) 建档的依赖面）：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **会话格式升级至 V3**（系统提示词纳入消息历史、旧 PTC 事件迁移、自定义日志读取器需适配、不支持降级读） | 其他 | **高疑点**——直接命中插件冷读路径（`readSession`/`live.events`）、`resolveCutSeq` 的 seq 依赖、快照 tag 的消息主键 | **无破坏**，见 §2.1 |
| **移除 `ctx.agent`，调用方需显式传递 Agent** | 其他 | 高疑点——插件 inject 含 `agents`（P0-1 拦截） | **无影响**，见 §2.2 |
| **Inbox 改为 type-only 接口，`hasPending`/`claim` 移出公共 API** | 其他 | 中疑点——契约文档事件类型含 `agent/inbox/spliced` | **无影响**，见 §2.3 |
| 本地图片 POSIX 绝对路径显示修复（含工作区外截图） | 修复 | 中疑点——插件 client 重绘用户消息图片 | **被动受益**，见 §2.4 |
| 拒绝不含正文/附件的空消息及空白队列编辑 | 修复 | 低疑点——插件 `refillDraft` 走官方 setDraft | 排除，见 §2.5 |
| 右侧 Sidebar（多标签/分栏/全屏）、移除 Detail 面板 | 新增 | 低疑点——UI 结构变化 | 排除，见 §2.6 |
| 动态系统提示词不破坏 KV Cache | 新增 | 无关 | 无关——模型请求层，插件不构造请求 |
| 斜杠命令中文化、会话统计双摘要、输入框菜单层级/间距 | 优化 | 无关 | 无关——Web 输入/统计面板，与撤回链路零交集 |
| 子代理运行时升级 Codex 0.153.4 / Claude Code 2.1.263 | 优化 | 无关 | 无关——可选子代理插件内部依赖 |
| 发送按钮与 Enter 行为统一、暂停目标不可被模型恢复、折叠思考摘要去 Markdown 标记、项目根发现错误报告 | 修复 | 无关 | 无关——交互/目标/渲染/根发现层 |
| macOS/Linux `fs-ext` 本地编译修复 | 修复 | 无关 | 无关——插件不依赖 fs-ext |

**初步判断：唯一需深挖的是会话格式 V3**——它同时触及插件的三条链路（冷读、cutSeq 推导、消息主键）。`ctx.agent`/Inbox 两项 API 调整需确认插件是否消费（rg 实证）。

## 二、详细变更核查（全局 0.1.5 实装包 + V2→V3 迁移源码实读）

### 2.1 会话格式 V3（本次核心疑点，逐项排除）

读了 `@deepseek-ai/dsh-session-format-v2-to-v3/lib/index.js` 迁移实现，确认其会**插入 `system/message` 事件并 remap seq**（`emitSystem` 内 `targetSeq++`、`remapEvent(source, this.targetSeq, ...)`，V2 源事件须 dense）。逐项核对插件对 seq/id 的依赖：

1. **cutSeq 坐标系一致，不受污染**：[resolveCutSeq](../../src/host/snapshots.ts) 读的是 `sessions.get`（live，已是 V3 恢复态）或 `sessionQuery.readSession`（同样返回 V3 恢复态），拿到的 `turn/end.seq` 与 `fork({ atSeq })` 期望的坐标系**同源同版本**。迁移发生在会话加载期、早于任何快照/preview/execute，不存在「V2 时代算的 seq 配 V3 的 fork」的错配窗口。
2. **cutSeqCache 为内存态，不跨版本陈旧**：缓存挂在 `state.cutSeqCache`（[store.ts](../../src/host/store.ts) 每次 apply 重建的 `new Map()`），插件进程重启即清空。V2→V3 迁移随 dsh 启动一次性完成，插件 apply 时读到的永远是迁移后 seq，缓存终身有效的前提（「消息入日志后其之前的 turn/end 不变」）在 V3 下仍成立。
3. **消息主键稳定**：迁移**保留原始 message id**（`observeMessageIds` 收集 `user/message.data.id` 等，只为生成的 system 消息造 `v2-to-v3-system-<hash>` 新 id 且带碰撞守卫）。插件快照 tag 主键（`snap-<消息ID>`）与 [scanCutSeq](../../src/host/snapshots.ts) 的消息定位都按 `data.id` 匹配，**不受 seq 位移影响**。
4. **消费的事件类型全在**：`session/title` / `user/message` / `turn/end` 在 V3 中均保留；新增 `system/message` 插件不消费。`scanCutSeq` 用 `e.seq` 实际值而非数组下标反推，对 seq 间隙/位移天然鲁棒。
5. **PTC 事件重命名不外泄**：迁移把 `tool/ptc-dispatch*` 重命名回 `tool/code-dispatch*`（`renamePtcEvent`），插件事件类型全集含 `tool/code-dispatch`/`tool/code-dispatch-start`，读取面不受影响。

**探针实证**：`test:probe` 的 `api-surface.test.js`（29 项，覆盖 fork/sessionQuery/chat.node/settings 等字段形状）在 0.1.5 全局实装上 31/31 全绿——插件依赖的 API 字段形状零变化。

### 2.2 移除 `ctx.agent`（单数）（排除）

- 插件 `inject = ['shell','sessions','webServer','agents']`——用的是 **`agents`（复数注册表）**，`agentBusy`（[index.ts](../../src/host/index.ts)）走 `ctx.agents.list()` / `ctx.agents.get()`。
- 源码 rg 实证：`src/` 全量零处 `ctx.agent`（单数）或 `.agent.` 引用。移除的是单数便捷访问器，复数注册表契约不变，verify:host 断言 `agents 桩访问 1 次` 通过。

### 2.3 Inbox API 调整（排除）

- `Inbox` 改 type-only、`hasPending`/`claim` 移出公共 API——针对的是**运行时可构造类**的收敛。
- 源码 rg 实证：插件零处 `Inbox`/`hasPending`/`claim` 引用。事件类型 `agent/inbox/spliced` 仍在插件事件全集（只读消费，不涉及 Inbox 类构造），不受影响。

### 2.4 本地图片 POSIX 路径显示修复（被动受益）

- 插件 client 用户消息重绘图片走官方 `renderMessageImages`（[slots.d.ts](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/types/client/contract/slots.d.ts) 实证 `renderMessageImages`/`loadImage` 契约在 0.1.5 保留）。官方修复了绝对 POSIX 路径图片加载，插件重绘路径若引用此类图片将**被动受益**，无需改动。
- 遗留观察项（沿 alpha.1/alpha.2）：带**文件附件**（非图片）消息的撤回重绘仍缺失——本次无变化。

### 2.5 空消息拒绝（排除）

- 拒绝「无正文且无附件」的空消息与空白队列编辑。插件 `refillDraft` 回填走 `actions.setDraft` 官方写入通道，回填的是撤回前的原始文本（非空），不触发该拒绝路径。

### 2.6 Sidebar / 移除 Detail 面板（排除）

- 插件注册 `conversation.chat.node`（keyed renderer，覆盖 user+steering）与 `settings.plugin.item`（key=`dsh-recall`）。Sidebar 是新增右侧面板容器、Detail 面板移除属宿主导航层，与 chat.node 槽位、设置卡片 slot 契约零交集。slots.d.ts 实证 chat.node 契约不变。

## 三、与插件功能实现的关联分析

**不受影响的模块**（证据充分）：

- **撤回主链路**：fork 签名逐字段一致（`sessions.d.ts` 实证 `fork({sessionId, atSeq?, increaseTitle?})`）；cutSeq 坐标系与 V3 同源（§2.1.1）；消息主键 id 稳定（§2.1.3）。
- **快照触发/影子 git/exclude/配置域**：与 dsh 变更零交集；`session/event` 域保留。
- **P0-1 agent 拦截**：`ctx.agents` 复数注册表不变（§2.2）。
- **设置页/token 面**：chat.node 与 settings slot 契约不变（§2.6）。

**被动受益**：本地 POSIX 路径图片重绘（§2.4）。

**遗留观察项（均为 alpha.1/alpha.2 遗留，非本次引入）**：

1. 旧会话（V1/V2）撤回切割正确性——V3 迁移产物 seq 重映射逻辑推演无影响（§2.1），但实弹冒烟结果以 0.1.5 为准；
2. 带文件附件消息的撤回重绘缺失——本次无变化。

## 四、影响评估结论

**总体结论：接口层面零破坏（探针 31/31 + 装配门禁全过 + 契约逐项 diff 一致），无需任何代码修改；行为层面无回归——插件对会话格式 V3 天然免疫。**

- **无影响（契约实证不变）**：fork 签名与 cut 语义、sessionQuery 读接口、chat.node 槽位与 `renderMessageImages`/`loadImage`、`settings.plugin.item`、`ctx.agents` 注册表、`session/event` 触发域、user/steering 投影、消费的事件类型（`session/title`/`user/message`/`turn/end`）在 V3 下全部保留。
- **V3 免疫根因**：读取全走官方恢复后的内存态（seq 坐标系与 fork 同源）；消息定位以 id 为主键（迁移保留原 id）；cutSeqCache 为内存态不跨版本。
- **正面影响（被动）**：本地 POSIX 路径图片重绘修复。
- **需跟进（发布前例行，非代码缺陷）**：① peer 范围上界越界（`check:dsh` 报 6 个 dsh-* peer 不含 0.1.5-alpha.1）；② 文档镜像漂移（reference/、dsh-contract.md、AGENTS 版本字段仍记 0.1.3-alpha.2）。

## 五、后续动作

1. ~~本地升级 + 三层门禁~~——已完成（本次评估实跑：test:probe 31/31、verify:host 全过；check:dsh 报漂移/peer 越界，转入第 2/3 步处理）。
2. ~~拓宽 peer 范围~~——本次一并处理：7 个 dsh-* peer 补 `>=0.1.5-alpha.1 <=0.1.5-alpha.1` 逐 tuple OR 段（沿 9c3c56b 先例），dshReleases 矩阵补 0.1.5-alpha.1。
3. ~~同步契约文档~~——本次一并处理：重拉 reference 镜像、更新 dsh-contract.md「对应版本」、compat-audit 追加核验段、AGENTS 版本字段。
4. 冒烟（人工）：**旧 V1/V2 会话撤回**（在 0.1.5 V3 迁移产物上验证切割点与对话回退正确，结果以此为准）、**带文件附件消息的撤回重绘**、**本地 POSIX 路径图片撤回重绘**（验证 §2.4 被动受益）。
5. 0.1.5 正式版发布后：重跑 `npm run check:upgrade`，按 [compat-audit.md](../compat-audit.md) 台账定点复查 I6/I7/I19/I28，并核对 V3 相关不变量是否需要新增台账条目。

## 证据清单

| 结论 | 证据（0.1.5-alpha.1 全局实装包 / V2→V3 迁移源码） |
|---|---|
| 探针/装配门禁全绿 | `npm run test:probe`（31/31）、`npm run verify:host`（inject=shell,sessions,webServer,agents，端点 12 项）实跑输出 |
| check:dsh 报漂移 + peer 越界 | `npm run check:dsh` 实跑（镜像/契约记录 0.1.3-alpha.2；6 个 dsh-* peer 上界不含 0.1.5-alpha.1） |
| V3 插入 system/message + seq remap | `dsh-session-format-v2-to-v3/lib/index.js`（`emitSystem` targetSeq++、`remapEvent`、`observeMessageIds` 保留原 id） |
| cutSeqCache 内存态不跨版本 | `src/host/store.ts`（`cutSeqCache: new Map()` 随 apply 重建）、`src/host/snapshots.ts` resolveCutSeq |
| fork 契约逐字一致 | `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts`（`fork({sessionId, atSeq?, increaseTitle?})`） |
| chat.node / renderMessageImages / loadImage 保留 | `dsh-client-ui-chat/lib/types/client/contract/slots.d.ts` |
| 插件不消费 ctx.agent（单数）/Inbox/hasPending/claim | `src/` 全量 rg 零引用；agentBusy 走 `ctx.agents.list/get` |
| 消费事件类型在 V3 保留 | V3 codec 校验（session/title、user/message、turn/end 均在 RELEASED 处置表）；PTC 重命名回 code-dispatch 不外泄 |
| 本地图片 POSIX 修复被动受益 | release notes + renderMessageImages 契约保留 |
