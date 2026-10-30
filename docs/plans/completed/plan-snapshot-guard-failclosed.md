# 大工作区护栏的 fail-closed 与 add 前剔除（issue #29）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-10-30，M1 + M2 + M3 全部实施；双平台实弹 7 项 + DSH 活体冒烟 4 项全过，门禁全绿）**
> 背景：[issue #29](https://github.com/limbo947/dsh-recall-plugin/issues/29)：会话工作区是 `$HOME`（约 523 GB、233 万条目）时，预算扫描的 `git ls-files` 失败被 `2>/dev/null` 吞掉并**静默放行**，随后 `git add -A` 先写约 10 GB 对象、600 秒后超时被杀，prune 回收后下一条消息再重复一遍。
> 范围：M1 扫描失败不再放行（P0，止血）+ M2 超限大文件不进 add（P1，去掉放大器）+ M3 昂贵失败立即退避（P1，把「3 次 × 10 分钟」压到「1 次」）。**不动**「超限整体停用而非截断」这个设计（理由同 issue #24/#28）。

## 复现验证（2026-10-30，本机实测）

环境：Windows 10 + PowerShell 5.1.19041 / pwsh 7.6.9 + Git for Windows `git 2.53.0.windows.2`（bash）。影子仓库形态与插件一致（`git init --bare <store>/git/.git`，只用 `--work-tree`）。工作区为合成小树（`a.txt` / `sub/b.txt` / `sub/deep/c.txt` / 10 MB `big.bin` / 中文名文件）。

| # | 观测项 | 实测结果 |
|---|---|---|
| 1 | `ls-files` 失败时的退出码与 stderr（把一个垃圾字节写进 `$g/index`） | `rc=128`，stderr `fatal: …/index: index file smaller than expected`；`--git-dir` 指向不存在的目录同样是 `128` + `fatal: not a git repository` |
| 2 | `git add -A --pathspec-from-file=<f> --pathspec-file-nul`，`f` 内只有 `:(exclude,literal)big.bin` | rc=0；`ls-files` 只有 `a.txt`/`sub/b.txt`，`count-objects` = 2 → **大文件既不进 index 也不写对象** |
| 3 | 同上，`f` 为空文件 | rc=0，等价全量 `add -A`（含 `big.bin`）→ 空清单是安全退化 |
| 4 | 删掉 `a.txt` 后再用 exclude-only 清单 add | rc=0，`ls-files` 无 `a.txt` → **删除侧的 stage 语义完整保留**（`add -A` 的「删」不受影响） |
| 5 | `big.bin` 已在 index 中时带 exclude 清单 add | rc=0，`big.bin` **仍在 index**（条目未被清除）→ exclude pathspec 只阻止新写入，旧条目仍需 `update-index --force-remove` |
| 6 | cwd 位于 work tree **根之外** / 根上 | 均正确（全集 = 整棵工作树） |
| 7 | cwd 位于 work tree **子目录**（`sub/`）：无 `:(top)`、有 `:(top)`、`:(top,glob)**` 三种写法 | 三者**都只加了 `sub/` 下的文件**，根上的 `a.txt` 漏加 → pathspec 的隐含全集被 cwd 前缀裁切，`top` magic 救不回来，**必须先切 cwd 到工作区根** |
| 8 | 清单文件不存在（`--pathspec-from-file` 指错） | rc=128 `fatal: could not open …` → 必须保证清单文件存在，否则整次快照失败 |
| 9 | PS 5.1 / pwsh 7：`[IO.File]::WriteAllText` 写 NUL 分隔清单 + `--pathspec-from-file=…`（单 token）+ `Push-Location $root` | 两版都 rc=0、`big.bin` 不进 index、中文与空格路径的清单项正确生效 |
| 10 | PS 5.1 / pwsh 7：`& git add -h 2>&1 \| Select-String --pathspec-from-file` | 两版都能探测到（旧 git 的降级判据） |
| 11 | POSIX：`find -type f -size +8388608c` 与 `stat` 的 `≤maxFileBytes` 口径 | 恰好 8 MiB **不**命中、8 MiB+1 命中 → 与预算 awk 的 `$1 <= flim` 判定互补，无缝隙 |

## 根因分解

| # | 缺陷 | 位置 | 后果 |
|---|---|---|---|
| R1 | `ls-files` 失败 → `limit_scan_ok=0` → `limit_total=0` → 两道护栏同时放行 | `scripts.posix.ts` `limitScanBlock`；pwsh 侧 `if ($limitRc -eq 0)` 分支同理 | 规模未知时照常 `add`，10 GB / 10 分钟 |
| R2 | 失败原因被 `2>/dev/null`（pwsh `2>$null`）丢弃，且该路径不 `recordError` | 同上 | 事后零线索 |
| R3 | 预算只累加 ≤`maxFileBytes` 的文件，而 `add -A` 会先写全部大文件，之后才由 `oversizeBlock` 移出 index | 两套 `snapshotScript`（add 在 oversize 之前） | 即使预算正常生效，「小文件少 + 大文件多」的工作区仍可能写满磁盘 |
| R4 | 失败只按连续 3 次熔断、每次 600 秒 | `snapshots.ts` `handleSnapshotFailure` | 前 3 条消息付 30 分钟 / 30 GB |
| R5 | 全局串行队列（`state.queue`） | `index.ts` 事件接线 | 一次 10 分钟快照堵住所有会话 |

R5 单列后续（见「不改」）。R1/R2 → M1，R3 → M2，R4 → M3。

## 关键设计决策

| 决策 | 理由 |
|---|---|
| `ls-files` 失败 → **本次不建快照**（fail-closed），不是「当作没超限」 | 护栏的全部价值是「规模已知且在预算内才允许 add」。规模未知时放行，等于护栏在最需要它的场景（巨型工作区）失效——issue #29 的实弹即证。方向也安全：漏一次快照只是少一个撤回点（有明确提示），放行则是分钟级 + GB 级损耗。 |
| 失败走 `SNAP_*` 哨兵 + `exit 0`，不用非零退出 | 非零退出会进 `throwShellFailure` → 清扫（杀孤儿 + 清锁）→ prune；此时根本没跑 add，没有残骸要清，走失败清扫反而有误伤风险。哨兵通道与 `SNAP_LIMIT` 同构，host 侧零新错误码。 |
| 失败与「超限」共用同一条 sticky 停用通道（`snapLimits`，TTL 10 分钟 + 配置变化重试） | 否则每条消息都重付一次全量扫描（issue 实测 87 秒）。共用通道让「扫描失败」和「超限」在 UI 与短路逻辑上一致，且用户改排除表/上限后能立即重试。 |
| stderr 压平成单行、截断 300 字符后随哨兵回传 | 「失败原因不可观测」是 issue 的第一条建议。塞进 `recordError`（「最近错误」可查全文）而**不进** toast 文案（140 字符上限，embedding 路径必被截断）。 |
| 大文件用 **exclude-only pathspec** 挡在 add 之前，不改 `info/exclude` | 实测（#2/#4/#5）：`add -A` 的增/删语义完整保留，只是不再写入清单里的路径；不动 `info/exclude` 就不破坏 `excludeSyncBlock` 的「内容未变则跳过重写」优化，也不会把内部清单混进用户的排除语义。 |
| add 前必须把 cwd 切到工作区根 | 实测（#7）：pathspec 的隐含全集被 cwd 前缀裁切，`:(top)` 不能修复；`cd "$root"` / `Set-Location $root` 是唯一可靠解法（脚本内其余路径全是绝对路径，切换无副作用）。**这是本计划最容易踩的坑**。 |
| `--pathspec-from-file` 支持性探测一次并缓存到 `$g/pa.ok`；不支持则退回裸 `add -A` | 该选项要 git ≥ 2.25。旧 git 上带未知选项会让整条快照 fatal——比现状更糟。降级退回现状（会写大文件但功能不丢），与 `gc.stamp`/`attrs-v1.stamp` 同级先例。 |
| 清单为空 / 写失败时不传该参数 | 实测（#3）：空清单等价全量 add。于是「清单写失败」自然退化为现状行为，不需要额外的错误分支。 |
| 昂贵失败（耗时 ≥ 60 秒）跳过前两次免费重试，直接进入退避 | 一次 600 秒超时的重试成本是分钟级 + GB 级写盘，按「连续 3 次才退避」的通用策略处理等于再付 20 分钟。判定用 host 侧实测耗时（不解析错误文本——超时文案在两条执行通道上不同，字符串匹配不可靠）。 |
| 不新增配置项、不新增错误码、不新增端点 | 三个门禁面（`config.test.js` DEFAULTS 全等 / `errors.test.js` code 全等 / `verify-host` 端点全等）零改动。`FeedbackKind` 增加一个成员即可（无 `Record` 依赖它，client 只直显 `error` 文本）。 |

## issue 六条建议的处置

| issue 建议 | 处置 | 说明 |
|---|---|---|
| 1 失败要可观测（stderr 进 `recordError`） | **采纳** | M1-D1 用临时文件承接 stderr，M1-D2 压平截断后 `recordError`（5 分钟节流）。 |
| 2 fail-open 改成「跳过本次快照并记录」 | **采纳**，并加 sticky | 跳过 + 记录之外再加 10 分钟停用（否则每条消息都重付全量扫描）。 |
| 3 把 >`maxFileBytes` 的文件挡在 `git add` 之前 | **采纳**（pathspec 方案） | 见 M2 与实测 #2/#4/#7。 |
| 4 给 `add` 也加时限 | **不采纳**（本期） | M2 之后 add 的写入量受预算约束（≤256 MB）；扫描超预算时根本走不到 add；600 秒脚本级超时仍在兜底。新增配置项要同步 Config/双 locale/README，收益（把「已写满」变成「写到一半停下」）不足以支撑。记为后续可选。 |
| 5 失败/超时也停用该工作区一段时间 | **部分采纳** | 扫描失败 → sticky 停用（M1）；其他失败 → 昂贵失败立即退避（M3）。不做「所有失败都停用」：锁冲突/磁盘满这类环境失败常能自愈，立即停用会白白丢掉后续撤回点。 |
| 6 启动时做规模预检 | **不采纳** | 预检本身要遍历工作区（与预算扫描同成本），且规模随工作区变化而失效。现有「扫描时间预算 + sticky」已覆盖同一目标。 |

## M1 扫描失败不再放行（P0）

### M1-D1 两套模板的 `limitScanBlock`

POSIX（[scripts.posix.ts](../../../src/host/scripts.posix.ts)）：

```bash
limit_start=$(date +%s)
limit_tmp="$g/limit-scan.$$"
limit_err="$g/limit-scan-err.$$"
limit_scan_ok=0
# set -e：条件位置豁免；失败不再是 fail-open——规模未知时不许 add
if "$git" -c core.quotePath=false --git-dir="$g" --work-tree="$root" \
   ls-files -z -co --exclude-standard > "$limit_tmp" 2> "$limit_err"; then
  limit_scan_ok=1
else
  limit_rc=$?
  limit_msg=$(head -c 300 "$limit_err" 2>/dev/null | tr '\n\r' '  ')
  rm -f "$limit_tmp" "$limit_err"
  echo "SNAP_SCAN_FAIL $limit_rc"
  echo "SNAP_SCAN_ERR $limit_msg"
  exit 0
fi
rm -f "$limit_err"
# ……以下不变（stat 求和 + bytes/time 判定）
```

pwsh（[scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts)）：保留现有 EAP 降级与 `-z` 单串 Split，把 `2>$null` 换成 `2>$limitErrFile`（`$g/limit-scan-err.$PID`），`$LASTEXITCODE -ne 0` 时输出 `SNAP_SCAN_FAIL <rc>` / `SNAP_SCAN_ERR <压平截断后的 stderr>` 并 `exit 0`。

要点：

- `limit_scan_ok` 变量随之消失（失败已早退），`if [ "$limit_scan_ok" = 1 ] && [ -s "$limit_tmp" ]` 简化为 `if [ -s "$limit_tmp" ]`。
- 失败分支必须先 `rm` 再 `exit`：`set -e` 下 `exit 0` 不会触发 ERR，但临时文件会残留。
- pwsh 侧 `$PID` 替代 `$$`；stderr 落文件后 `Get-Content -Raw`，`-replace '\s+', ' '` 压平，长度 >300 截断。
- 注释同步改写：删除「失败即 fail-open 不判定」整段（那条决策已被 issue #29 推翻），换成「为什么失败不许放行 + 为什么走哨兵而不是非零退出」。

### M1-D2 host 侧（[snapshots.ts](../../../src/host/snapshots.ts)）

1. 新纯函数 `parseScanFail(out): { rc: number; message: string } | null`：逐行匹配 `SNAP_SCAN_FAIL `（前缀 15 字符）与 `SNAP_SCAN_ERR `（前缀 14 字符）；`rc` 非数字返回 null（格式漂移 fail-open，走原成功路径）。
2. `SnapshotLimit.kind` 扩为 `'bytes' | 'time' | 'scan'`（`value` 放退出码，`limit` 填 0）；`buildSnapshotLimitNotice` 增 scan 分支：
   > 无法统计该工作区的快照范围（git 退出码 N），本次快照已跳过；该工作区暂停快照约 10 分钟，修复后自动恢复，详情见「最近错误」
3. `captureSnapshot`：`parseSnapshotLimit` 之后、成功分支之前插入 scan 判定——写入 `snapLimits`（带 `at`/`maxWorkspaceBytes`/`scanBudgetMs`，与 bytes/time 同构，后续消息被顶部短路）、`recordError`（5 分钟节流，文案带 `rc` 与 stderr 全文）、`setFeedback(messageId, { failed: true, kind: 'scanFail', error: notice })`、`return`。
4. [diagnostics.ts](../../../src/host/diagnostics.ts) 的 `FeedbackKind` 增加 `'scanFail'`（与 `'workspaceLimit'` 同为「设计性停用」，不污染 `EnvErrorKind`）。

## M2 超限大文件不进 add（P1）

### M2-D1 清单与剔除（两套模板，`oversizeBlock` → `oversizeListBlock`）

现有 `oversizeBlock`（add 之后跑）拆成「add 前发现 + 双清单 + force-remove」，逻辑复用现有遍历：

- POSIX：沿用 `find "$root" "${oversize_prune[@]}" -type f -size +Nc -print0`，循环体里同时追加两个文件——
  - `$plist`：`printf '%s\0' ":(top,exclude,literal)${rel}"`（给 pathspec）
  - `$prel`：`printf '%s\0' "$rel"`（给 force-remove / add 后兜底）
  循环结束后 `xargs -0 "$git" --literal-pathspecs --git-dir="$g" --work-tree="$root" update-index --force-remove -- < "$prel"`。
- pwsh：沿用 `.NET` 栈遍历（`$oversizeRel` 已收集相对路径），额外 `[IO.File]::WriteAllText($plist, $sb.ToString(), UTF8 无 BOM)` 生成 NUL 清单，`update-index --force-remove` 走现有 100 条/批。

`$plist`/`$prel` 路径用 `store.dir` 下的 `oversize-*.$$`（`$PID`），与 `diff-cur.$$` 同纪律；POSIX 用 `trap 'rm -f …' EXIT` 清理，pwsh 用 `try/finally` 包住 add 段。

### M2-D2 add 改造（快照 + diff/rollback 三处共用同一形态）

```bash
pa_args=()
if [ -s "$plist" ]; then
  if [ -f "$g/pa.ok" ] || "$git" add -h 2>&1 | grep -q -- '--pathspec-from-file'; then
    printf '1\n' > "$g/pa.ok" 2>/dev/null || true
    pa_args=(--pathspec-from-file="$plist" --pathspec-file-nul)
  fi
fi
cd "$root"    # 实测 #7：pathspec 的隐含全集被 cwd 前缀裁切
addrc=0
add_log=$("$git" --git-dir="$g" --work-tree="$root" add -A --ignore-errors "${pa_args[@]}" 2>&1) || addrc=$?
```

pwsh 侧同形（数组 splatting `@paArgs`，`Set-Location -LiteralPath $root`），探测命令换成 `& git add -h 2>&1 | Select-String -SimpleMatch '--pathspec-from-file'`。

要点：

- `"${pa_args[@]}"` 展开在空数组时是零个参数（bash 3.2 起支持），不会产生空串参数。
- 不支持该选项的旧 git：`$g/pa.ok` 不写、`pa_args` 为空 → 退回现状行为（大文件仍可能写对象，但不影响功能）。
- 快照脚本的顺序变为：`dropGitlinks → excludeSync → limitScan → oversizeList → attrsMigrate → cd + add → dropGitlinks → write-tree/commit/tag`；add 之后**不再**跑第二次 `oversizeBlock`（清单已在 add 前生效，仅保留一次 `update-index --force-remove` 兜底以覆盖旧 git 降级路径）。
- diff/rollback 的 `collectListsBlock` 同形改造（add 带 pathspec + add 前 force-remove）。改造后 `ls-files --stage` 在 cwd=root 下输出，与 `ls-tree -r` 的目标清单同基准，awk 对比不变。
- **TREE 指纹不变**：现状「先写对象再移出 index」与新「不写对象」的最终 index 相同，PF-1 的 STALE 校验不会误判。

## M3 昂贵失败立即退避（P1）

[snapshots.ts](../../../src/host/snapshots.ts) `captureSnapshot` 在调用快照脚本前记 `captureStartedAt`，`catch` 里把 `Date.now() - captureStartedAt` 传给 `handleSnapshotFailure(root, store, elapsedMs)`：

```ts
const f = snapFailures.get(root) || { count: 0, skipUntil: 0 }
f.count++
// 分钟级失败（多半是规模或环境问题）不该按「偶发抖动」免费重试两次
if (elapsedMs >= EXPENSIVE_FAIL_MS && f.count < FUSE_AFTER) f.count = FUSE_AFTER
```

`EXPENSIVE_FAIL_MS = 60_000`（模块内常量，与 `FUSE_AFTER` 同处）。`recordError` 文案补「耗时 X 秒」。

## 不改（记录取舍）

| 项 | 理由 |
|---|---|
| 全局串行队列改 per-root 并行 | `state.queue` 同时保护 preview/execute/gc/清理与内存缓存，改成 per-root 要重审全部调用点的互斥假设；M1+M2 后单次快照最坏耗时显著下降，堵队列问题随之缓解。单列后续 issue。 |
| `add` 专用时限配置 | 见 issue 建议 4 的处置。 |
| 启动规模预检 | 见 issue 建议 6 的处置。 |
| 扫描失败时脚本内自动重试一次 | 最坏耗时翻倍；10 分钟 TTL 已提供等价的重试通道（且失败原因已可观测）。 |
| 把截断快照做成「部分纳入」 | 与 #24 的既有决策冲突：截断快照回退时按 index 清单误删未纳入文件。 |

## 改动落点汇总

| 文件 | 改动 | 备注 |
|---|---|---|
| [src/host/scripts.posix.ts](../../../src/host/scripts.posix.ts) | `limitScanBlock`（失败早退 + stderr）、`oversizeBlock`→清单/剔除、`snapshotScript` 顺序 + add 改造、`collectListsBlock` 同形 | 基线 461 行 → 约 505，< 700 |
| [src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) | 同上（`$PID`、`Set-Location`、数组 splatting） | 基线 579 行 → 约 630，< 700 |
| [src/host/snapshots.ts](../../../src/host/snapshots.ts) | `parseScanFail`、`SnapshotLimit.kind += 'scan'`、notice、`captureSnapshot` 分支、`handleSnapshotFailure(elapsedMs)` | 基线 634 行 → 约 690，< 700（**接近上限，实施时优先把新纯函数拆到独立模块**） |
| [src/host/diagnostics.ts](../../../src/host/diagnostics.ts) | `FeedbackKind += 'scanFail'` | 类型，一行 |
| [tests/unit/snapshot-limit.test.js](../../../tests/unit/snapshot-limit.test.js) | `parseScanFail` 正/负例、scan notice 文案（≤140 字符） | — |
| [tests/unit/scripts-contract.test.js](../../../tests/unit/scripts-contract.test.js) | 两平台：`SNAP_SCAN_FAIL` 早于 `add -A`；`--pathspec-from-file` 仅出现在 `pa.ok`/探测分支后；`update-index --force-remove` 早于 add；`cd`/`Set-Location` 早于 add | 纯文本契约 |
| `CHANGELOG.md` / `AGENTS.md` / `README(.en).md` | 核心机制第 2 条与配置说明补「扫描失败即停用」「大文件不进 add」 | 口径同步 |

不改：`src/types/scripts.ts`（无新导出）、`src/host/config.ts`（无新配置）、`routes-*`、client 逻辑。

## 验收标准

门禁：`npm run typecheck`、`npm run build`（`git diff --exit-code lib/` 为空）、`npm test`、`npm run verify:host` 全绿。

双平台实弹（win32 pwsh 5.1/7 + Git for Windows bash，脚本由构建后的 `lib/` 产出，记录进 `smoke-checklist-records.md`）：

1. **坏 index**：把垃圾字节写进 `$g/index` → 输出 `SNAP_SCAN_FAIL 128` / `SNAP_SCAN_ERR …`，**无 `add` 进程、无 tag、无新对象**；客户端 toast 出现停用说明；「最近错误」有 `index file smaller than expected` 全文；下一条消息在 10 分钟内不再触发扫描。
2. **大文件不进对象库**：工作区放 10 MB 文件（`maxFileBytes` 8 MB）→ `SNAP_OK`，`ls-files` 无该条目，`count-objects` 增量不含它，TREE 与移除该文件后一致。
3. **删除语义**：删掉一个已跟踪文件再发消息 → 新快照的树里没有它，回退到该快照后面板计数正确。
4. **中文 + 空格 + store 路径含空格**：工作区与 `$HOME` 路径都带空格/中文时 add 正常（`--pathspec-from-file` 单 token 传参）。
5. **降级路径**：手工删掉 `$g/pa.ok` 并把探测命令替换为 `false`（模拟旧 git）→ 快照仍成功（退回裸 add）。
6. **昂贵失败退避**：人为让快照脚本跑 >60 秒后失败（或用 600 秒超时场景）→ 首条消息失败后立即进入退避，第二条消息不再重跑。

## 风险与回退

| 风险 | 缓解 / 回退 |
|---|---|
| 切 cwd 到工作区根影响脚本其余命令 | 三处模板内其余路径全是绝对（`$git`/`$g`/`$root`/`store.dir` 派生），已逐条核对；实弹 2/4 覆盖。回退＝还原 `cd` 与 add 参数两行。 |
| 旧 git 无 `--pathspec-from-file` | 探测 + `$g/pa.ok` 缓存 + 退回裸 add；最坏情况与现状一致。 |
| 大文件清单写入失败/不完整 | 空清单等价全量 add（实测 #3），退化为现状；find 的 `2>/dev/null` 既有容错语义不变（漏看个别文件 = fail-open）。 |
| 扫描失败后停用 10 分钟导致用户少一次撤回点 | toast 明确说明「已暂停 + 自动恢复 + 详情见最近错误」；用户改配置/排除表可立即重试。 |
| `snapshots.ts` 逼近 700 行软限 | 实施时把 `parseScanFail`/notice/scan 判定抽到独立模块（如 `snapshot-guard.ts`），`captureSnapshot` 只留调用。 |

## 备选方案（本次不实施，记录取舍）

- **B1 把大文件清单写进 `info/exclude`**：不依赖 git 版本，但会破坏 `excludeSyncBlock` 的「内容未变则跳过」优化（每次快照都重写 + 跑清理循环），且把内部清单混进用户可见的排除语义。否决。
- **B2 用正面清单（`ls-files` 输出减去大文件）传给 `--pathspec-from-file`**：POSIX 侧 `xargs stat` 已丢失路径（多收一次 find 才拿得到），且扫描后新增的文件会漏；exclude-only 只列少数大文件，覆盖面也更大。否决。
- **B3 扫描失败时回落到目录遍历口径**：两套口径并存会让同一工作区判定随 git 状态跳变（#28 已论证）。否决。
- **B4 失败后由 host 侧重试一次扫描**：等价于把 87 秒 × 2 付在当前消息上，而 10 分钟 TTL 重试对用户无感。否决。

## 实施记录（2026-10-30）

**改动**：`src/host/scripts.posix.ts` / `scripts.pwsh.ts` 的 `limitScanBlock` 改为 fail-closed（stderr 落临时文件、`SNAP_SCAN_FAIL`/`SNAP_SCAN_ERR` 早退）；`oversizeBlock` 拆成 `oversizeListBlock`（双清单：pathspec 版 + rel 版）+ `oversizeAddPrepBlock`（探测 + 切 cwd）+ `oversizeRemoveBlock`（add 前剔除 / add 后兜底）；`snapshotScript` 与 `collectListsBlock`（diff/rollback 复用）的 add 改为带 pathspec，`exclude-patterns.ts` 注释同步；`snapshots.ts` 新增 `parseScanFail`、`SnapshotLimit.kind += 'scan'`、scan 分支与 `markSnapshotLimited`/`noteSnapshotBlocked` 两个节流辅助、`handleSnapshotFailure(elapsedMs)` 与 `EXPENSIVE_FAIL_MS`；`diagnostics.ts` 的 `FeedbackKind += 'scanFail'`。

**与计划的偏差**：

1. pwsh 侧 stderr **只取首个非空行**——PS 5.1 把 native stderr 写成 ErrorRecord（后续行是 `At ... char:21 + ...` 调用点上下文），整段压平会把脚本路径塞进「最近错误」（实弹可见）。pwsh 7 本来就是干净单行，两版共用该实现。
2. `oversize_r`（rel 清单）只在 POSIX 侧落文件（xargs 需要文件输入）；pwsh 侧直接用 `$oversizeRel` 数组分批，少一次盘写。两侧语义一致（add 前剔除 + add 后兜底各一次）。
3. `snapshots.ts` 未拆新模块：实测增量约 +40 有效行（634 → 674），仍在 700 以内，拆分会动 `snapshot-limit.test.js` 的既有 import 路径，收益不足。三份改动文件的有效行数：`scripts.posix.ts` 461 → 496、`scripts.pwsh.ts` 579 → 639、`snapshots.ts` 634 → 674。

**门禁**：`npm run typecheck` 零错误；`npm test` **42 文件 538 例全绿**（新增 12 例：`parseScanFail` 3 + scan notice 1 + 契约 2 + 工厂级 scan-fail 3，另有既有断言按新语义调整 3 处）；`npm run build` 后 `lib/scripts.posix.js` / `lib/scripts.pwsh.js` / `lib/snapshots.js` 更新；`npm run verify:host` 通过（inject=shell,sessions,agents，端点 13 项）。

**双平台实弹（6/6，脚本由构建后的 `lib/` 模板产出；工作区含 `a.txt` / `sub/b.txt` / 中文空格名文件 / 10 MB `big.bin`）**：

| # | 场景 | pwsh 5.1 | pwsh 7 | Git Bash |
|---|---|---|---|---|
| 1 | 正常快照 | `SNAP_OK` + `TREE 6cb9db…` | 同左 | 同左 |
| 2 | 大文件不入库 | `ls-files` 仅 3 个小文件、`count=6`（无 10 MB blob） | 同左 | 同左 |
| 3 | TREE 与「工作区无大文件」一致 | — | — | `TREE` 同为 `6cb9db…`（删除 big.bin 后重跑） |
| 4 | 坏 index | `SNAP_SCAN_FAIL 128` + `SNAP_SCAN_ERR git.exe : fatal: … index file smaller than expected`，无新 tag | 同左（stderr 为纯净单行） | `SNAP_SCAN_FAIL 128` + `SNAP_SCAN_ERR fatal: …`，无新 tag |
| 5 | 临时文件清理 | 无 `oversize-*` 残留 | 同左 | 无 `oversize-*` / `limit-scan-*` 残留 |
| 6 | 旧 git 降级（探测替换为 `false`） | — | — | `SNAP_OK` + TREE 一致、index 仍无大文件（退回裸 add 后由兜底剔除） |
| 7 | diff 链路 | — | — | 输出 `TREE 6cb9db…`、无变更行（新快照与工作区一致） |

**活体冒烟（2026-10-30，同日完成，详见 [smoke-checklist-records.md](./smoke-checklist-records.md) 同日批次）**：

| # | 场景 | 结果 |
|---|---|---|
| 1 | headless 真实用户消息（`--patch` overlay 挂载插件，不改 profile） | `snap-7185f91f-…` + `index.json` 一条；`ls-files` 仅两个小文件，10 MB `video.bin` 不在树里；`pathspec-from-file.ok` 已落盘（走 pathspec 分支） |
| 2 | 坏 index 后再发一条真实消息 | 日志 `recall snapshot scan failed … rc=128 … index file smaller than expected`；tag / count-objects / index.json 零变化，无临时文件残留 |
| 3 | web 宿主 `init → preview → execute(scope=both)` | preview 4 条变更 + `treeId`；execute `{ok:true,count:4}`，工作区完整回退 |
| 4 | 磁盘侧 | 安全快照 `snap-pre-rollback-…` 生成且不进索引；`recall-intent.json` 执行后清除 |
| 5 | sticky 停用（同进程三条消息，`heartbeat` 作探针） | 第二条 scan fail 后心跳刷新（脚本跑了）、第三条心跳**不变**（脚本零调用）且无新 tag；等待 TTL 到期后第四条自动重试成功（tags 67 → 68） |

**仍未做**：`per-root` 队列与 `add` 专用时限按计划中的「不改」项保持现状。活体冒烟的「同一进程内两条消息触发 sticky 短路」未单独构造（headless 每进程一条消息），由 `tests/unit/snapshot-scan-fail.test.js` 的「失败后第二条不再跑脚本」覆盖。
