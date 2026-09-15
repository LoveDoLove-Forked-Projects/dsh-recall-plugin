# dsh v0.1.6-alpha.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.6-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1)（npm dist-tag `alpha` 指向本版；`latest` 仍为 0.1.5-rc.1、`next` 仍为 0.1.5-rc.2；0.1.6 线首个预发布，`npm install -g @deepseek-ai/dsh@alpha` 全局实装）
> 本地基线：dsh 0.1.6-alpha.1（本次全局实装）；对照源：[dsh-0.1.5-rc.2.md](./dsh-0.1.5-rc.2.md)
> 评估方式：release notes 逐条筛查（新增/优化/修复/其他变更四类，重点比对插件系统、消息处理、API 接口）+ **tag 对比筛选**（rc.2→alpha.1 共 800 commits / 300 文件，绝大多数是 monorepo 全包版本 bump 与 `.agents/notes/` 实施记录；插件消费面源码命中逐项核验本机实装产物）+ **三层门禁实跑**（test:probe 32 例、verify:host 装配断言、npm test 330/330）
> 总结论：**接口层面零破坏**——插件全部消费点（fork 签名、`sessions`/`sessionQuery` 读取面、`shell.run`、回填链 `createDrafts`/`addAttachments`/`releaseDraftAttachments`、`conversation.chat.node` 槽位与 props）在本机 0.1.6-alpha.1 实装中逐一经 `.d.ts`/构建产物核验在位；**行为层面一项正面变化**——`sessions.fork` 切点语义由「向后推进到下一个 `turn/start`」改为「精确切到选中 `turn/end`（`cut = boundary.seq + 1`）」，撤回残留排队消息（I35）被官方根治，探针如 2.3.20 设计预期变红后改钉新语义。

## 一、更新日志梳理与初步判断

release notes 四类中与「插件系统 / 消息处理 / API 接口」相关、需插件侧核查的条目：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **fork 按轮次分叉带入后续输入/设置** 修复 | 修复 | 高相关——直接命中撤回主链路（`sessions.fork`） | **正面变化**——官方将切点改为「复制截至选中 `turn/end` 的连续前缀并含该事件，结束事件之后的排队输入、标题、模型设置均不入 seed」。实装产物 `dsh-api-session-controller/lib/index.js` 确认 `cut = SessionLogOffset(boundary.seq + 1)`，旧「向后跳过非 `turn/start`」推进循环已移除。撤回残留排队消息（I35）从源头消失 |
| **弃用同步历史读取 `snapshotEvents`/`eventAt`/`ownEvents`** | 其他变更 | 中相关——插件内存跳读用 `snapshotEvents()` | **本版无破坏**——决策仅标 `@deprecated` JSDoc，「current Session implementation still retains the complete event sequence in memory」，方法仍在、行为不变（探针绿）。列为**前瞻观察项**：官方存储方向停止常驻全量事件后，`snapshotEvents` 有移除风险，届时插件内存跳落 `observeSession`/`readSession` 降级链（已具备） |
| **`SandboxProvider.confine` 与 `ShellExecutor.start` 改可取消异步** | 其他变更 | 低相关——插件走 shell 执行 | **无影响**——插件 `runShell` 用 `shell.resolve` + `shell.run`（前台），从不调 `start`（后台句柄）或 `confine`；`ShellRunResult` 形状（`exitCode`/`stdout.truncated`）探针绿、类型源在位 |
| **`agent/session-start` 改异步串行 `agent/created`** | 其他变更 | 低相关——插件声明 `agents` 服务 | **无影响**——插件不订阅 `agent/session-start` 事件；`agents` 面仅用 `list()`/`get()`/`status`/`session.header.cwd`（P0-1 运行中拦截），探针三项锚点全绿 |
| **新增 `image offload` 会话事件** | 其他变更 | 低相关——触及会话事件流 | **无影响**——插件事件扫描按具体 `type` 匹配（`turn/end`/`turn/start`/`user/message`/`agent/inbox/spliced`），未知新事件类型一律忽略；该事件不改变既有事件 seq 空间与切点解析 |
| **PTC 包名/服务名统一 `ptc-runtime`、工作流执行器改 `workflow-ptc`、移除 E2B、Ralph 默认关** | 其他变更 | 无关——插件不注册 tool、不消费 PTC/工作流/E2B/Ralph | 无关，零交集 |
| **Web 侧边栏终端、已归档会话列表、MCP SDK v2、Browser/Computer Use、Auto review、DeepSeek Messages 协议** | 新增功能 | 无关——均为宿主新功能，未触及插件消费的槽位/服务契约 | 无关（`conversation.chat.node`/`settings` slot 探针绿；归档会话列表是官方自带，与撤回的 `archiveOriginal` 并存、不冲突） |
| **输入框加号菜单重组、移除独立附件按钮** | 优化 | 低相关——回填附件走 `shell.actions.addAttachments` | **无影响**——回填链是程序化调用（`createDrafts`→`addAttachments`），不依赖被移除的独立附件按钮 DOM；类型源 `addAttachments`/`createDrafts`/`releaseDraftAttachments` 在位 |

## 二、实证核验

### 2.1 消费面改动筛选（rc.2 → 0.1.6-alpha.1）

`gh api .../compare/dsh-v0.1.5-rc.2...dsh-v0.1.6-alpha.1`：800 commits、300 文件（compare 上限）。按插件消费面包路径 + 类型源/实装产物过滤，唯一**行为级**命中：

| 文件 | 命中判定 |
|---|---|
| `dsh-api-session-controller` fork 实现（`lib/index.js`） | 切点语义变更：删「向后推进」循环、`cut` 固定 `boundary.seq+1`。正面变化，触发 fork 切点探针变红（按设计更新锚点） |

其余消费面包（`dsh-session`、`dsh-client-ui-chat`/`ui-conversation` 的 `slots.d.ts`、`dsh-settings`、`dsh-shell`、`dsh-session-query`、`dsh-host-webserver`、`dsh-sandbox-policy`、`cordis`、`schemastery`）的**插件读取字段与签名全部在位**（探针 + 本机 `.d.ts` 双核）。`.agents/notes/` 命中为实施记录文档，非源码。

### 2.2 三层门禁实跑（本机 0.1.6-alpha.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run test:probe` | 32 例：31 绿 + 1 红（fork 切点「向后推进」锚点，官方已改固定切分）；更新锚点为 `cut = boundary.seq + 1` 后 32/32 复绿 |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项，agents 桩访问 1 次） |
| `npm test` | 330/330 通过（27 文件） |
| `npm run check:dsh` | 报镜像/契约漂移（本地 0.1.6-alpha.1 ≠ 记录 0.1.5-rc.2）与 6 个 dsh-* peer 越界（0.1.6 为新 minor 线，`<0.1.6` 上界拦截）；本次同步处理：peer 开 `>=0.1.6-alpha.1 <0.1.7` 段、`dshReleases` 补 `0.1.6-alpha.1`、镜像与契约字段同步 |

## 三、版本策略与结论

- **影响程度**：接口零破坏；行为面一项**正向**修复（I35 排队残留根治）。撤回主链路、快照、回退、回填、设置页、管理端点均无回归。
- **版本策略**：0.1.6 是新 minor 线，按「开窗到下一 minor」约定为 7 个 dsh-* peer 各追加 `>=0.1.6-alpha.1 <0.1.7` 段（保留 0.1.5 段——同线内 rc.2 等自动放行）；`dsh.compatibility.dshReleases` 补 `0.1.6-alpha.1: compatible`；`version` bump 至 2.3.21（兼容性声明载体，本轮不发布）。
- **残留排队清理（G1）不退役**：peer 范围仍含 0.1.5 线，该线上 fork 切点未修复、残留排队消息仍存在，`scanStaleQueueItemIds`/`updateQueue` 清理对 0.1.5 用户仍必要；对 0.1.6 用户退化为 `queue-item-not-found` 吞掉的无害空操作。I35 复查动作据此更新。
- **`snapshotEvents` 前瞻观察**：本版仅 `@deprecated` 未移除，插件内存跳读照常；官方存储方向若停止常驻全量事件，降级链（`observeSession`→`readSession`）已具备，无需预防性改动。

## 四、后续动作

1. ~~全局实装 + 三层门禁复跑~~——已完成（见 §2.2）。
2. ~~镜像 / 契约 / 台账同步~~——进行中：`reference/README.md` 归档字段、`dsh-contract.md`「对应版本」、`compat-audit.md` 核验段与 I35 条目、README 双语兼容声明、CHANGELOG 2.3.21。
3. 冒烟（人工，0.1.6-alpha.1）：重点验证「agent 运行中发送、随后被撤回」的消息，子会话输入框上方**不再出现**排队消息（I35 根治的正向确认）；其余沿用 smoke-checklist 既有节。
4. 0.1.5 遗留观察项（旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟；0.1.6 正式版发布后重跑 `npm run check:upgrade`。
