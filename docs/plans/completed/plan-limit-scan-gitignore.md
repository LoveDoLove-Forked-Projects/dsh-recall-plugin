# 快照护栏的统计口径改走 git（issue #28）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-10-27，M1 + M2 + M3 全部实施，双平台实弹 10/10）**
> 背景：[issue #28](https://github.com/limbo947/dsh-recall-plugin/issues/28)：`maxWorkspaceBytes` 的前置扫描只认 `baseExcludes` + `exclude.txt`，不读 `*.gitignore`，而紧随其后的 `git add -A` 是读的——用「宽度更大的尺」去预警一个更窄的操作，正常项目被判超限后**整体停用快照**（用户失去撤回能力），且提示把用户引向「调大上限」这个反向处置。
> 范围：只改统计口径（脚本层两套模板）+ 文案措辞 + 文档。**不动「超限整体停用而非截断」这个设计**——issue 作者与本计划一致认为它是对的（截断快照回退时会按 index 清单误删未纳入的文件）。

## 复现验证（2026-10-27，本机实测）

环境：Windows 10 + PowerShell 7.6.9 / Windows PowerShell 5.1.19041 + Git for Windows bash；`git version 2.53.0.windows.2`。造数：2000 个 4KB 源文件 + 20000 个 4KB 中间产物（落在带 `.work/` 的**嵌套** `.gitignore` 下）+ 嵌套仓库 + 工作区根自带 `.git`；影子仓库形态与插件一致（`git init --bare <store>/git/.git`，只用 `--work-tree`）。所有命令与插件脚本逐字同源（含 `--git-dir` 分离、`--exclude-standard`、`core.quotePath=false`）。

| # | 观测项 | 实测结果 |
|---|---|---|
| 1 | 现状口径（`.NET` 目录栈遍历，只认 exclude 表） | 22001 条 / **90,112,008 B** |
| 2 | `ls-files -z -co --exclude-standard` + stat 求和 | 2001 条 / **8,192,008 B** |
| 3 | `add -A` 之后 `ls-files` 求和（真值） | 2001 条 / **8,192,008 B**（与 #2 逐字节相等） |
| 4 | 两者比值 | 现状口径是真值的 **11 倍**（与 issue 实测 2.27 倍同因，倍数取决于被 ignore 目录的大小） |
| 5 | 耗时（同一工作区，各一次） | 现状 58 ms / 新方案 225 ms（2.2 万条目含 2 万条被 git 排除的） |
| 6 | `ls-files -o`（**不带** `--exclude-standard`） | 列出 `sub/.work/frame.dat` 等被 ignore 文件——`--exclude-standard` 不可省 |
| 7 | 嵌套 `.gitignore` 继承 | `--exclude-standard` 与 `add -A` 结果完全一致（同一套规则引擎） |
| 8 | 嵌套 git 仓库（有提交） | `ls-files -o` 输出 `nested-repo/`（目录形态），`add -A` 记为 gitlink 后被 `dropGitlinks` 剔除——两侧都不计入 |
| 9 | 嵌套 git 仓库（无提交） | `ls-files -o` 输出 `nested-empty/`，`add -A` 报 `unable to index file`（SNAP_SKIP）——两侧都不计入 |
| 10 | 工作区根自带 `.git` | `-o` 不列出（`info/exclude` 的 `.git` 生效，与 `add -A` 一致） |
| 11 | PS 5.1：`EAP=Stop` + `2>$null` 调 git（stderr 非空时） | **抛 NativeCommandError**（pwsh 7 不抛）——必须临时降 `$ErrorActionPreference`，与 add 段同款纪律 |
| 12 | PS 5.1 / 7：`@(& git ... ls-files -z ...)` | 都返回**单个**字符串元素且 NUL 完整保留（`-z` 可用；5.1 的 `Split(char, RemoveEmptyEntries)` 重载会保留尾部空串，需自行跳过空项） |
| 13 | POSIX（Git for Windows bash）拟议片段 | `ls-files -z` → `xargs -0 stat -c %s` → awk 求和，与真值逐字节一致；含中文/空格路径、9 MB 大文件（按 `maxFileBytes` 剔除）均正确 |
| 14 | `ls-files` 失败的退出码（`--bogus-flag`） | 非 0（129/128 级），可作为「降级」判据 |

与 issue 描述的差异（实施时按实测口径写）：

- issue 说「扫描器不看 `.gitignore`」——更准确的根因是**扫描器自己实现了一套排除语义**（`baseExcludes` + `exclude.txt` + 目录剪枝集），而 git 的排除语义由 `.gitignore`（每层继承）/ `info/exclude` / `core.excludesFile` / 取反规则 / 嵌套仓库共同决定。缺 `.gitignore` 只是最显眼的一条。
- issue 未提的一点：新口径**顺带修好了「父级 root 连累子项目」**——父工作区下带自己 `.git` 的子项目被 `-o` 输出成目录条目、不计入内容（第 8/9 行），而现状口径会把子项目里的全部文件算进父级。
- `ls-files` 里 `-c`（已跟踪）**必须带上**，不能只统计 `-o`：`add -A` 不会因为某文件后来被 `.gitignore` 命中就把它移出快照（ignore 只作用于未跟踪文件），只统计 `-o` 会系统性低估。

## 关键设计决策

| 决策 | 理由 |
|---|---|
| 统计口径改为「`git ls-files -z -co --exclude-standard` + 逐条 stat」 | 排除语义与 `add -A` 由**同一个引擎**给出，不需要插件实现 90% 的 gitignore 语义（继承链 / 取反 / 嵌套仓库 / 全局 excludesFile）。issue 建议的 `check-ignore --stdin` 仍要自己遍历目录树，省不掉成本也省不掉规则细节。 |
| 保留「≤ `maxFileBytes` 才计入」的过滤 | 与现状一致：超过单文件上限的文件随后被 `oversizeBlock` 移出 index，不该计入总量（否则一个 300 MB 视频就能把干净项目误判超限）。 |
| `ls-files` 失败时 **fail-open 不判定**，而不是回落到目录遍历 | ①统计失败时 `add -A` 多半也会失败（同一 git、同一仓库），护栏已无意义；②两套口径并存＝同一工作区在不同 git 状态下判定跳变，解释不了；③失败方向安全（放行只会慢，不会误删）。现状 `oversizeBlock` 同样是 fail-open。 |
| POSIX 侧 `-z` 直通 `xargs -0`，pwsh 侧 `-z` 收进单串再 `Split` | 文件名含换行时 `core.quotePath=false` 的逐行解析会拆行（现状 `diffScript` 的已知限制）；`-z` 两侧都能用（第 12 行实测），顺手把这个缺口补掉。 |
| 耗时预算语义不变，但 pwsh 侧从「遍历中可中断」变为「git 阶段不可中断」 | 统计总耗时仍由 Stopwatch 覆盖全程，超预算照样 `SNAP_LIMIT time`；只是 git 自己的目录遍历无法中途打断——与 POSIX 侧「秒精度、事后比较」的既有口径一致。 |
| 不新增配置项、不新增错误码、不新增端点 | 三个门禁面（`config.test.js` DEFAULTS 全等 / `errors.test.js` code 全等 / `verify-host` 端点全等）零改动。issue 提的「文案补一句是否已按 .gitignore 过滤」用改字实现，不加字段。 |

## M1 两套模板的 `limitScanBlock` 重写

### M1-D1 pwsh（[src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) 现 L191-230）

```powershell
$limitSw = [Diagnostics.Stopwatch]::StartNew()
$limitBytes = [long]0
$limitHit = ''
$limitRc = 0
$limitRaw = @()
$limitEapPrev = $ErrorActionPreference
# PS 5.1：native stderr 在 EAP=Stop 下会被包成 ErrorRecord 直接抛（pwsh 7 不抛），
# 与 add 段同款纪律——探测类调用必须临时降级，否则一条 warning 就能让快照全挂
$ErrorActionPreference = 'Continue'
try { $limitRaw = @(& $git -c core.quotePath=false --git-dir=$g --work-tree=$root ls-files -z -co --exclude-standard 2>$null) } finally { $ErrorActionPreference = $limitEapPrev }
$limitRc = $LASTEXITCODE
if ($limitRc -eq 0) {
  foreach ($rel in (($limitRaw -join '').Split([char]0))) {
    if (-not $rel) { continue }
    if (<budget> -gt 0 -and $limitSw.ElapsedMilliseconds -gt <budget>) { $limitHit = 'time'; break }
    try { $len = [System.IO.FileInfo]::new($root + '/' + $rel).Length } catch { $len = [long]0 }
    if ($len -gt 0 -and $len -le <fileLimit>) { $limitBytes += $len }
    if (<limit> -gt 0 -and $limitBytes -gt <limit>) { $limitHit = 'bytes'; break }
  }
}
```

要点：
- `-co`（cached + others）：漏掉 `-c` 会低估；`--exclude-standard` 不可省（第 6 行实测）。
- 目录条目（`nested-repo/`）的 `FileInfo.Length` 返回 `$null` 或抛，`$null -gt 0` 为假 → 自然跳过，与 `add -A` 侧的 gitlink 剔除对齐。
- `$len` 可能是 `$null`/`[int]`，比较表达式已能吸收；赋给 `$limitBytes`（`[long]`）时 PS 会自动拓宽。
- 现有 `dirSkipSetBlock`/`$lines` 依赖从本函数移除（剪枝交给 git），但 `oversizeBlock` 仍用它，函数保留。

### M1-D2 POSIX（[src/host/scripts.posix.ts](../../../src/host/scripts.posix.ts) 现 L121-151）

```bash
limit_start=$(date +%s)
limit_tmp="$g/limit-scan.$$"
limit_scan_ok=0
# set -e：条件位置豁免，失败不终止脚本；失败即 fail-open（不判定，照常 add）
if "$git" -c core.quotePath=false --git-dir="$g" --work-tree="$root" ls-files -z -co --exclude-standard > "$limit_tmp" 2>/dev/null; then
  limit_scan_ok=1
fi
limit_sizes=""
if [ "$limit_scan_ok" = 1 ] && [ -s "$limit_tmp" ]; then
  if find "$root" -maxdepth 0 -printf '' >/dev/null 2>&1; then
    limit_sizes=$(cd "$root" && xargs -0 stat -c '%s' < "$limit_tmp" 2>/dev/null || true)
  else
    limit_sizes=$(cd "$root" && xargs -0 stat -f '%z' < "$limit_tmp" 2>/dev/null || true)
  fi
fi
rm -f "$limit_tmp"
limit_total=$(printf '%s\n' "$limit_sizes" | awk -v lim=<limit> -v flim=<fileLimit> '{ if ($1 <= flim) { s += $1; if (lim > 0 && s > lim) { print "OVER " s; exit } } } END { if (lim <= 0 || s <= lim) print s }')
limit_elapsed=$(( $(date +%s) - limit_start ))
case "$limit_total" in
  OVER\ *) echo "SNAP_LIMIT bytes ${limit_total#OVER } <limit>"; exit 0 ;;
esac
if [ <budgetS> -gt 0 ] && [ "$limit_elapsed" -gt <budgetS> ]; then
  echo "SNAP_LIMIT time $((limit_elapsed * 1000)) $(( <budgetS> * 1000 ))"; exit 0
fi
```

要点：
- `cd "$root"` 是必需的：`ls-files` 输出相对 root 的路径，而脚本 cwd 是宿主工作目录。
- `xargs` 遇 index 陈旧条目（文件已删）会报错并继续处理其余路径，`2>/dev/null || true` 兜住；缺失的条目本来也不该计入（`add -A` 会移除它）。
- 空列表用 `-s` 守卫：GNU `xargs` 空输入会执行一次无参数的 `stat`。
- 临时文件放 `$g`（store 目录内、已被排除表覆盖），`rm -f` 无条件清理；`$$` 防并发撞名（虽有串行队列，与 `diff-cur.$$` 既有纪律一致）。
- `dirPruneArgsBlock()` 从本函数移除（`oversizeBlock` 仍调用）。

### M1-D3 注释同步

两处函数头的「一次目录遍历」改为「git 口径 + 逐条 stat」，并写明：为什么停用而非截断（保留原文）、为什么口径必须交给 git（issue #28）、fail-open 的取舍、POSIX 目录条目的 4096 B 级偏差（可忽略，方向安全）。

## M2 文案与文档

| 落点 | 改动 |
|---|---|
| [src/host/snapshots.ts](../../../src/host/snapshots.ts) L65-70 `buildSnapshotLimitNotice` | bytes 分支补口径说明：`…超过上限（约 297 MB / 256 MB，已按 .gitignore 与排除表过滤），已停用快照…`（仍 ≤140 字符） |
| [src/host/config.ts](../../../src/host/config.ts) L51 | `maxWorkspaceBytes` 的 schema `description` 补「口径与 `git add` 一致（含 .gitignore）」 |
| [src/client/locales/zh.ts](../../../src/client/locales/zh.ts) L223 / [en.ts](../../../src/client/locales/en.ts) L216 | hint 同义（`locales-parity` 要求两端键集全等，必须同批改） |
| [README.md](../../../README.md) L156 / [README.en.md](../../README.en.md) L159 | 配置表同义补充 |
| [AGENTS.md](../../../AGENTS.md) L28 | 核心机制第 2 条「遍历工作区统计纳入总量」→「按 `git ls-files --exclude-standard` 口径统计」 |
| [CHANGELOG.md](../../../CHANGELOG.md) `[Unreleased]` | 修复段一条：护栏不再把 `.gitignore` 已排除的目录算进上限 |

## M3 测试

| 文件 | 断言 |
|---|---|
| [tests/unit/scripts-contract.test.js](../../../tests/unit/scripts-contract.test.js) L201-207 | 保留现有「`SNAP_LIMIT` 出现在 `add -A` 之前」；补两组（pwsh/posix）：含 `ls-files`、含 `-co`、含 `--exclude-standard`、`SNAP_LIMIT bytes` 分支仍在 `add -A` 之前；pwsh 侧断言 `$ErrorActionPreference` 在 `ls-files` 前被降级 |
| `tests/probe/`（可选） | 若 CI 有 git，可加一条真跑断言：含 `sub/.gitignore`（`.work/`）的工作区，`limitScanBlock` 输出不含 `.work` 路径的字节。默认**不加**——`tests/unit` 只做纯文本契约，真跑留给实弹（与 #24/#18 同纪律） |

## 改动落点汇总

| 文件 | 改动 | 备注 |
|---|---|---|
| [src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L191-230 | 重写 `limitScanBlock` | 有效行数基线 582 → 约 590，仍 < 700 |
| [src/host/scripts.posix.ts](../../../src/host/scripts.posix.ts) L121-151 | 同语义重写 | 基线 460 → 约 480 |
| [src/host/snapshots.ts](../../../src/host/snapshots.ts) L65-70 | 文案一句 | 纯字符串 |
| [src/host/config.ts](../../../src/host/config.ts) L51 | schema description | 无行为变化 |
| `src/client/locales/{zh,en}.ts` | hint 同义 | 需 `npm run build`（client 产物） |
| README 双语 / AGENTS.md / CHANGELOG.md | 口径说明 | 文档 |
| [tests/unit/scripts-contract.test.js](../../../tests/unit/scripts-contract.test.js) | 补契约断言 | 两平台各一组 |

不改：`src/types/*`（无新哨兵字段，`SNAP_LIMIT` 协议原样）、`config.ts` 默认值、`routes-*`、client 逻辑。

## 验收标准

门禁：`npm test`、`npm run typecheck`、`npm run build`（`git diff --exit-code lib/` 为空）、`npm run verify:host` 全绿。

实弹（win32 pwsh + Git Bash 各一遍，记录进 `docs/plans/completed/smoke-checklist-records.md`）：

1. **issue 场景复原**：造一个「`.gitignore` 排除 300 MB 中间产物、源文件 < 1 MB」的工作区（上限取 10 MB 以便触发），旧模板报 `SNAP_LIMIT bytes ~300 MB`，新模板 `SNAP_OK` 且 `snap-*` tag 生成。
2. **反向仍能触发**：同一工作区把 `.gitignore` 删掉 → 新模板报 `SNAP_LIMIT bytes`（说明护栏没被架空）。
3. **父级豁免**：父 root 下带自己 `.git` 的子项目 → 子项目内容不计入父级总量。
4. **大文件仍剔除**：工作区放一个 20 MB 文件（`maxFileBytes` 8 MB）→ 不计入总量。
5. **失败 fail-open**：把 `$git` 指到不存在的可执行文件（或在只读 git-dir 上）→ 不输出 `SNAP_LIMIT`，`add` 的失败路径照旧报错。

## 风险与回退

| 风险 | 缓解 / 回退 |
|---|---|
| 统计耗时上升（2.2 万条目 58→225 ms，10 万条目约 1 s 量级） | 与 `add -A`（同量级工作区要哈希全部内容，秒到数十秒）相比仍是小头；`scanBudgetMs` 语义不变，超预算照旧停用。回退＝还原 `limitScanBlock` 单点。 |
| `ls-files` 因 index 异常失败 → 护栏静默失效 | fail-open 是有意取舍（见决策表）；`add -A` 会以 `SNAP_SKIP`/fatal 暴露同一根因，用户仍能看到。 |
| 目录条目（嵌套仓库）在 POSIX 侧计入 4096 B | 量级可忽略（每个嵌套仓库一条），且方向是偏高（可能提前停用而非漏检）；需要精确时可后续按 `stat -c '%F'` 过滤。 |
| 文件名含换行 | `-z` 两侧都用，已覆盖；pwsh 侧 5.1 的 `Split` 尾部空串已显式跳过。 |
| 5.1 的 `$ErrorActionPreference` 未恢复 | `try/finally` 强制恢复；契约单测断言降级语出现在 `ls-files` 之前。 |

## 备选方案（本次不实施，记录取舍）

- **B1 `git check-ignore --stdin` 批量过滤目录**（issue 的次选）：仍要自己遍历目录树，省不掉成本；且 `-o` 的输出形态（`dir/` 目录条目 vs 文件）要另写分支。
- **B2 `-c` 走 `ls-files --debug` 的 `size:` 字段，只对 `-o` 做 stat**：常态（无新文件）省掉全部 stat，但要解析 debug 块且 index 里的 size 可能过时；收益集中在「几乎没变化的工作区」，对首次/大改工作区无帮助。记为后续优化。
- **B3 先 `add -A` 再按 index 求和**：口径最精确（不需要预估），但护栏的意义正是「不跑 add」，与 #24 的初衷相反。
- **B4 把口径做成配置项**：两种口径并存＝用户要理解两套语义，且默认值怎么选都会让一批人误判；否决。

## 实施记录（2026-10-27）

**改动**：`src/host/scripts.pwsh.ts` 与 `src/host/scripts.posix.ts` 的 `limitScanBlock` 按上文草案重写（git 清单 + 批量 stat + fail-open）；`src/host/snapshots.ts` 停用文案补口径说明；`src/host/config.ts` 两条 schema description、zh/en locale hint、README 双语配置表、AGENTS.md 核心机制第 2 条同步措辞；CHANGELOG `[Unreleased]` 修复段两条；`tests/unit/scripts-contract.test.js` 新增 4 例、`tests/unit/snapshot-limit.test.js` 新增 1 例。

**计划外发现（同批修复，属既有缺陷）**：实弹 D 场景（父工作区下带 `.git` 的子项目）在 POSIX 上直接 fatal `this operation must be run in a work tree`。根因是影子仓库用 `git init --bare` 建，裸 `--git-dir` 下 git 认为没有工作树，**任何写 index 的调用都必须显式 `--work-tree`**；三处 `update-index --force-remove` 都没带：

| 落点 | 修复前的实际后果 |
|---|---|
| `dropGitlinksBlock` | pwsh 侧 native 非零不抛 → gitlink 静默留在 index（快照多一条无意义条目）；posix 侧 `set -e` 直接终止整条快照（含嵌套仓库的工作区在 POSIX 上**每条消息都快照失败**） |
| `oversizeBlock` | 两侧都被容错吞掉 → `maxFileBytes` 的「大文件不进快照」承诺从未生效（实弹 C 场景修复前 TREE 与 A 不同，说明 10 MB 文件真的进了快照） |
| `excludeSyncBlock` 清理循环 | 被 `2>/dev/null \|\| true` 吞掉 → 「改排除表后已跟踪条目移出 index」从未生效（新文件不受影响，靠 `add` 前的 `info/exclude` 生效） |

三处均补 `--work-tree`；`excludeSyncBlock` 因 `ensureGitScript` 也复用它（那时没有 `$root`）而做了条件分支，无 root 时退回原调用（命中列表通常为空，fail-open）。`read-tree --empty` 实测不需要 work-tree，未动。契约单测钉住「三处写 index 的 `update-index` 一律带 `--work-tree`」。

**与计划的另外两处偏差**：

1. POSIX 侧目录条目改为按 `stat %F` / BSD `%HT` 过滤（计划里写的是「接受 4096 B 级偏差」）——改成类型列后与 pwsh 侧完全对齐，成本只是格式串加一列、awk 多一个 `next`。
2. pwsh 侧用 `@(& git ... ls-files -z ...)` 收成单串再 `Split([char]0)`（实测 5.1/7 都保留 NUL），比计划里的 `-join ''` 写法少一次字符串拼接；5.1 的 `Split` 尾部空串由循环里的 `if (-not $limitRel) { continue }` 吸收。

**门禁**：`npm run typecheck` 零错误；`npm test` **41 文件 529 例全绿**（新增 5 例：护栏口径 2 + pwsh EAP 纪律 1 + posix 批量 stat 1 + bare 仓库 `--work-tree` 1）；`npm run build` 后 `lib/` 更新（`scripts.pwsh.js` / `scripts.posix.js` / `snapshots.js` / `config.js` / `client.js`）；`npm run verify:host` 通过（inject=shell,sessions,agents，端点 13 项）。

**双平台实弹（10/10，脚本由构建后的 `lib/` 模板产出，win32 `powershell.exe` 5.1 + Git for Windows bash）**：

| # | 场景 | pwsh | posix |
|---|---|---|---|
| A | 嵌套 `.gitignore` 排除 5 MB 产物、源文件 200 KB、上限 1 MB | `SNAP_OK` | `SNAP_OK` |
| B | 删掉 `.gitignore`（5 MB 必须计入） | `SNAP_LIMIT bytes 3350528 1048576` | 同左 |
| C | 额外放 10 MB 单文件（`maxFileBytes` 8 MB） | `SNAP_OK`，TREE 与 A 相同（大文件确实未进快照） | 同左 |
| D | 父工作区下带 `.git` 的子项目（3 MB 内容） | `SNAP_OK`，TREE 与 A 相同（子仓库与 gitlink 都不进） | 同左（修复前此场景 fatal） |
| E | 损坏 index（`ls-files` 失败） | 输出无 `SNAP_LIMIT`（fail-open，`add` 照旧 fatal） | 同左 |

**仍未做**：DSH 会话级活体冒烟（在真实大工作区里发消息看提示消失/恢复）留待发布前的人工冒烟批次，记录进 `docs/plans/completed/smoke-checklist-records.md`。
