# per-root 队列、单次快照时限与 web 新会话 cwd

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-10-30，三项全部落地；门禁 545 例 + 129 例 + verify:host 全绿，超时配置实弹通过）**
> 背景：[issue #29](https://github.com/limbo947/dsh-recall-plugin/issues/29) 收官时留下的三项（前两项是 issue 里的建议 4/队列问题，第三项是活体冒烟观察）。

## 1 per-root 任务队列

**问题**：`state.queue` 是一条全局串行链——一个大工作区的慢快照（分钟级）会把**所有会话**的新快照排在它后面，别的项目连撤回按钮都出不来。

**方案**：新增 [src/host/queues.ts](../../../src/host/queues.ts)（工厂，无模块级状态）：

- `enqueueFor(root, task)`：同 root 串行（快照 / preview / 回滚 / 删除都在写同一个 git index），不同 root 并行。
- `enqueueMany(roots, task)`：跨工作区操作（全量删除 / 全局 gc）等这些 root 的链尾全部落地再执行，并把同一条链尾写回每个 key——与 per-root 任务互斥，也不阻塞无关 root；空集合退化为 `''` 全局链。
- key 归一：win32 大小写不敏感，同一仓库的 `D:\WS` 与 `d:\ws` 必须共用一把锁；POSIX 保持原样。
- 链尾恒为 `catch` 过的 promise：一次失败不能让整条链停在拒绝状态（后续任务只依赖排队关系）。

**接线**：`index.ts` 的 `session/event` 先 `rt.resolveRoot`（有缓存，失败退化为全局链），再按 root 入队快照与维护；`routes-core` 的 preview/execute 与 `routes-manage` 的删除/gc 全部改为带 root 的 `enqueueFor`/`enqueueMany`。`SharedState.queue` 字段随之删除。

## 2 单次快照时限（`snapshotBudgetMs`）

**问题**：`scanBudgetMs` 只约束统计阶段，真正的耗时与写盘在 `add`。脚本级 `timeoutMs` 此前硬编码 600 秒——违反「可调参数不硬编码」的合规 #3，且慢盘上要 10 分钟才止损。

**方案**：新增配置 `snapshotBudgetMs`（默认 **180000** = 3 分钟，`0` = 不限制，消费侧映射为 24h——`runShell` 的 `timeoutMs` 是必达的 kill 计时器，没有「无限」表达）。`captureSnapshot` 用它作为整条快照脚本的 `timeoutMs`，安全快照走同一入口自动继承。

同步面：`Config` schema / `DEFAULTS` / `ResolvedConfig` / `config-get` 的 values / 设置卡片（秒级展示，`numRow`）/ 双语 locale / README 配置表 / `config.test.js`。

## 3 web 新会话 cwd：官方行为，插件不改代码

**核查结论**（dsh 0.2.2-alpha.2 安装目录逐文件核实）：

- 客户端 `startSession(workspaceId?)` 的取值链是 `workspaceId ?? 当前会话所属工作区 ?? 最近活跃工作区`，全链**不传 cwd**（`dsh-client-ui-workspace/lib/client.js:1491-1500`）；
- 宿主侧 `cwd = workspace.path ?? request.cwd ?? process.cwd()`（`dsh-api-session-controller/lib/index.js:666-673`），web 流程永远走第一条，因此**宿主启动目录不影响新会话**；
- 「最近活跃」由客户端持久化的当前会话选择 + 宿主 `~/.dsh/storages/workspace.json` 的 `updatedAt` 决定；
- **没有**官方配置项或 waterfall 钩子能改写该决策（`SessionController.Config` 只有 `nativeOpen` / `listWorkSliceMs`）。

**处置**：不改代码。插件侧虽有 `ctx.uiWorkspace.startSession(workspaceId)` / `ctx.workspaces.create({path})` 这类命令式能力，但没有任何正当入口去「替用户选工作区」——擅自接管新建会话属于越权。改为在 README「使用注意」与 AGENTS 已知坑里写明：**新会话跟随当前/最近工作区，切工作区后再发消息**（快照按会话 cwd 建）。

## 实测

- 单测：`tests/unit/queues.test.js` 6 例——同 root 顺序、跨 root 并行（`b` 先于慢 `a` 完成）、win32 大小写归一、失败不堵链、`enqueueMany` 联锁与后续任务排序、空集合退化。
- 实弹（headless，`--patch` 把 `snapshotBudgetMs` 压到 50ms）：日志出现 `recall snapshot failed: Error: 直连 powershell.exe 超时（50ms）`，store 建了但 `tags=0`、`index.json` 为空——配置确实接到了 `runShell` 的 timeout，且超时不产生假快照。

## 门禁

`npm run typecheck` 零错误；`npm test` **43 文件 545 例全绿**（新增 queues 6 + 配置 1）；`npm run test:client` 129 例；`npm run build` 产出 `lib/queues.js`（`scripts/build-host.mjs` 入口清单同步）；`npm run verify:host` 通过。

## 风险与回退

| 风险 | 缓解 / 回退 |
|---|---|
| 跨 root 并行后并发写盘增多 | 只有不同工作区才会并行；同仓库仍串行。真实压力场景（多个大项目同时发消息）下总吞吐反而更好，因为互不等待。 |
| `enqueueMany` 漏锁某个 root | 批量操作只锁 `state.stores` 已知的 root；磁盘新增但内存没有的 store 不会有并发任务（任何快照/回退都必须先 `resolveStore`）。回退＝改回单链。 |
| 时限默认 3 分钟对超大项目偏紧 | 配置可调（0 = 不限制）；实测 256MB 预算内 add 远低于该值。 |
| web cwd 行为被误认为插件 bug | README 使用注意 + AGENTS 已知坑各一条，说明归属官方客户端。 |
