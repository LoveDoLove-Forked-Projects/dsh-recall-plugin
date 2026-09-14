# Host 自建 seed fork 计划：撤回排队残留的源头消除

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：实施中（H0 已实施并实弹验收，H1–H5 待做）
> 实证底稿：dsh 0.1.5-rc.1 本机全局安装实码（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`，下文出处均指该目录内文件行号）；实弹验证环境为 dsh 0.1.5-rc.1 + dsh-recall-plugin 2.3.19（2026-09-14，沙箱工作区）。
> H0（清理链加固 + 客户端匹配断点）已独立实施，改走不依赖队列快照匹配的按 id 直删；H1 版本矩阵是 H2–H4 的前置门禁。

## 背景：为什么做

撤回的对话半走官方 `sessions.fork({ sessionId, atSeq })`。官方 fork 的切点推进规则是「`atSeq` 之后首个 `turn/end` 为 boundary，cut 继续推进到下一个 `turn/start` 为止」，这段「boundary → 下一 turn/start」窗口内的全部事件被复制进子会话 seed（`dsh-api-session-controller/lib/index.js:682-685,698`）。dsh 自 0.1.2-alpha.1 引入运行中排队发送后，被撤回消息的 inbox 入队事件（`agent/inbox/spliced`）恰好落在该窗口内，子会话重建 inbox 后输入框上方多出一条已撤回的排队消息。

现状缓解是事后清理：Host `resolveStaleQueueItemIds` 取出窗口内 user 来源入队项的 item id（= 该消息的 message id，也是官方 `updateQueue` 的寻址键，[snapshots.ts](../../../src/host/snapshots.ts) `scanStaleQueueItemIds`），随 execute 响应下发，Client 在子会话上按 id 直调 `updateQueue(itemId, { kind: 'remove' })`（[recall-node.ts](../../../src/client/recall-node.ts) `removeStaleQueueItems`）。早先的 rpcId + 队列快照匹配路线在真机上从未命中：残留卡片常驻输入框上方（刷新后仍在，来自 host 队列数据），30 秒窗口内匹配不到队列行后弹 toast 并 `console.warn`；实弹把失效段锁定在客户端匹配环节，故改走不依赖匹配的直删路径（见 H0）。残留的另一形态：子会话被驱动时该入队项会被当作真实一轮消费。

本计划把缓解换成源头消除：**Host 侧复刻官方 fork 的内部通路，用截断到 boundary 的 seed 直接创建子会话**——残留事件不进 seed，事后清理对 host-seed 路径不再必要。实弹验证已给出该路径的直接依据：官方 fork 复制进子会话的入队项会被重建为可见排队卡片（刷新后仍在），在另一次实测中还会被当作真实一轮消费——两种形态都只有「不让它进 seed」能根治。

## 探针结论（P0/P1 已完成，0.1.5-rc.1 实码实证）

### P0：官方 fork 全副作用清单

`fork(request)`（`dsh-api-session-controller/lib/index.js:660-730`）依次做：

| # | 副作用 | 出处 | 自建方案对策 |
|---|---|---|---|
| 1 | `sessionQuery.observeSession(parentId)` 取全量日志租约（restore 模式，含继承前缀） | :675 | 插件读取链已有同款调用（`resolveStaleQueueItemIds` 第二跳） |
| 2 | boundary = `atSeq` 后首个 `turn/end`；cut 推进至下一 `turn/start` | :682-685 | 不复刻窗口推进——seed 截断于 `boundary.seq + 1` |
| 3 | `forkWorkspace`：`workspaceRegistry.list()` 找 `sessionIds` 含父会话的 workspace | :913-922 | `ctx.get('workspaceRegistry')` 同款调用 |
| 4 | `childId = session-${randomUUID()}` | :692 | 同形生成 |
| 5 | preset 组合：租约 `projections.values.agentPreset` → `agentPresets.mount`；服务缺席时退化为仅 installSelection | :354-367,471-474 | 同形复刻（含退化分支） |
| 6 | `agentDefaultModel.currentSelection()` → `agentOptions { provider, model }` | :695 | `ctx.get('agentDefaultModel')` 同款调用 |
| 7 | `ctx.agents.create({ sessionId, seed, inheritedEventCount, meta: { cwd?, parentSession, isSeeded: true, agentPreset? }, agentOptions, setup })` | :696-711 | **本计划核心调用** |
| 8 | `workspace.attachSession(childId)` | :715-722 | 同对策 3 |
| 9 | 不碰标题（标题全靠 seed 内 `session/title` 事件继承）、不归档父会话 | 全函数无此调用 | 归档保持 Client 现状 `archiveSession`；标题见 H2 回放规则 |

`ctx.agents.create` 经 agent-loop 注册工厂完成 `Session` 构建 → 持久化（`createStoredSession`）→ setup → 发布（注册 + `agent/created` + loop 启动）（`dsh-agent/lib/index.js:417`、`dsh-agent-loop/lib/index.js:1818-1838`）。插件 Host 已声明 `inject = ['shell', 'sessions', 'agents']`（[index.ts](../../../src/host/index.ts)），`create` 方法就在该服务上，调用通路今天即存在。

### P1：`Session.create` 校验 = 内部一致性，无父日志比对

构造器对 seed 的全部校验（`dsh-session/lib/index.js:1063-1088`）：

1. 逐事件：可无损 JSON 序列化；envelope 断言；**`seq === index`（从 0 连续）**；surface 转移合法；
2. `isSeeded` 必须带显式 seed 与 `inheritedEventCount`；
3. snapshot 模式 + `isSeeded` ⇒ **`inheritedEventCount === log.length`**（「seed must equal its inherited prefix」）。

**没有任何与父会话日志的重推导比对**。因此「父日志严格前缀」是天然合法 seed：seq 连续性、surface 前缀合法性都由原日志继承。构造器随后在 `firstLiveSeq` 处追加 `session/end-seed { inherited: true }` 标记（:1086，不发布）。

### 步骤 0：现有清理链静态核对（0.1.5-rc.1）

| 契约点 | 现状 | 出处 |
|---|---|---|
| Host 队列帧 `promptRpcId` 透传 | 在位 | `dsh-api-session-controller/lib/index.js:1151-1174` |
| Client 队列行 `rpcId`/`placement` | 在位 | 同包 `client.js:978-991`（`SessionQueueMirror.replace`） |
| 会话面 `getSnapshot()` / `updateQueue(itemId, action)` | 在位（`updateQueue` 按 item id 寻址，H0 的直删依据） | 同包 `client.js:865,1724` |
| 读取链第一跳 `sessions.get(id).events` | **恒不命中**：`Session` 无 `events` 访问器，仅 `snapshotEvents()` | `dsh-session/lib/index.js:1107` |

上表是诊断期对客户端链路的静态核对：帧与队列行的 rpcId 契约确实在位，但真机匹配从未命中，故 H0 改走不依赖队列快照的按 id 直删；读取链第一跳恒不命中也已确证，内存跳改用 `snapshotEvents()`。

### 实弹验证（2026-09-14，dsh 0.1.5-rc.1 + dsh-recall-plugin 2.3.19）

方法：真实 `~/.dsh` + 沙箱工作区（`D:\tmp\recall-h0`，经 `workspace/create` 独立注册），会话与消息经官方 HTTP RPC（`session/create`、`session/prompt`）建立，Host 侧判别经插件端点 `/api/recall/{preview,execute}` 直读响应；用户可见现象经浏览器走完整 UI 路径。

| 观测项 | 结果 |
|---|---|
| fork 切点窗口 | `turn/end`(seq 17) → `agent/inbox/spliced`（seq 18，被撤回消息的入队）→ `turn/start`(seq 19)；`preview` 回传 `cutSeq: 17` |
| Host `staleQueueRpcIds`（磁盘已刷） | `{"ok":true,"count":1,"cutSeq":17,"staleQueueRpcIds":["req-h0-2"]}` |
| Host `staleQueueRpcIds`（turn 结束后紧接调用） | `{"ok":true,"cutSeq":25,"staleQueueRpcIds":["req-h0-3"]}` |
| 事件落盘滞后 | `turn/end` 事件 `time` 与日志文件 mtime 差约 6ms |
| 官方 fork 的 seed | 子会话继承 seq 18 的 splice；`session/end-seed {inherited:true}` 落在其后（seq 19） |
| 子会话残留形态 | inbox 重建出该入队项：UI 渲染为输入框上方排队卡片，刷新页面后仍在（host 侧数据）；另一实测会话中该项被当作真实一轮消费（子会话出现该消息的 `user/message` 及回复） |
| 客户端清理（修复前） | 30s 后 `console.warn`：`[dsh-recall-plugin] 残留排队消息自动清理未生效（30s 内队列快照未出现匹配项）： ["8298c305-…"]`，并弹 toast「撤回前的一条排队消息未被自动清理…」 |
| 修复后验收（H0） | 子会话日志出现 `agent/inbox/spliced inserted=[] removed=1`（入队项当场移除）；同 item 重复删返回 `queue-item-not-found`；控制台零告警 |

结论：Host 读取链与 rpcId 下发均正常（两例取值正确），落盘不滞后（≈6ms），官方 fork 把 splice 复制进 seed 属既定行为。断点收窄为二者之一：子会话队列行未携带 `rpcId`（`SessionQueueMirror.replace` 的条件透传依赖 host 帧字段），或插件读取的队列快照与渲染队列不同源/时序落后。两者都只影响事后清理，不影响 host-seed 立论——截断 seed 后 seq 18 一类事件根本不进子会话。

## 任务总览

| 项 | 主题 | 前置依赖 | 发版策略 |
|---|---|---|---|
| H0 | 客户端匹配断点定位 + 读取链加固（按 item id 直删） | 已实施（2026-09-14） | 独立先发（patch） |
| H1 | P2 版本能力矩阵探针 | 无 | 不发版，产出进台账 |
| H2 | seed 构造纯函数 + 窗口事件白名单普查（P4） | 无（白名单以普查结论为准） | 随 H3 |
| H3 | Host fork-seeded 端点（装配 + workspace attach + lineage） | H1、H2 | 主体发版（minor） |
| H4 | Client 分支接入 + 双轨观察期 | H3 | 随 H3 |
| H5 | P3 沙箱端到端 + 门禁固化 | H3、H4 | 随 H3 |

---

## H0 客户端匹配断点定位 + 读取链加固（已实施，2026-09-14）

### 结论

Host 侧解析与下发都正常：execute 响应稳定带出窗口内入队项身份；落盘不滞后（事件 `time` 与日志文件 mtime 差约 6ms）。失效段在客户端匹配——残留卡片可稳定复现（UI 刷新后仍在，证明来自 host 队列数据），30 秒窗口内匹配不到队列行，随后 `console.warn` + toast。修法改走不依赖匹配的路径：按官方 `updateQueue` 的寻址键（`inserted[].id` = 该消息的 message id）直删。实测：直删返回 `accepted:true`，重复删返回 `queue-item-not-found`。

### 交付

| 层 | 改动 |
|---|---|
| Host | `scanStaleQueueItemIds` 取窗口内 user 来源入队项的 `item.id`；`resolveStaleQueueItemIds` 的读取链顺序改为内存 `snapshotEvents()` → `observeSession` → `readSession`；execute 响应字段 `staleQueueRpcIds` → `staleQueueItemIds` |
| Client | `removeStaleQueueItems`：拿到 childId 后按 id 逐项直删，队列快照匹配与 30 秒轮询整段移除；仅会话面未就绪时做 5 秒短等待，超时仍 `console.warn` + toast 明示手动路径 |
| 契约 | `Session` 补 `snapshotEvents?()`、`events` 降为旧版可选字段；`agent/inbox/spliced.inserted[].id` 入类型 |

### 验收证据

- 真机（UI 全链路）：撤回两轮会话的第二条消息 → 子会话日志出现 `agent/inbox/spliced inserted=[] removed=1`（入队项当场移除），控制台零告警；RPC 复核该 item 返回 `queue-item-not-found`；
- 门禁：单测 330、探针 34、`verify:host` 12 端点、`typecheck`、`build` 全绿；台账 I35、AGENTS.md G1、CHANGELOG 同步。

### 剩余缺口

`session-info.ts` 与 `resolveCutSeq` 的内存跳仍读 `events` 字段（0.1.5-rc.1 恒不命中，因有磁盘降级链兜底而行为正确，代价是多一次磁盘读）——换 `snapshotEvents()` 即可，与撤回主流程无耦合。

---

## H1 P2 版本能力矩阵探针

### 目标

确定 host-seed 通路的四个服务依赖在全部受支持 dsh 版本（0.1.2-alpha.1 … 0.1.5-rc.2，10 个）上的存在性与签名，产出能力矩阵，定门控阈值。

### 任务分解

1. 逐版本核对（全局安装实码或 GitHub tag 源码，方法与 upgrade-assessments 一致）：
   - `ctx.agents.create`（`dsh-agent`）：存在性、options 形状（`seed`/`inheritedEventCount`/`meta`/`agentOptions`/`setup`）；
   - `Session` 构造器校验规则（`dsh-session`）：是否同为内部一致性（重点核对 seq 连续性断言与 `inheritedEventCount === log.length` 的引入版本）；
   - `workspaceRegistry`（list + `attachSession`）：服务名与形状；
   - `agentDefaultModel.currentSelection`、`agentPresets`（resolve/mount）：存在性与缺席时的退化路径；
   - `sessionQuery.observeSession` 租约是否带 `projections`（preset 读取来源）。
2. 产出「版本 × 能力」矩阵进 [compat-audit.md](../../compat-audit.md) 台账；门控规则：**全部依赖在位才启用 host-seed，任一缺席回落现状路径**。

### 验收

- 矩阵覆盖 10 个版本，每格有出处（tag + 文件）；门控阈值写成表格结论。

### 风险与回退

- 低版本缺 `agents.create` 是预期内结果，不构成方案风险（回落路径由 H0 保障）。

---

## H2 seed 构造纯函数 + 窗口事件白名单普查

### 目标

产出 `buildRecallSeed(events, cutSeq)` 纯函数：输入父会话全量事件与切点，输出 `{ seed, inheritedEventCount }`，保证通过 `Session.create` 全部校验且不含排队入队事件。

### 任务分解

1. **白名单普查（P4）**：统计真实会话日志中「boundary turn/end → 下一 turn/start」窗口内出现的事件类型全集（本机 `~/.dsh` 日志即可）。已知成员：`agent/inbox/spliced`（丢弃对象）。实弹观测到自动标题 `session/title` 落在 `turn/start` 与 `turn/end` 之间（沙箱会话 seq 12/14 早于 `turn/end` 17），严格前缀截断天然保留标题；窗口内是否仍出现标题事件按普查样本定，白名单保留保守项，终稿以普查结论为准。
2. **构造规则**（模块级纯函数，`src/host/` 新文件或并入 snapshots.ts，单测钉住）：
   - `seed = events[0 .. boundary.seq]`（严格前缀，boundary 解析复用 `scanCutSeq` 的 turn/end 语义）；
   - 窗口内白名单事件（初定仅 `session/title`）**重戳 seq 续接**追加（seq 从 0 连续性不破；其余字段原样）；
   - 窗口内其余事件整段丢弃——与现状清理语义对齐（`scanStaleQueueItemIds` 取窗口内全部 user 来源入队项）；
   - `inheritedEventCount = seed.length`。
3. 单测：含标题窗口/无标题窗口/多排队消息/撤回链（父为 seeded、事件含 `session/end-seed`）/boundary 即末尾等用例；断言输出过「模拟校验器」（按 P1 四条规则实现的测试替身）。

### 验收

- 纯函数 + 单测全绿；普查报告附白名单终稿（进本文实施记录）。

### 风险与回退

- **标题事件形状漂移**（如标题改为 projection 独有、不再落日志）：普查与探针双重确认；若无 `session/title` 事件可回放，子会话标题由官方标题服务按首条 prompt 重新生成——行为差异须在验收时明确取舍（可接受 / 改走 rename 补写）。
- 白名单遗漏某类窗口事件 = 该类事件在子会话丢失：普查覆盖真实日志全集后接受该残余风险。

---

## H3 Host fork-seeded 端点

### 目标

新增 Host 端点（如 `fork-seeded`）：输入 `{ sessionId, cutSeq }`，完成 P0 清单的全部装配，成功返回 `{ ok: true, childId }`，任一前置缺失返回 `{ ok: false, reason }` 供 Client 回落。

### 任务分解

1. **读取与构造**：复用 H0 后的读取链取父会话全量事件 → `buildRecallSeed`（H2）。
2. **装配**（与 P0 清单逐项对账）：
   - `childId`：`session-${randomUUID()}` 同形；
   - `meta`：`{ cwd?, parentSession, isSeeded: true, agentPreset? }`（agentPreset 读租约 `projections?.values?.agentPreset`，缺席则省略）；
   - `agentOptions`：`ctx.get('agentDefaultModel')?.currentSelection()`，服务缺席按 H1 门控结论处理；
   - `setup`：preset 在场时 `agentPresets.mount(agentCtx, presetId)`，缺席时省略（与官方 composeAgent 退化分支一致）；
   - 调用 `ctx.agents.create({ sessionId: childId, seed, inheritedEventCount, meta, agentOptions, setup })`。
3. **workspace attach**：`ctx.get('workspaceRegistry')` 找 `sessionIds` 含父会话的 workspace → `attachSession(childId)`；服务或 workspace 缺席按回落语义处理。
4. **lineage**：成功后 Host 直接 `recordLineage(root, childId, parentId)`（省掉 Client 的 `lineage-record` 回环；旧端点保留供回落路径使用）。
5. **能力探测**：端点内部先做服务存在性检查（`agents.create`/`workspaceRegistry`/`agentDefaultModel` 按 H1 阈值），缺失直接返回 `capability: false`，不尝试构造。
6. 改动落点：[routes-core.ts](../../../src/host/routes-core.ts)（新端点）、[types/api.ts](../../../src/types/api.ts)（请求/响应契约，老 Client 忽略未知字段双向兼容）、[types/dsh-contract.ts](../../../src/types/dsh-contract.ts)（`AgentRegistry` 扩展 `create` 与新服务接口，全部可选字段化）。

### 验收

- 单测：装配参数对账（mock 各 ctx 服务，断言 `create` 入参与 P0 清单同形）、各前置缺失分支的回落信号。
- `verify:host` 增端点检查行。

### 风险与回退

- **最大风险：`ctx.agents.create` 在非官方调用上下文中的行为差异**（如 owner ctx 归属、effect 生命周期随插件卸载而 dispose 子 agent）。P3 沙箱必须覆盖「插件 HMR/重载后子会话存活」用例；不通过则方案降级（仅新版 dsh 启用或整体搁置，回落路径由 H0 保障）。
- `Session.create` 校验未来收紧（如新增父日志比对）：P3 探针固化进 `tests/probe`，升级评估模板加检查行，漂移即门控失效回落。

---

## H4 Client 分支接入 + 双轨观察期

### 目标

Client 撤回链优先走 host-seed，失败/无能力自动回落现状路径；双轨并存一个发布观察期。

### 任务分解

1. [recall-node.ts](../../../src/client/recall-node.ts) `executeRecall`：execute 成功后先调 `fork-seeded`——
   - 返回 `childId`：`sessions.open(childId)`，跳过 `sessions.fork` 与 `removeStaleQueueItems`；归档（`archiveOriginal`）与草稿回填（`refillDraft`）逻辑不动；
   - 返回 `capability: false` 或抛错：走现状路径（client fork + 按 id 直删），console.warn 留痕。
2. **双轨观察期**：host-seed 路径下 `removeStaleQueueItems(childId, res.staleQueueItemIds)` 保留调用一个发布周期（无残留时删除请求返回 `queue-item-not-found`，幂等无害），确认无回归后在后续版本移除。
3. 标题继承核对：host-seed 路径不传 `increaseTitle` 的语义由 seed 内 `session/title` 事件保证（H2 回放），实弹核对侧栏标题与现状一致。

### 验收

- 实弹矩阵：host-seed 成功 / 强制回落（mock capability=false）两条路径均无残留、标题/家族/归档行为一致。

### 风险与回退

- 分支是增量，现状路径原样保留；配置项不新增，回退 = Host 端点返回 capability=false 即全局退回现状。

---

## H5 P3 沙箱端到端 + 门禁固化

### 目标

在独立 `DSH_HOME` 沙箱里端到端验证 host-seed 子会话的真实行为，并把全部契约点固化进门禁。

### 任务分解

1. **沙箱端到端**（沙箱工作区，不碰真实项目）：驱动链复用实弹验证的 HTTP RPC 方式（`session/create`、`session/prompt` + 插件端点），inbox 断言无需浏览器；用户可见形态再用浏览器复核。造「含排队消息 + 自动标题」的会话 → 触发撤回 → 断言：
   - 子会话 inbox 零残留（不依赖任何事后清理）；
   - 持久化（重启进程子会话仍在、`listSessions` 可见、`sessions.open` 可跳转）；
   - 标题与 `parentSession` 正确、侧栏 workspace 分组在场；
   - 插件 HMR/重载后子会话存活（H3 最大风险用例）。
2. **门禁固化**：
   - `tests/probe` 新增：`agents.create` 存在性与 options 形状、`Session.create` 校验四规则、`workspaceRegistry`/`agentDefaultModel`/`agentPresets` 探测；
   - `verify-host` 增 `fork-seeded` 端点行；
   - [compat-audit.md](../../compat-audit.md) 加 host-seed 耦合点行（子系统 × 不变量 × 探针）；
   - upgrade-assessments 模板加「官方 fork 语义漂移」检查行（boundary 推进规则、`create` 调用形状）。

### 验收

- 沙箱五项断言全过；`npm run test` / `test:probe` / `verify:host` / `typecheck` 四层门禁全绿。

### 风险与回退

- 沙箱不通过即不启用：H1 门控 + H4 回落保证任何失败形态都退化为现状。

---

## 整体验收标准

1. 撤回带排队消息的会话后，子会话 inbox 零残留（host-seed 路径不经过事后清理）；
2. 标题、版本家族、归档、草稿回填与现状逐点一致；
3. 受支持 dsh 版本上「支持的自建、不支持的回落」两条路均无残留（H1 矩阵为据）；
4. 四层门禁全绿，compat-audit 台账含全部新耦合点。

## 风险总表

| 风险 | 等级 | 缓解 |
|---|---|---|
| `agents.create` 插件上下文行为差异（owner/生命周期） | 高 | H3 门控 + P3 HMR 用例；不通过则降级或搁置，H0 保障现状路径 |
| 低版本服务缺席 | 中 | H1 矩阵门控，回落现状 |
| 标题窗口事件形状漂移 | 中 | H2 普查 + 探针；无事件可回放时明确取舍（重新生成或 rename 补写） |
| 官方 fork/`Session.create` 语义未来漂移 | 中 | 台账行 + 升级评估检查行 + 探针；漂移即回落 |
| 白名单遗漏窗口事件类型 | 低 | 真实日志全集普查后接受残余 |

## 备线（不依赖本计划）

给 dsh 上游提需求：`sessions.fork` 增加排除排队 inbox 事件的选项（或切点不含 inter-turn 窗口）。若上游接纳，本计划整体让位于官方能力，插件回到单行 fork 调用。
