# dsh v0.1.3-alpha.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.2)（tag `82a5fd6`，2026-09-08 发布；pre-release，npm dist-tag alpha 已可装）
> 本地基线：dsh 0.1.3-alpha.2（全局实装，`npm install -g @deepseek-ai/dsh@0.1.3-alpha.2`）；对照源：alpha.1 源码树（D:\workspace\DSH\deepseek-harness0.1.3-alpha.1）
> 评估方式：release notes 筛查 + **三层门禁实跑**（check:upgrade 全绿：check:dsh 漂移一致 + test:probe 31 项探针 + verify:host 装配断言）+ 插件依赖契约逐项 diff 全局 alpha.2 包（**已实装**，非纯源码比对）
> 总结论：**接口层面零破坏（门禁实跑验证），行为层面以正面影响为主——[alpha.1 评估](./dsh-0.1.3-alpha.1.md)中唯一的确定缺陷（冷会话性能回退）已被官方修复，插件冷读路径直接受益，无需任何代码修改。**

## 一、更新日志梳理与初步判断

按「是否命中插件依赖面」筛选 release notes（对照 [dsh-contract.md](../dsh-contract.md) 建档的依赖面）：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| 改善长会话打开、恢复和持续对话时的卡顿，降低内存占用 | 优化 | **高疑点**——对应 alpha.1 已知性能回退（v1→v2 迁移全量内存物化），命中插件冷读路径 | **证实为利好**，见 §2.1 |
| 统一设置面板中标签、开关和插件状态的样式 | 优化 | **高疑点**——插件有「撤回设置」tab，UI 强依赖 `--dsw-alias-*` token | 排除，见 §2.2 |
| 普通 subprocess handle 移除 pid；终端 handle 不受影响 | 其他 | 中疑点——插件影子 git 走子进程 | 排除，见 §2.3 |
| 可继续对话的子代理支持消息排队、编辑、删除、Steer、停止；排队消息「发送中」态 | 新增 | 中疑点——涉及 user/steering 投影与消息队列语义 | 排除，见 §2.4 |
| 引用较长会话时，模型可按需读取预览中未展示的内容 | 优化 | 低疑点——sessionQuery 读取路径 | 无关——模型上下文层功能，不触及 sessionQuery 契约面 |
| 升级 pi-ai 到 0.85.1 / Web 顶栏「在应用中打开」 / PTC 展开命令 / Web 断线恢复 / 滚动修复 / Python SDK 启动崩溃 / Windows 进程清理 / 反馈独立提交 / 默认工具调整 / persona 前后缀拆分 | 其余 | 无关 | 确认零交集（pi-ai 为模型层；persona 为配置常量层；其余为 Web/SDK 侧） |

**初步判断：两个高疑点均需实证核查**——设置面板样式重绘直接命中插件设置页；长会话性能修复则可能改变插件冷读依赖的迁移语义（seq 重映射、cut 推导）。

## 二、详细变更核查（全局实装包 + alpha.1 源码树对照）

### 2.1 长会话性能修复（本次核心变更，纯利好）

修复分三层实现，**全部不改变插件依赖的语义**：

1. **v1→v2 迁移改流式**（[session-format-v1-to-v2 README](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-format-v1-to-v2/README.md) diff 实证）：alpha.1 的「whole-artifact transformation——全量内存物化 source + target + sequence map，不流式」改为「decoder 逐行 → `createStage` 逐事件 `transformEvent` → `finish`」流水线，不再保留完整 v1 事件数组（known limitations 从 "Whole-artifact transformation" 改为 "Linear remap state"，最终 v2 数组与 seq map 仍 O(事件数)，但 v1 侧与中间拷贝消失）。**seq 密集重映射、`session/end-seed { inherited: true }` cut 推导、拒绝切在 Assistant attempt 中间的继承 cut——三项语义逐字保留**，插件 `resolveCutSeq` → `fork({ atSeq })` 链路的语义前提不变。
2. **普通 Session 恢复不再重放嵌入流**（同 README：「Ordinary Session restoration checks runtime-required settlement fields without replaying embedded streams; persistence publication and the frozen writer-image fixture validator retain full stream verification」）——打开/恢复提速的直接来源，只影响验证深度，不改变事件内容。
3. **persistence 内部 `handle.read` 返回 `{ eventState, events }`**（[session-persistence README](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-persistence/README.md) diff 实证）：共享冻结图（`shared-frozen`）避免重复拷贝，属降内存手段——纯 persistence 内部 API，插件源码零引用 `sessionPersistence`/`handle.read`（rg 实证），不受影响；**`session/event` 写路径消费与「Constructor seed events never emit `session/event`」语义完整保留，插件快照触发器安全**。

session-query 侧配套优化（[session-query README](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-query/README.md) diff 实证）：`observeSession` live 观察改为首次读取才物化 `events`（log 只追加，晚读仍是同一前缀）——header/cursor/projection-only 消费者不再拷贝日志。读取接口 `listSessions`/`readSession` 契约与 seq「zero-based contiguous」保证不变。

**一处迁移产物细节变化**：v1 旧会话中「未闭合 turn」（非空 next-turn inbox 插入后紧跟 `turn/start` 而无先前 `turn/end`）现在会被记为 interrupted（legacy restart pattern 关闭）。不产生新 `turn/end`，不改变 fork cut 语义，对 `resolveCutSeq` 无影响——但意味着旧 v1 会话迁移产物与 alpha.1 时代**并非逐字节相同**，alpha.1 评估遗留的「旧 v1 会话撤回冒烟」在 alpha.2 上执行时结果才有终局效力。

### 2.2 设置面板样式统一（排除）

- 插件客户端使用的全部 **23 个 `--dsw-alias-*` token**（rg 提取 [settings-cards.ts](../../src/client/settings-cards.ts)、[css.ts](../../src/client/css.ts) 等）在 alpha.2 `dsh-client-ui-theme/lib/client.js` 中逐一验证存在（bg-base/bg-layer-2/bg-layer-3/bg-module-platform/border-l1〜l4/brand-primary/interactive-bg-hover(+danger)/label-dimmed/primary/primary-foreground/secondary/tertiary/markdown-code-block/state-error-primary/state-success-primary/state-success-tertiary/state-warn-label/state-warn-tertiary）。
- `settings.plugins.tab` 根级 list slot 契约在 `dsh-client-ui-settings-plugins` 类型包中保留（ConfigurablePluginsTab / PluginsSettingsSection 不变）。
- 样式统一是官方对自家设置组件的重绘，插件自绘设置卡片只要 token 面不消失即不受影响；浅色/深色主题改善属宿主侧。

### 2.3 subprocess handle 移除 pid（排除）

- 插件 git 操作全部经 `ctx.shell.resolve`（[store.ts](../../src/host/store.ts)），dsh-shell README diff 实证 `resolve` 契约与 `CollectedOutput{text, truncated, spillPath?}` 返回零变化（仅 kill/done 的语义描述随进程清理改进微调——插件不用 kill）。
- 插件源码 rg 实证：只用 `process.pid`（宿主自身 PID 写心跳文件，[scripts.pwsh.ts](../../src/host/scripts.pwsh.ts)、[scripts.posix.ts](../../src/host/scripts.posix.ts)）与 git 锁文件名字符串 `gc.pid`，不消费 dsh subprocess handle 的 pid 字段。

### 2.4 子代理消息排队/Steer 增强（排除）

- ui-chat README 实证 user/steering 投影语义保留：「transcript echoes render at the flow tail, steering echoes render with the pending-steering marker, and queued echoes stay out of Chat」——插件 keyed renderer 覆盖 `['user','steering']` 的前提不变。
- [slots.d.ts](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/types/client/contract/slots.d.ts) 实证：`conversation.chat.node` keyed slot 契约一致；`ChatNodeOwnerProps` 含 `renderMessageImages` 与 `loadImage`；`turnProcess` 可选字段在 alpha.1 已存在（alpha.1 源码 rg 实证），非本次新增。

### 2.5 插件依赖契约逐项 diff（全局 alpha.2 实装包实证）

| 插件依赖 | alpha.2 实证 | 结论 |
|---|---|---|
| `ISessions.fork({sessionId, atSeq?, increaseTitle?})`（[recall-node.ts](../../src/client/recall-node.ts)） | [sessions.d.ts](file:///C:/Users/cc/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/sessions.d.ts) 签名与 cut 语义注释（「the boundary is the first turn/end at or after it」）与 alpha.1 逐字一致 | 不变 |
| `sessionQuery.listSessions()/readSession()`（[store.ts](../../src/host/store.ts) 等） | session-query README：读接口与 seq 保证不变，仅观察缓存内部优化 | 不变 |
| `conversation.chat.node` keyed slot + `renderMessageImages`/`loadImage` | slots.d.ts 契约一致（§2.4） | 不变 |
| `settings.plugins.tab` 根级 list slot | 类型包契约保留（§2.2） | 不变 |
| `shell.resolve` + `CollectedOutput` | README diff 仅 kill/done 描述微调 | 不变 |
| `session/event` 事件域（快照触发） | persistence README「session/event copies into a bounded internal batching window」+「Constructor seed events never emit session/event」保留 | 不变 |
| user/steering 节点投影 | ui-chat README 保留（§2.4） | 不变 |
| `workspaces.archiveSession(sessionId)` | verify:host 装配断言通过；无相关变更公告 | 不变（待正式版按台账 I7 例检） |
| `--dsw-alias-*` token 面（23 个） | 主题包逐一验证存在（§2.2） | 不变 |
| peer 范围 | [package.json](../../package.json) 已补 `>=0.1.3-alpha.2 <=0.1.3-alpha.2` 逐 tuple OR 段（提交 9c3c56b，沿 2.3.4 先例）；check:dsh 实跑确认本地 4 个实装依赖均在范围内 | 已覆盖 |

## 三、与插件功能实现的关联分析

**直接受益的模块**：

- **冷读全链路**（`resolveCutSeq` 冷分支、`titles`/`messages` 补齐端点、store 维护清理）——alpha.1 评估中确定的「冷会话撤回与标题/文本补齐变慢」被迁移流式化 + 恢复不重放流 + 共享冻结图三层修复正面解决；插件无需改动，响应时间恢复 0.1.2 水平（具体幅度待冒烟感知）。

**不受影响的模块**（证据充分）：

- **快照触发**：`session/event` 域保留，seed 不触发语义不变；
- **撤回切割**：fork 契约与 v2 seq 语义不变，迁移产物对 cut 推导的影响与 alpha.1 同构；
- **消息重绘/设置页/token 面**：§2.2/§2.4 逐项排除；
- **影子 git / exclude / 配置域**：与 dsh 变更零交集。

**遗留观察项（均为 alpha.1 遗留，非本次引入）**：

1. 旧 v1 会话撤回切割正确性——迁移产物新增 interrupted turn 记录（§2.1），逻辑推演无影响，但实弹冒烟结果以 alpha.2 为准；
2. 带文件附件消息的撤回重绘缺失——`renderMessageImages` 仍只覆盖图片，alpha.2 无变化。

## 四、影响评估结论

**总体结论：接口层面零破坏（三层门禁实跑全绿 + 契约逐项 diff 一致），无需任何代码修改；行为层面以正面影响为主——alpha.1 的唯一确定缺陷（冷会话性能回退）已被官方修复，插件冷读路径直接受益。**

- **无影响（契约实证不变）**：fork 签名与 cut 语义、sessionQuery 读接口、chat.node 槽位与 `renderMessageImages`/`loadImage`、`settings.plugins.tab`、`shell.resolve`、`archiveSession`、`session/event` 触发域、user/steering 投影、23 个 CSS token、peer 范围（9c3c56b 已同步）。
- **正面影响（性能）**：冷会话撤回与标题/文本补齐提速——v1→v2 迁移流式化 + Session 恢复不重放嵌入流 + `handle.read` 共享冻结图，三层修复均不触碰插件依赖语义。
- **遗留观察项（低，与 alpha.1 相同）**：旧 v1 会话撤回切割（迁移产物细节小变化，实弹见真章）；文件附件撤回重绘缺失（待 dsh 暴露文件渲染 API 或插件自行补绘）。

## 五、后续动作

1. ~~本地升级 + 三层门禁~~——已完成（本次评估实跑：check:upgrade 全绿）。
2. 冒烟（人工，优先级不变）：**旧 v1 会话撤回**（在 alpha.2 迁移产物上验证切割点与对话回退正确，结果以此为准）、**带文件附件消息的撤回重绘**、**盘符根 Workspace 的快照/撤回**（alpha.1 遗留项）。
3. 性能感知复查：对冷会话撤回确认→执行链路计时一次，确认恢复 0.1.2 水平（预期成立，非必做）。
4. 0.1.3 正式版发布后：重跑 `npm run check:upgrade`，按 [compat-audit.md](../compat-audit.md) 台账定点复查 I6（fork increaseTitle）/ I7（archiveSession）/ I19（两段式补全）/ I28（SessionHeader 无 title），并核对本次评估遗留项是否被正式版进一步解决。

## 证据清单

| 结论 | 证据（0.1.3-alpha.2 全局实装包 / alpha.1 源码树对照） |
|---|---|
| 三层门禁全绿 | `npm run check:upgrade` 实跑输出（check:dsh 漂移一致 + test:probe 31/31 + verify:host 装配断言） |
| 迁移流式化 / seq remap 与 end-seed cut 语义保留 | `dsh-session-format-v1-to-v2/README.md` diff（alpha.1 源码树 vs alpha.2 包） |
| 恢复不重放嵌入流 / interrupted turn 关闭 | 同上 README（validation 与 restart pattern 段落） |
| `session/event` 触发域与 seed 不触发保留 | `dsh-session-persistence/README.md` |
| `handle.read` 形状变化不外泄 | 插件源码 rg 零引用 `sessionPersistence`/`handle.read` |
| observeSession 延迟物化 / 读接口不变 | `dsh-session-query/README.md` diff |
| fork 契约逐字一致 | `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` |
| chat.node 槽位 / renderMessageImages / loadImage / turnProcess（非新增） | `dsh-client-ui-chat/lib/types/client/contract/slots.d.ts` + alpha.1 源码 rg |
| user/steering 投影与 queued echoes 排除保留 | `dsh-client-ui-chat/README.md` |
| 23 个 token 全存在 / settings.plugins.tab 保留 | `dsh-client-ui-theme/lib/client.js` 逐一验证 + `dsh-client-ui-settings-plugins` 类型包 |
| shell.resolve / CollectedOutput 不变 | `dsh-shell/README.md` diff（仅 kill/done 描述微调） |
| 插件不消费 handle.pid | `src/host/scripts.pwsh.ts`、`scripts.posix.ts` rg（仅 `process.pid` 心跳与 `gc.pid` 锁文件名） |
| peer 范围已覆盖 alpha.2 | `package.json`（提交 9c3c56b）+ check:dsh 实跑 |
