# dsh v0.1.5-rc.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.5-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)（commit `183f08e`，2026-09-10 发布；0.1.5 系列首个候选版本，**npm dist-tag `latest` 与 `next` 已指向本版**，`npm install -g @deepseek-ai/dsh@0.1.5-rc.1` 全局实装）
> 本地基线：dsh 0.1.5-rc.1（本次全局实装）；对照源：[dsh-0.1.5-alpha.2.md](./dsh-0.1.5-alpha.2.md)
> 评估方式：release notes 筛查（本版为 v0.1.2-rc.1 以来的汇总版，逐项已在 alpha.1/alpha.2 评估中覆盖）+ **全局实装包 tree-SHA diff**（插件消费面 12 个包 alpha.2↔rc.1 目录树哈希全部相同）+ **三层门禁实跑**（check:dsh 报漂移/peer 越界 + test:probe 31 项探针全绿 + verify:host 装配断言全过）+ **官方文档镜像按 rc.1 tag 重拉比对**（13 源内容零差异）
> 总结论：**接口层面零破坏、行为层面无回归——无需任何代码修改。** rc.1 相对 alpha.2 是纯发布层推进（版本号 + 依赖 pin），插件消费面源码逐字节未变；release notes 中三项开发者 API 调整（`ctx.agent` 移除、`Inbox` type-only、面板 `conversation`→`main.conversation`）均已在 alpha.1/alpha.2 逐项排除。需跟进项（peer 范围越界 / 镜像与契约文档漂移）已随本次同步处理完毕，非代码缺陷。

## 一、更新日志梳理与初步判断

本版是 0.1.5 系列首个候选版本（RC），release notes 为 **v0.1.2-rc.1 → v0.1.5-rc.1 的汇总**（Full Changelog 对比基线是 v0.1.2-rc.1），因此其中每一项变更都已在 0.1.3-alpha.1/alpha.2、0.1.5-alpha.1/alpha.2 的评估中逐项核查过。按「是否命中插件依赖面」（对照 [dsh-contract.md](../dsh-contract.md) 建档的依赖面）复查汇总清单：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **插件 Agent API 调整**：移除 `ctx.agent`（单数），调用方显式传 Agent | 其他 | 中疑点 | **无影响**——插件只用 `ctx.agents`（复数注册表），rg 实证零处单数引用（alpha.1 已排除，见 compat-audit 0.1.5-alpha.1 段） |
| **Inbox API 调整**：`Inbox` 改 type-only 接口，`hasPending`/`claim` 退出公共接口 | 其他 | 中疑点 | **无影响**——插件零处 `Inbox`/`hasPending`/`claim` 引用（alpha.1 已排除） |
| **Web 插件面板 API 调整**：`sidebar.panellist`/`main` 全局面板注册；原 `conversation` Slot 迁移为 `main` 的 `conversation` key | 其他 | **高疑点** | **无破坏**——插件从不注册顶层 `conversation` slot，只用 `conversation.chat.node`（keyed/session，路径不变）与 `settings.plugin.item`（不变）；`ctx.get('conversation')` 是服务访问非 slot（alpha.2 已深挖，见 dsh-0.1.5-alpha.2.md §2.1） |
| **Session 数据格式 V3** | 其他 | 已于 alpha.1 深挖 | **无新变化**——rc.1 相对 alpha.2 的 `dsh-session`/`dsh-session-format*` 类型源 tree-SHA 未动 |
| **Session 生命周期变更**：`SessionHandle` 生命周期持有、`agentLoop.create()` 异步化、session 锁 | 其他 | 已于 alpha.1 深挖 | **无外泄**——persistence seam 内部重构（alpha.1 台账记录「SessionHandle 为 persistence seam 内部重构不外泄」），rc.1 消费面包类型源未变 |
| 默认工具调整、子代理消息排队/Steer、动态系统提示词、DeepSeek-V41-Flash、通用文件上传、Sidebar 多标签预览、模型探测、HTTP 代理遵循、顶栏「在应用中打开」、`/feedback` 明细、pi-ai 诊断、Base URL 校验、文件夹选择器、Composer 占位、MCP 分页、fs-ext 免编译、设置本地化、长会话性能、Windows 子进程控制台隐藏、persona 前后缀拆分、Agent Teams 可安装等 | 新增/修复/优化/其他 | 无关 | 无关——UI/模型/MCP/发布层，与撤回链路零交集（各项在 alpha.1/alpha.2 评估中已筛查） |

**初步判断：rc.1 无新增契约点**——本版相对 alpha.2 的全部差异应为发布层（版本号、依赖 pin、rc 转正铺垫）。

## 二、实证核验

### 2.1 插件消费面 tree-SHA 比对（alpha.2 ↔ rc.1）

方法：隔离安装 `@deepseek-ai/dsh@0.1.5-alpha.2` 全量依赖树，与全局实装的 rc.1 内嵌包逐文件 SHA1 聚合为目录树哈希（SHA256）。比对范围覆盖插件源码 import 面 + dsh-contract.md 建档的全部类型源所在包：

| 包 | tree-SHA 结果 |
|---|---|
| `dsh-session`（types.d.ts：事件/Session 形状） | SAME（25 files） |
| `dsh-client-ui-chat`（contract/slots.d.ts：`conversation.chat.node` 声明） | SAME（75 files） |
| `dsh-client-ui-conversation`（contract/slots.d.ts：conversation 域槽位） | SAME（63 files） |
| `dsh-api-session-controller`（client/contract/sessions.d.ts：`ISessions.fork`） | SAME（79 files） |
| `dsh-client-ui-settings-plugins`（slot-contract.d.ts：`settings.plugin.item`） | SAME（25 files） |
| `dsh-settings` / `dsh-shell` / `dsh-session-query` / `dsh-host-webserver` / `dsh-sandbox-policy` | SAME |
| `cordis`（4.0.2）/ `schemastery`（3.18.2） | SAME |

**结论：插件消费面源码零 diff——rc.1 相对 alpha.2 无任何类型/契约变化。**

### 2.2 官方文档镜像重拉比对（rc.1 tag）

按 `docs/reference/README.md` 更新方式表，从 `dsh-v0.1.5-rc.1` tag 重拉 13 份镜像源文件，与现存档（alpha.2 归档）逐文件比对：**13 源内容零差异**（11-cookbook-conversation-node.md 仅换行符 CRLF/LF 噪声，`git diff --ignore-cr-at-eol` 为空）。本次无需覆盖任何镜像文件，仅同步 README 头部「归档日期/归档 dsh 版本」字段。

### 2.3 三层门禁实跑

- `npm run test:probe`：31/31 全绿（api-surface 29 项 + stdin 落盘 2 项）——slot props、服务方法签名、事件形状等运行时探针在 rc.1 上继续成立；
- `npm run verify:host`：装配断言全过（inject=shell,sessions,webServer,agents，端点 12 项）；
- `npm run check:dsh`：报镜像/契约漂移（rc.1 vs alpha.2 记录）与 7 个 peer 越界——属预期哨兵行为，随本次同步处理；
- `npm test`：307/307 通过。

### 2.4 release notes 汇总项的依赖面交叉复查

对 §一 表格中四项「已于 alpha 排除」的关键项做 rc.1 实况复核：

1. **面板槽位树**：rc.1 的 ui-chat/ui-conversation `slots.d.ts` 与 alpha.2 逐字节相同（§2.1），`conversation.chat.node` keyed/session 声明未动；
2. **fork 契约**：rc.1 的 session-controller `sessions.d.ts` 未动，`fork({sessionId, atSeq?, increaseTitle?})` 签名延续（I6 台账）；
3. **事件全集**：rc.1 的 `dsh-session/lib/types` 未动，54 种事件清单不变，`deliverables/presented` 插件零消费；
4. **`ctx.agent`/`Inbox`**：插件源码 rg 复核仍零引用（`ctx.agent\b|\.inbox|hasPending|\.claim\(` 无命中）。

## 三、与插件功能实现的关联分析

**核心依赖面全部命中「契约未变」**（与 alpha.2 评估表一致，证据升级为 tree-SHA 逐字节相同）：

| 插件模块/功能点 | 依赖面 | rc.1 实证 |
|---|---|---|
| 撤回按钮注册（[app.ts](../../src/client/app.ts)） | `conversation.chat.node` keyed/session | ui-chat 包 tree-SHA 与 alpha.2 相同 |
| 设置卡片（[settings-cards.ts](../../src/client/settings-cards.ts)） | `settings.plugin.item` | settings-plugins 包 tree-SHA 相同 |
| 用户消息重绘（[recall-node.ts](../../src/client/recall-node.ts)） | `renderMessageImages` / `loadImage` | 同上（slots.d.ts 未动） |
| 对话回退 fork（[snapshots.ts](../../src/host/snapshots.ts)） | `sessions.fork({sessionId, atSeq})` | session-controller 包 tree-SHA 相同 |
| 快照触发/冷读/scanCutSeq | `session/event`、`user/message`、`turn/end`、`session/title` | dsh-session 包 tree-SHA 相同 |
| 影子 git / exclude / 配置域 / 串行队列 | 与 dsh 变更零交集 | — |
| P0-1 agent 拦截 | `ctx.agents`（复数） | 无相关变更 |

**观察项（均为 alpha.1 遗留，非本次引入）**：旧 V1/V2 会话撤回切割实弹冒烟、带文件附件消息的撤回重绘、本地 POSIX 路径图片重绘——rc.1 作为 0.1.5 系列候选版本，正是这三项人工冒烟的合适载体。

## 四、影响评估结论

**总体结论：接口层面零破坏、行为层面无回归——无需任何代码修改。**

- **影响程度：无破坏性影响**。rc.1 相对 alpha.2 是纯发布层推进，插件消费面 12 包 tree-SHA 全部逐字节相同；
- **具体表现**：沿用现有插件在 rc.1 上功能与 0.1.5-alpha.2 一致（撤回按钮、fork 回退、设置页均正常），无失效点；
- **版本策略**：peer 范围沿逐 tuple OR 窗口先例补 `>=0.1.5-rc.1 <=0.1.5-rc.1` 段——rc 与 alpha 同 tuple（0.1.5）但 semver 排序独立，不显式放行则 `npm install` 会拦。

## 五、后续动作

1. ~~全局实装~~——已完成：`npm install -g @deepseek-ai/dsh@0.1.5-rc.1`（dist-tag `latest` 已指向本版）。
2. ~~三层门禁复跑~~——已完成：`test:probe` 31/31、`verify:host` 装配断言全过、`npm test` 307/307；`check:dsh` 报漂移/peer 越界，转入第 3/4 步处理。
3. ~~同步兼容声明~~——已完成：package.json `dshReleases` 矩阵补 `0.1.5-rc.1`、7 个 dsh-* peer 范围补 `|| >=0.1.5-rc.1 <=0.1.5-rc.1` tuple（沿 9c3c56b 先例）。
4. ~~同步契约文档~~——已完成：reference/ 镜像按 rc.1 tag 重拉核验（13 源零差异，未覆盖文件）、reference/README 归档版本字段与 dsh-contract.md「对应版本」同步至 0.1.5-rc.1、compat-audit 追加核验段。
5. 冒烟（人工）：rc.1 是 0.1.5 系列首个候选版本，建议在本版执行 alpha.1 遗留三项观察项——旧 V1/V2 会话撤回切割、带附件消息撤回重绘、本地 POSIX 路径图片重绘。
6. 0.1.5 正式版发布后：重跑 `npm run check:upgrade`，按 compat-audit 台账定点复查 I6/I7/I19/I28，核对 V3 相关不变量是否需新增条目。

## 证据清单

| 结论 | 证据 |
|---|---|
| 消费面源码零 diff | 隔离安装 alpha.2 全量依赖树 vs 全局 rc.1 内嵌包，12 个消费面包目录树哈希（SHA1 逐文件 → SHA256 聚合）全部相同 |
| 镜像零变化 | 按 `dsh-v0.1.5-rc.1` tag 重拉 13 源，`git diff --no-index --ignore-cr-at-eol` 全部为空 |
| fork 契约延续 | `dsh-api-session-controller` 包 tree-SHA 与 alpha.2 相同（`sessions.d.ts` 未动） |
| 槽位契约延续 | `dsh-client-ui-chat`/`dsh-client-ui-conversation`/`dsh-client-ui-settings-plugins` tree-SHA 相同 |
| `ctx.agent`/`Inbox` 零引用 | 插件源码 rg：`ctx\.agent\b|\.inbox|hasPending|\.claim\(` 无命中 |
| npm 发布实况 | `npm view @deepseek-ai/dsh dist-tags`：`latest`/`next` → `0.1.5-rc.1`，`alpha` 停留 `0.1.5-alpha.2` |
| 三层门禁实跑 | `test:probe` 31/31、`verify:host` 装配断言通过、`npm test` 307/307；`check:dsh` 同步 peer/镜像/契约字段后复跑 |
| tag commit | `gh api repos/.../git/ref/tags/dsh-v0.1.5-rc.1` → `183f08e` |
