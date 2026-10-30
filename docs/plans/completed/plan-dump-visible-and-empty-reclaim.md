# dump 失败可见化与空仓回收（issue #30 遗留项）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-10-30；typecheck + 563 例单测 + 130 例 client + probe 58 例 + verify:host 全绿，双平台脚本手测过）**
> 来源：[plan-stores-dump-posix.md](plan-stores-dump-posix.md) 第 6 节登记的两条遗留。

## 1 问题

修完 issue #30 后剩下两个洞，都属于「用户看不出发生了什么」这一类：

1. **dump 失败静默**：`dumpStores` catch 后返回空 Map。快照管理只显示一棵空树（配一句「去发条消息」的空态文案），
   用户以为是「没有快照」；`deleteAll` 会回「已删除 0 条」，而真实原因只进了 stdout 日志。#30 的报告现场就是这样。
2. **空仓永不回收**：`reapEmptyStores` 只认「`index.json` 明确为空数组」。建过仓但**从没拍过快照**的 store
   （只有 `git/` + `root.txt`，没有 `index.json`）永远不满足条件——报告者机器上 7 个这样的空壳一直挂盘。

## 2 方案

### 2.1 dump 失败 fail-loud

- `dumpStores`：失败先 `rt.recordError(...)`（进设置页「最近错误」）再抛，不再吞成空 Map。
- `manage` 端点：`list` / `delete(scope=workspace\|session)`（缓存为空、需要全量 dump 时）/ `deleteAll`
  三条路径 catch 后统一回 `DUMP_FAILED` + 一句可行动文案。
- 仍按设计降级的两处：`lineage`（树退化为无版本家族标记，不阻断列表）与单条删除的磁盘兜底
  （`locateSnapshotOnDisk` 失败按未命中处理，失败原因已在最近错误里）。
- Client：`refresh()` 增加错误分支——`items` 从 `null` 置空（否则骨架条永远在转，形似「还在加载」），
  树位置渲染 `role=alert` 的失败条 + 「重试」chip（复用 `refresh`，不新造入口）。`err.DUMP_FAILED` 进双语词典，
  其余码回落 host message。

### 2.2 空仓回收：靠 STATE 段区分四种形态

dump 脚本给每个 store 增发一行 `STATE <present|absent|quarantined|foreign>`：

| STATE | 判据（脚本侧，只有它能看文件系统） | 回收 |
| --- | --- | --- |
| `present` | `index.json` 存在 | 否（内容好坏由 `entries` 判：为空数组才可回收） |
| `absent` | 无 `index.json`、无隔离文件，但**有 store 布局**（`git/` 或 `root.txt`） | **是**（从没拍过快照的空壳） |
| `quarantined` | 无 `index.json`，但存在 `index.json.corrupt-*` | 否（损坏隔离现场，待复查） |
| `foreign` | 无 index 也无 store 布局 | 否（不是本插件的目录，绝不碰） |

解析进 `StoreDumpInfo.indexState`，**无 STATE 段（旧版脚本）落 `unknown`**，回收侧只放行 `absent`——保守方向明确。
回收条件因此变成：`(entries === [] ) || (entries === null && indexState === 'absent')`，其余两道（无 `snap-*` tag、
内存无对应快照）保持不变。

判据放在脚本而不是 JS 侧，是因为「这个目录里到底有什么」只有 shell 能便宜地看到；放到 JS 侧要么得多起
N 条进程，要么得引 FS 依赖。

## 3 测试

- `tests/unit/stores-dump.test.js`：STATE 四形态解析、缺段落 `unknown`、非法取值落 `unknown`。
- `tests/unit/stores-dump-script.test.js`（真 bash 执行）：同一容器里四种目录形态（present / absent /
  quarantined / foreign），断言脚本给出的 STATE 与解析结果一致。
- `tests/unit/maintenance-reap.test.js`：`absent` + 无 tag → 整目录删除；`absent` 但磁盘仍有 tag → 保留；
  `quarantined` / `foreign` / `present+entries=null` → 保留；原有「空数组回收」用例不变。
- `tests/unit/manage-list.test.js`：dump 抛错时 `list` / `deleteAll` 回 `DUMP_FAILED` 且不把空结果写进缓存；
  `lineage` 仍降级为空。
- `tests/client/snapshot-manager.test.ts`：`ok:false` → 出现 `.dsh-recall-list-error`（`role=alert`）、
  骨架消失、点「重试」再发一次 list。
- `tests/unit/errors.test.js`：`RECALL_DUMP_FAILED` 进常量表与逐字值钉子（19 个码）。

## 4 手工验证

- pwsh 模板（win32 宿主实际走这条）：`index.json` 存在/缺失、有隔离文件、非 store 目录四种 fixture，
  跑生成的脚本得 `STATE present/absent/quarantined/foreign`、`exit=0`，段内不粘连。
- POSIX 侧由真 bash 单测覆盖（CI 的 ubuntu 必跑）。

## 5 未做 / 边界

- 「dump 成功但所有仓都解析成 `entries=null`」（issue #30 的第二半那种形态）仍不会主动告警——它可能只是
  所有仓都没拍过快照，混淆度太高，需要更细的健康信号（例如按 STATE 分布判断），留待后续。
- 空仓回收只在「立即 gc」（`runGcAll`）里发生，定期维护的 `enforceLimits`/`retention` 不做全盘枚举。
