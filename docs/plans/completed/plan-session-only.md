# 仅撤回对话模式（execute scope）实施计划

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：已实施（2026-09-18，实施记录见文末）
> 本计划由 [plan-competitor-ux.md](../pending/plan-competitor-ux.md) 的 U2 条目拆出立项（该条目经三竞品评估验证需求真实性：dsh-turn-rewind 的三模式弹窗），此处展开为可执行的完整设计。

## 背景：为什么做

现状撤回是双轨一体：确认面板只有「确认回退」一个动词，项目文件（影子仓库 reset 到 tag）与对话（`sessions.fork` 到 cutSeq）一并回退。存在一类高频场景：对生成结果不满意想重来对话，但文件改动恰是想要的（或已被人工修整过）——整段回退会把这些文件一并覆盖，虽有安全快照可找回，路径曲折且用户心慌。

本计划给确认面板加模式二选一：「回退文件与对话」（默认，现状）／「仅撤回对话」（文件保持当前状态，只 fork 回退对话）。

## 目标 / 明确不做

目标：

- 确认面板内临场选择模式，默认现状（both），不设全局默认配置项；
- session-only 路径不动工作区任何一个字节（零 git 写操作、不打安全快照）；
- scope 缺省即 both：老 Client 与新 Host 的任意组合行为不漂移。

明确不做：

- 「仅回退文件、保留对话」反向模式——`cutSeq === null`（首条用户消息）时现状已是事实上的仅文件回退；单独做选项徒增面板复杂度，有真实需求再立项；
- 无快照消息开放纯对话撤回——撤回按钮可见性仍以有快照为前提；放开需解耦 snapshot-info 门控与消息归属校验，超出本计划范围；
- preview 链路改动——diff 清单照常计算展示，session-only 下降级为「当前文件与快照差异」的参考信息。

## 任务分解

### 1. 契约（[types/api.ts](../../../src/types/api.ts)）

`ExecuteArgs` 增加可选字段（缺省 / 非法值一律按 `'both'` 处理——老 Client 不发、直调 API 乱发都落回现状链路）：

```ts
export type RecallScope = 'both' | 'session-only'

export interface ExecuteArgs {
  sessionId?: string
  messageId?: string
  previewTreeId?: string
  previewTotal?: number
  scope?: RecallScope
}
```

响应形状不变（`ExecuteOk.count` 在 session-only 下恒为 0，语义 = 回退文件数；done 面板本就不展示 count）。不新增错误码（复用 NO_SNAPSHOT / AGENT_BUSY）。

### 2. Host（[routes-core.ts](../../../src/host/routes-core.ts) `execute`）

execute 开头解析 scope，`session-only` 走独立短路径，**不进 `enqueue`**：

- 串行队列是为 git 锁互斥而设；本路径零 git 操作（`resolveCutSeq` / `resolveStaleQueueItemIds` 只读会话事件），入队只添延迟；
- 保留 `NO_SNAPSHOT` 检查（快照存在性仍是消息归属的判定依据，按钮可见性以有快照为前提，且防御直调 API）；
- 保留 `agentBusy` 拦截（fork + 归档会把运行中的 agent 留在被归档的原会话里继续写日志，语义混乱）。检查在队列外进行：无文件变更，P0-1「检查后紧接执行、窗口为零」的动机不成立，检查退化为护栏而非不变量；
- 跳过 previewTotal/previewTreeId STALE 校验、安全快照、`rollbackFor`、`rescueRollback` 全链——无文件覆盖即无不可逆操作，无需救援锚点；
- 依次 `resolveCutSeq` → `resolveStaleQueueItemIds`（fork 仍会 seed 入队残留，清理链与模式无关），返回 `{ ok: true, count: 0, cutSeq, staleQueueItemIds }`。

both 分支逐行保持现状，不重排既有语句。

### 3. Client（[recall-node.ts](../../../src/client/recall-node.ts)）

- 新增组件态 `scope`（`useState<'both' | 'session-only'>`，默认 `'both'`）：`openPreview` / `closePanel` 时复位——每次面板打开都是确定起点，不残留上一次选择；
- 确认面板 actions 上方加 radio 组（原生 input，键盘可达）：
  - 「回退文件与对话」（默认）：说明文案沿用现状两条 note（含安全快照预告）；
  - 「仅撤回对话」：说明「项目文件保持当前状态，不会被回退或删除；对话回退到该消息之前」；
- `cutSeq === null`（首条用户消息）时不渲染 radio 组——对话无从回退，面板与现状完全一致；
- 选中 session-only 时：文件清单保留展示但改标参考语义（「以下差异仅作参考，所选模式不会改动文件」），安全快照预告 note 隐藏（不打安全快照），主按钮文案分叉（「确认回退」/「确认撤回对话」）；
- execute 请求透传 `scope`（previewTreeId/previewTotal 照常携带，Host 按 scope 忽略）；executing 文案分叉（「正在回退…」/「正在撤回对话…」）；
- done 面板文案矩阵：both 两分支沿用现状；session-only + chatReverted → 「对话已回退到该消息之前，项目文件保持当前状态。新会话已打开，原会话已归档（可从归档找回）。」；session-only + !chatReverted → 「对话回退失败：\<err\>。项目文件未做任何改动。」；
- fork / openSession / `removeStaleQueueItems` / lineage-record / archiveOriginal / `fillDraft` 链路与模式无关，原样复用，不分叉。

样式在 [css.ts](../../../src/client/css.ts) 增加 radio 组规则：色值只用 `--dsw-alias-*` 令牌（参照 [design-tokens.md](../../design-tokens.md) 与 config-card 既有表单项形态），不引入自定义色。

### 4. 测试（tests/unit/）

新增 `routes-scope.test.js`，复用 [routes-stale.test.js](../../../tests/unit/routes-stale.test.js) 的工厂级 mock 模式（注入假 deps，不跑 git）：

- session-only：`runShell` / `diffFor` / `rollbackFor` 零调用；返回 `ok: true`、`count: 0`、`cutSeq`、`staleQueueItemIds` 透传；
- session-only + agentBusy → `AGENT_BUSY`；
- session-only + 未知 messageId → `NO_SNAPSHOT`；
- scope 非法值（`'files-only'`、数字、对象）→ 落回 both，git 链全跑；
- 不传 scope → both（现状回归钉）。

Client 侧无可提取的新纯函数（模式选择是 UI 状态），不新增 client 单测。

### 5. 门禁与文档同步

- 本地工作流约定顺序：`npm run typecheck` → `npm run build` → `npm test`；端点面不变，`npm run verify:host` 回归一次；
- 无新增官方 API 调用点（fork / archive / openSession / updateQueue 均为既有消费）——不加探针条目、不动 compat-audit 台账；
- CHANGELOG.md 新增条目（Keep a Changelog；新功能按 minor 语义，版本号发版时定）；
- README.md / README.en.md 功能描述补模式选择一句，双语同步；
- AGENTS.md「双轨回退」与数据流速查各补 scope 语义一句；
- 本计划验收后移入 `completed/`（同步总索引、文内相对链接、上游反向引用三处，见 [../README.md](../README.md) 生命周期约定第 2 条）。

## 改动落点

| 文件 | 改动 |
|---|---|
| [src/types/api.ts](../../../src/types/api.ts) | `RecallScope` 类型 + `ExecuteArgs.scope` |
| [src/host/routes-core.ts](../../../src/host/routes-core.ts) | execute 的 scope 解析与 session-only 短路径 |
| [src/client/recall-node.ts](../../../src/client/recall-node.ts) | radio 组 + scope 状态 + 文案矩阵 + 请求透传 |
| [src/client/css.ts](../../../src/client/css.ts) | radio 组样式（`--dsw-alias-*` 令牌） |
| tests/unit/routes-scope.test.js | 新增 5 例 |
| CHANGELOG.md / README.md / README.en.md / AGENTS.md | 叙述同步 |

## 验收标准

- 单测新增 5 例全绿、既有用例不红；`typecheck` / `build` / `verify:host` 通过；
- 实弹（link 模式）：
  1. 改文件 → 撤回选「仅撤回对话」→ 文件保持改动后状态（`git status` 对照工作区无变化）、对话回退、原会话归档、输入框回填被撤回消息、版本家族记录正常；
  2. 默认「回退文件与对话」与现状逐项一致（回归）；
  3. agent 运行中选 session-only → 被 AGENT_BUSY 拦截；
  4. 首条用户消息的确认面板无 radio（与现状一致）；
  5. 冒烟清单追加本节批次（见 [./smoke-checklist.md](./smoke-checklist.md) 的追加惯例）。

## 风险与回退

- **版本错位的单向性**：新 Client + 旧 Host 时 `scope` 被忽略、退化为整段回退——错位方向是「多回退文件」，有安全快照兜底可救；Host/Client 同包发布、同版本装配，该错位仅理论存在（与 PF-1 只兼容「旧 Client + 新 Host」同层考虑），不引入能力协商字段；
- **面板复杂度**：recall-node.ts 现 648 行（含注释），预计 +50 行，有效代码行数仍远低于 700 预警线，无需拆分；实施时复核行数，越线则把 `recallPanel` 拆为 recall-panel.ts；
- **session-only 无安全快照是设计使然**：不动文件即无可逆操作缺口；对话侧 fork + 归档本身可从归档列表找回；
- **整体回退开关**：Client 不传 `scope`（或 Host 回退本分支）即回到现状，零迁移成本。

## 实施记录（2026-09-18）

按本计划完整实施，无方向性偏差。门禁：`typecheck` / `build` / `test`（366 例含新增 5 例）/ `verify:host` 全绿。实弹验收（link 模式五项）已同日执行通过——S-1 session-only 全链（文件字节级未动 + 零安全快照 + 子会话/归档/回填/lineage）、S-2 默认 both 回归（含面板默认复位实证）、S-3 AGENT_BUSY 拦截、S-4 首条消息无 radio、S-5 面板分叉渲染；执行记录见 [smoke-checklist-records.md](./smoke-checklist-records.md)「仅撤回对话模式批次」，冒烟清单追加第八节。与计划的细节差异：

- truncated 行文案在 session-only 下分叉为「…仅显示前 N 条，共 M 处差异」——原文案「共 M 个文件将变更」与「不会改动文件」直接矛盾，计划未明列此行；
- session-only done 失败文案的 `<err>` 为空串时兜底「未知原因」（防御性，chatError 现有赋值路径均非空）；
- radio 组样式附 `:focus-visible` outline 规则（对齐面板内既有焦点语言），计划只约束了令牌来源；
- Client execute 请求保留既有 `previewAt` 字段原样透传（计划未提及，非本次改动面）。
