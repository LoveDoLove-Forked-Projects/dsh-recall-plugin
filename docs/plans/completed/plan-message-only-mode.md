# 只回退消息模式（issue #31）

> 状态：**已完成（2026-10-31；typecheck + 573 例单测 + 132 例 client + probe 58 例 + verify:host 全绿，build 通过）**
> 来源：[issue #31](https://github.com/limbo947/dsh-recall-plugin/issues/31)「增加只回退消息模式（不写文件快照，仅登记撤回记录）」。

## 1 问题

大仓用户（报告现场：gitignore 过滤后 19,486 文件 / 1.55GB）只用撤回清理对话，却为每条用户消息付一次全量文件快照：

- 默认 `maxWorkspaceBytes`（256MB）命中后**整区停用**——连对话回退都没有；
- 调大上限后每条消息要写约 1.5GB 对象，外加 `git add` 与限额扫描；
- 现有「仅撤回对话」范围（#16）只决定**执行时**动不动文件，快照成本照付；
- `snapshotEnabled: false` 会把消息回退一起关掉——按钮依赖 `state.snapshots` 记录存在。

## 2 方案

### 2.1 开关与记录形状

- 新配置 `messageOnly: boolean`，默认 `false`（关＝现状）。开启后每条用户消息仍登记撤回记录，但不写文件快照。
- 记录新增可选字段 `files?: boolean`：`false` ＝该条只有对话回退；缺省视为 `true`（旧索引天然兼容）。
  **按条生效**——升级前拍的老快照仍可完整回退文件，避免「开了新模式后误选『回退文件与对话』把旧文件树恢复回工作区」。
- 只在 `false` 时落盘该字段：`index.json` 体积与旧版一致。

### 2.2 捕获短路径

`messageOnly` 开启时 `captureSnapshot` 走独立短路径：

```
resolveRoot → resolveStore → tryUpgradeToHome → guardStoreFormat
  → ensureGit（建空仓，一次）→ loadIndex → state.snapshots.set(files:false) → saveIndex
```

**不执行**：`snapshotScript`（扫描 / `add -A` / 写对象 / 打 tag）、限额判定、失败 prune 与熔断。

**刻意绕过**：`snapFailures` 熔断与 `snapLimits` 停用短路——两者描述的是「文件快照失败」，不该再阻断消息登记；
`buildArtifactRootSegment` 早退（issue #18）——产物根目录里不建文件快照的理由是「成本高且无回退价值」，
仅消息登记无成本，`dist/`、`target/debug` 里的对话回退仍有价值。

保留 `guardStoreFormat`：索引写入同受磁盘格式守卫约束（高版本 store 拒写）。

### 2.3 撤回链路

| 端点 | `files: false` 条目 |
| --- | --- |
| `snapshot-info` | `has: true`，额外下发 `files: false`（按钮照常出现，界面按此切文案） |
| `preview` | 不进队列跑 diff，直接 `{ changes: [], total: 0, treeId: null, cutSeq, files: false }`；`agentBusy` / `NO_SNAPSHOT` 护栏保留 |
| `execute` | 无论 Client 传什么 scope 都**强制** `session-only` 短路径（不计入 STALE 校验、不打安全快照、不 rollback，`count: 0`），不报错 |

旧 Client（不认 `files`）传 `both` 时由 Host 静默降级，同包发布无需能力协商。

### 2.4 管理面

- `manage list` 的 `ManageListItem` 增 `files?: boolean`，磁盘 dump 与内存兜底两路都透传；树叶子显示「仅消息」chip。
- 删除 / 批量删除 / 全部删除 / `enforceLimits` / `retention` 对无 tag 条目天然安全（`purgeTagsScript` 幂等），无需改判据。
- 空仓回收不受影响：`index.json` 存在即 `STATE present`，不会被 `reapEmptyStores` 误删。

### 2.5 配置与界面

- 设置卡片新增开关「只回退消息（不写文件快照）」，`config-set` 白名单放行。
- 撤回确认面板：`files: false` 时隐藏「回退文件与对话 / 仅撤回对话」单选，正文改成模式说明，提交按钮用 session-only 文案。

## 3 测试

- `tests/unit/snapshots-message-only.test.js`：`messageOnly` 下不调用快照脚本、写出的条目带 `files: false`、
  `snapLimits`/`snapFailures` 短路不阻断登记、`ensureGit` 失败仍报错。
- `tests/unit/snapshots-persist.test.js`：`files` 往返、旧条目（无字段）视为 `true`、只在 `false` 时落盘。
- `tests/unit/snapshots-diff.test.js`（或现有 diff 用例）：`files: false` 的 `diffFor` 不跑 shell、返回空清单。
- `tests/unit/routes-execute.test.js`：`scope=both` + `files:false` → `count: 0`、不触发安全快照 / rollback。
- `tests/unit/manage-list.test.js`：`files` 从 dump / 内存透传，同 id 合并时 `false` 优先。
- `tests/client/*`：面板无范围单选与「仅消息」文案；管理树 chip；设置卡开关保存。

## 4 未做 / 边界

- **不建影子仓**：第一版仍 `ensureGit` 建空仓（每工作区一次、几十 KB），以复用 gc/枚举/清理全链；
  完全不建仓需给 `runGc`/`runGcAll`/`root-ready`/`reapEmptyStores` 加「无 git 目录」守卫，留待后续。
- **超限自动降级**（`SNAP_LIMIT` 时改登记仅消息而不是整区停用）是隐式行为变化，留待第二阶段单独评估。
- **持久性弱于快照**：`files:false` 条目没有 tag，`rebuildOrphans` 反推不到；`index.json` 损坏被隔离后
  这些撤回按钮永久消失（快照可从 tag 恢复）。文档需向用户说明这一点。
- **不提供「重新拍文件快照」入口**：关闭开关后新消息自然恢复完整快照，旧条目保持仅消息语义（可后续再加）。

## 5 实施记录（2026-10-31）

- Host：`config.ts` 新增 `messageOnly`（schema + DEFAULTS + createConfig 解析）；`snapshots.ts` 新增
  `captureMessageOnly` 短路径（绕开 `snapFailures`/`snapLimits` 短路与产物根早退，保留格式守卫与
  `ensureGit`），`saveIndex`/`loadIndex` 透传 `files`，`diffFor` 对 `files:false` 直接空清单；
  `routes-core.ts` 的 `snapshot-info`/`preview` 下发 `files`，`execute` 对 `files:false` 强制
  `session-only`；`routes-manage.ts` 的 config 读写白名单与 `buildListItems` 透传 `files`。
- Client：确认面板对仅消息条目隐藏范围单选、首条消息（无切点）禁用提交，`executing`/`done` 文案按
  实际执行的 scope；管理树叶子加「仅消息」chip；设置卡新增开关；中英词条各 4 条。
- 顺带拆分（`recall-node.ts` 已超 800 行，按棘轮规则只能降不能升）：`diff-kinds.ts`（kind 单表）、
  `message-blocks.ts`（块投影 + 文件卡片 + 附件引用）、`recall-stage.ts`（面板状态机），
  `recall-node.ts` 有效代码由 853 行降到 798 行；三个模块均由原文件 re-export，import 路径不变。
- 测试：`tests/unit/snapshots-message-only.test.js` 7 例、`routes-scope.test.js` +2、`manage-list.test.js` +1、
  `tests/client/recall-node.test.ts` +2；`config.test.js` 与 `config-card.test.ts` 的形状/开关索引断言随之更新。
- 门禁：typecheck 零错；`npm test` 573 例、`test:client` 132 例、`test:probe` 58 例、`verify:host` 通过、`build` 通过。
- 活体冒烟（2026-10-31，dsh 0.2.2-alpha.2 + agent-browser 真实 Chromium）：M1〜M6 全过——仅消息条目零 tag/零对象、面板无范围单选、execute 强制降级且文件零改动、关闭开关后完整快照恢复、旧快照仍可完整回退、重启后由 `loadIndex` 回填 `files:false` 且面板语义不变。记录见 smoke-checklist 第十一节与 records 同日批次，未发现新缺陷。
