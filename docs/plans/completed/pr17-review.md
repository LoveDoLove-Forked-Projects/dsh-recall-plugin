# PR #17 审查：gc 失败退避 / oversize 跳过排除目录 / baseExcludes 加宽

> 状态：已完成并归档（2026-09-22）。PR #17 已合入上游 main（merge commit `cd9a9bd`），修复与文档提交 `1c270eb` / `874ae0d` 已推送、CI 绿；P0/P1/P2-1 已修复并实弹复验，P2-2/P2-3 已同步，P2-4/P2-5 已核验并定案（见末节）；仅剩版本号待发版时 bump
> 对象：[PR #17](https://github.com/limbo947/dsh-recall-plugin/pull/17)（`fix/snapshot-io-storm` → `main`，1 commit，14 文件 +266/-43，2026-09-22）
> 审查环境：Linux x86_64（bash 5.2.21 / GNU find 4.9.0），PR 分支 worktree 实跑

## 总结论

问题诊断、实测数据与修复方向均成立；**两个必须修**（P0 让 posix 侧核心优化静默全废，P1 让退避修复在 Windows 主战场对快速失败不生效），修完再合。P2 为顺手项与待确认项。

## 已验证通过（Linux 实机）

| 验证项 | 结果 |
| --- | --- |
| `npm ci --legacy-peer-deps` | 通过——package-lock 改动实为修复 main 上的陈旧锁（lock 停在 2.3.3/旧 peer 范围，package.json 已是 2.3.24/新范围），正当的随行修复 |
| `npm run typecheck` | 通过 |
| `npm test` | 371/371 全绿，与 PR 声明一致 |
| `npm run build` 后 `git diff lib/` | 为空（产物新鲜度合规） |
| 生成的 posix snapshot 脚本 `bash -n` | 语法通过 |
| 退避数学 | 失败后 `gcLastAt = now − gcHours + 30min` → 正好 30 分钟后时间门槛放行；`gcCount` 条数门槛在退避窗口内照常生效，与 PR 描述一致 |
| 块间依赖顺序 | pwsh `$lines` / posix `$new_exc` 均由前置 `excludeSyncBlock` 无条件定义；snapshot/diff/rollback 三条链路中 excludeSync → oversize 的顺序全部正确 |

## P0（阻塞）：posix oversize 目录跳过静默全废

**位置**：`src/host/scripts.posix.ts` `oversizeBlock`，生成的脚本行：

```bash
oversize_prune=("\(" "${oversize_args[@]}" "\)" -prune -o)
```

**根因**：`\(`/`\)` 出现在数组赋值的引号内，是**数据**而非 shell 源码——bash 不剥反斜杠，find 实际收到 2 字符 token `\(`。命令行里直接写 `\(` 之所以可用，是 shell 分词阶段剥掉反斜杠后 find 收到单字符 `(`；两种形态不可混用。

**实测**（GNU find 4.9.0 + bash 5.2.21，数组展开逐字复刻生成脚本）：

```
find: paths must precede expression: `\)'
# find 退出码 1，stdout 零输出
```

**影响放大链**：find 报错被 `2>/dev/null` 吞掉 → 管道零输出 → xargs 空跑 → 末端 `|| true` 兜住 → **整个 oversize force-remove 步骤在 Linux/macOS 上静默什么都不做**。baseExcludes 恒含 `.git`/`node_modules/`，`oversize_args` 必非空，此路径 100% 触发。这不是「跳过失效退回全扫」，而是连原有的慢扫都没了——比 PR 之前更糟，正是合规清单 #8 警告的「静默死掉且零报错」形态。macOS 的 BSD find 同样只认单字符 `(`（转义是 shell 层约定，find 本身不认 `\(` token）。

**修法**（括号是数据，无需转义）：

```bash
oversize_prune=('(' "${oversize_args[@]}" ')' -prune -o)
```

**必须同步改**：`tests/unit/scripts-contract.test.js` 新增断言 `toContain('"\\(" "${oversize_args[@]}" "\\)" -prune -o')` 把 bug 形态钉成了契约，修复时一并更新。

**对照警示**：`killOrphansScript` 里的 `\(` 是**正确**的——那是脚本源码内联转义（shell 会剥），与本处「引号内数据」性质不同，不要以「统一风格」为由误改它。

**测试补强建议**：模板形状断言拦不住这类 bug。建议给 oversize 块补一条 posix 实弹单测（生成脚本片段在真实 bash + find 下跑，断言排除目录未被遍历、超大文件仍被剔除），把工作流第 3 条「脚本模板改动双平台实弹复验」机器化。

复现脚本（Linux/macOS 可直接跑）：

```bash
oversize_args=(-name .git -o -name node_modules)
oversize_prune=("\(" "${oversize_args[@]}" "\)" -prune -o)
find /tmp "${oversize_prune[@]}" -type f -print   # → find: paths must precede expression: `\)'
oversize_prune=('(' "${oversize_args[@]}" ')' -prune -o)
find /tmp "${oversize_prune[@]}" -type f -print   # → 正常遍历
```

## P1（阻塞）：pwsh `gcScript` 缺 `$LASTEXITCODE` 检查，gc 快速失败被误报成功

**位置**：`src/host/scripts.pwsh.ts` `gcScript`：

```powershell
& $git --git-dir=$g gc --quiet --prune=now
Set-Content -LiteralPath (Join-Path $g 'gc.stamp') ...
Write-Output 'GC_OK'
```

**推理链**（基于仓库既有结论 I14）：pwsh 对 native 非零退出不抛（`EAP=Stop` 不作用于 native 命令）→ git gc 失败（磁盘满 / 锁冲突 / 杀软锁 pack）后脚本继续执行 → stamp 照写、GC_OK 照出 → 进程 exit 0 → `runShell` 按进程退出码判成败 → Host 认为 gc 成功。

**后果**：

1. 本 PR 的退避修复在 Windows（pwsh 方言）对**快速失败**不生效——`gcLastAt` 仍被推进完整 gcHours 周期，照样 24h 不重试；
2. `gc.stamp` 被假性刷新，跨重启后的节流凭据也是假的；
3. 超时被杀的场景由「1800s 新超时 + runShell 超时抛错」覆盖，漏的只有快速失败半区；
4. issue #18 的事故机正是 Windows 11 + PS 5.1——Windows 恰是本修复的主战场。

posix 版有 `set -e`，天然正确，无需改。

**修法**（同文件 `rescueScript`/`diffScript` 已有同款 pattern）：

```powershell
& $git --git-dir=$g gc --quiet --prune=now
if ($LASTEXITCODE -ne 0) { throw ("git gc failed (exit " + $LASTEXITCODE + ")") }
```

**Windows 实弹复核（2026-09-22）**：PS 5.1 与 pwsh 7 下均实测成立——`git gc` 以 128 快速退出时，脚本仍 exit 0、输出 `GC_OK`、刷新 `gc.stamp`；加上上述检查后转为 exit 1、无 `GC_OK`、stamp 不动。数据见末节 W1。

## P2 / 顺手项与待确认

1. **posix prune 未限 `-type d`**：`\( -name dist … \) -prune` 会把**同名文件**一并跳过；pwsh 侧 `EnumerateDirectories()` 只对目录生效，两平台不对称。后果仅是一个 >100MB 且文件名恰为 `dist`/`target`/`.git` 的文件不再被移出快照——fail-open 方向、极罕见。建议 `\( -type d \( -name … \) \) -prune -o` 对齐（随 P0 一起修）。**已实弹复现**（末节 W3）：只修 P0 时 `dist` 大文件残留于 index，补外层 `-type d` 后与 pwsh 侧终态一致。
2. **README 未同步**：`README.md` / `README.en.md` 的 `baseExcludes` 默认值仍是旧 4 项（仓库工作流：行为变更同步 README 双语）。**已修**（末节）。
3. **`cordis.patch.yml` 注释示例陈旧**：`# baseExcludes: ['.git', 'node_modules/', '.dsh-recall-snapshots/']` 缺 `dsh-recall-snapshots/`；用户照抄 uncomment 会整行覆盖加宽后的默认表，并重新打开 issue #6 的自吞口子（root=HOME 场景）。建议更新或删除该示例行。**已修**（改为说明覆盖语义、不再给半张表示例，末节）。
4. **新常量未走 Config**：`GC_RETRY_BACKOFF_MS`/`GC_TIMEOUT_MS` 硬编码，对照合规清单 #3「新参数一律走 Config 字段」。仓库有先例（`STALE_LOCK_MIN` 以注释论证「内部安全策略常量不走 Config」）——建议补同款论证注释或加 Config 字段，维护者拍板即可。**已核验并定案**（末节「P2-4 核验」）：判定为「与 `FUSE_AFTER` 同类的内部策略常量」成立；已在 `maintenance.ts` 按 `STALE_LOCK_MIN` 先例补上「不走 Config」的定性论证，不新增 Config 字段。
5. **存量用户触达待确认**：加宽的 `baseExcludes` 只惠及「从未保存过设置」的用户；若 dsh-settings 会把解析后的旧默认物化进用户层，老用户升级后仍用旧表（excludeSync 的清理循环也不会因内容变化而触发）。取决于 settings 持久化行为，建议作者在 PR 里补一句实测结论。**已核验，不必改代码**（末节「P2-5 核验」）：真实 dsh-settings 不物化默认，存量用户拿到新表；只有「用户层显式写过排除表」会锁住旧表，config-reset 可解；存量 `info/exclude` 在下次快照即被重写。
6. **版本号未 bump**：按仓库惯例由维护者发版时处理，仅记录。

## 范围确认

PR 声明不覆盖 [issue #18](https://github.com/limbo947/dsh-recall-plugin/issues/18)（root 自身即构建产物目录 + index 引用致 gc 空转），属实——那是另一条堆积路径，本 PR 合入后 #18 仍需单独修。其建议 3「gc 前清 index」与 P1 修的是同一块 `gcScript`，可考虑一并处理。

## Windows 实弹复核结果（2026-09-22）

环境：Windows 10.0.19045；Windows PowerShell 5.1.19041.7725 与 pwsh 7.6.6；Git for Windows 2.53.0（MSYS bash 5.2.37 + GNU findutils 4.10.0）；Node 24.14.1。脚本文本取自 PR head `ee5c129` 的 `src/host/scripts.{pwsh,posix}.ts`，按 `scripts/build-host.mjs` 同款参数转译，产物与 PR 提交的 `lib/` 逐字节一致（仅行尾差异）；执行复刻官方 `dsh-pwsh-local` 的 argv 形态（`-NoLogo -NoProfile -NonInteractive -Command` + 官方编码前导 + 插件 `UTF8_PRELUDE`），成败判定沿用 `runShell` 的进程退出码。

### W1（P1）：误报成功成立，PS 5.1 与 pwsh 7 一致

诱导 `git gc` 非零退出后跑 PR 版 `gcScript`，再跑加 `$LASTEXITCODE` 检查的同款脚本（两 shell 各一遍）：

| 诱导形态 | git gc 自身 | PR 原脚本 | 加 `$LASTEXITCODE` 检查后 |
| --- | --- | --- | --- |
| `.git` 指向非仓库目录 | exit 128 / 42ms | exit 0、输出 `GC_OK`、`gc.stamp` 被写 | exit 1、无 `GC_OK`、stamp 不写 |
| `objects` 被占位文件顶替 | exit 128 / 154ms | 同上 | 同上 |
| `objects` 拒绝写入（ACL deny） | exit 128 / 143ms | 同上 | 同上 |
| 健康仓库（对照） | exit 0 / 293ms | exit 0、输出 `GC_OK`、stamp 被写 | 同上 |
| `index.lock` 存在（反例） | exit 0 | 不构成失败态，两版行为一致 | — |

三种失败形态都是**快速失败**（42–154ms，落在非超时半区），与 P1 的推断链吻合。`GC_OK` 在两套模板之外没有消费点（只在 `scripts.pwsh.ts` 与 `scripts.posix.ts` 里写出），JS 侧只看退出码，误报没有第二道拦截。

**结论**：P1 成立，Windows 主战场（PS 5.1）同样命中；评审给出的修法实测有效——脚本首行已置 `EAP='Stop'`，`throw` 让进程以 1 退出，`runShell` 因此抛错、`runGc` 走 catch 记错并把 `gcLastAt` 回拨退避窗口。

### W2（oversize 的 pwsh 半）：目录跳过按设计工作

**独立探针**（文本切片自真实生成脚本，只加计数与清单插桩）：把被排除目录内的超大文件用 `git add -f` 强塞进 index——子树若未被遍历，这些条目就不会被 `update-index --force-remove`。

| 版本 | 探针扫到的超大文件 | index 中保留（=子树未被遍历） |
| --- | --- | --- |
| PR | `dist`、`src/big.bin`、`plain/big.bin` | `node_modules/dep/big.bin`、`target/debug/big.bin`、`nested/node_modules/x/big.bin`、`nested/target/x/big.bin` |
| main（对照） | 上述 7 条全部 | 无 |

A/B 差异只可能来自 skip 逻辑；任意层级同名目录（`nested/node_modules/`）同样跳过。

**端到端** `snapshotScript`（`maxFileBytes=1024` + PR 默认 `baseExcludes`）：PS 5.1 与 pwsh 7 均 exit 0、stderr 空、输出同一棵树指纹 `TREE bc98abd9…` + `SNAP_OK`，终态 index 只剩 `keep.txt`——`src/big.bin`/`plain/big.bin` 被剔除，`node_modules`/`target` 零泄漏，名为 `dist` 的**大文件**（非目录）仍被扫到并剔除。

`HashSet[string]::new([StringComparer]::OrdinalIgnoreCase)` 在 PS 5.1（.NET 4.0.30319）下构造与查用正常，无需为旧 .NET 换写法；两 shell 产出相同树指纹，跳过逻辑不引入版本间行为差。

耗时：`node_modules/perf` 2400 文件已跳过 vs 未跳过为 430ms vs 500ms（同工作区另有 3200 文件的对照目录，两侧都扫）。

### W3：win32 + bash 方言跑 posix 模板不成立；P0 本身仍实证

**送达性**：模板选择是 `isWin ? pwshScripts : posixScripts`（`src/host/store.ts`，产物同处 `lib/store.js`），只按 `process.platform` 单选，与 `ctx.shell` 方言无关；I36 的 bash 方言只把执行通道换成直连 `powershell.exe`，跑的仍是 pwsh 模板。win32 上 posix 模板不可达——P0 是 Linux/macOS（含 WSL 内运行的宿主进程）前件，不是「所有平台的前置条件」。

**P0 复现**（Git for Windows 的 bash + GNU find 4.10.0，即 posix 平台的真实对手）：数组展开后 find 实收到两字符 token `\(`，报 `find: paths must precede expression: '\)'`、退出码 1；换成 `'('`/`')'` 后同一条 find 正常返回（rc 0）。

**端到端** PR 版 posix `snapshotScript`（同一工作区、各自干净索引）：

| 形态 | 脚本退出码 | stdout | index 中残留的超大文件 |
| --- | --- | --- | --- |
| PR 原样 | 0 | `TREE` + `SNAP_OK` | `src/big.bin`、`plain/big.bin`、`dist` |
| P0 修法（`'('` … `')'`） | 0 | `TREE` + `SNAP_OK` | `dist` |
| P0 + P2-1（外层 `-type d` 限定） | 0 | `TREE` + `SNAP_OK` | 无 |

静默失效实锤：find 报错被 `2>/dev/null` 吞掉、管道零输出、xargs 空跑、`|| true` 兜底，脚本照旧 exit 0 并输出 `SNAP_OK`。P2-1 也从「理论后果」变为可复现事实——只修 P0 时，与排除目录同名的大文件（`dist`）会被 `-name dist` 一并剪掉，补外层 `-type d` 后与 pwsh 侧终态一致。

### 复核结论

- P0：阻塞，且修复是全部 POSIX 平台的前件；W3 不构成「win32 也踩」的理由。
- P1：阻塞且实测成立（含 PS 5.1 主战场）；建议修法实测有效。
- P2-1：实测可复现，建议随 P0 一并修。
- 机器化：模板形状断言拦不住的这类 bug 可落进实弹单测——CI 是单 job（ubuntu-latest + Node 22），bash + GNU find 现成；pwsh 侧同类实弹（如「gc 非零退出必须判失败」）需要 windows runner，属新增矩阵。

## 修复落地与复验（2026-09-22）

PR #17 快进合并进本地 main（停在 `ee5c129`，未推送）；阻塞项与 P2-1 在同一工作区修好，尚未提交。

| 项 | 改动 |
| --- | --- |
| P0 | `src/host/scripts.posix.ts` 的 prune 前缀改为单字符括号数据 `'('` / `')'`，注释写明「引号内是数据，与 `killOrphansScript` 的源码内联转义不可混用」 |
| P2-1 | 同一行加外层 `-type d`，prune 只剪目录，与 pwsh 侧按 `EnumerateDirectories` 判名对齐 |
| P1 | `src/host/scripts.pwsh.ts` 的 `gcScript` 在 gc 之后、写 stamp 之前加 `if ($LASTEXITCODE -ne 0) { throw ... }` |
| 契约单测 | `tests/unit/scripts-contract.test.js` 改钉修复后形态并显式排除 `"\("`；新增「gc 失败必须可见」断言 |
| 文档同步 | README 双语补齐 `baseExcludes` 默认表（P2-2）；`cordis.patch.yml` 删掉会误导整行覆盖的陈旧示例、改为说明覆盖语义（P2-3）；CHANGELOG 补两条修复条目 |

复验（沿用同一脚手架，脚本文本由修复后的源码重新转译，产物与 `lib/` 逐字节一致）：

- W1：三种快速失败形态下 `exit 1` + 无 `GC_OK` + stamp 不写（PS 5.1 与 pwsh 7 一致）；健康仓库仍 `exit 0` + `GC_OK`。反向对照（手工删掉检查行）复现「exit 0 + `GC_OK` + stamp 刷新」。
- W2：pwsh 模板只动了 gc 一行，端到端仍 `TREE bc98abd9…` + `SNAP_OK`，跳过语义不变。
- W3：修复后的 posix 端到端同样得到 `TREE bc98abd9…`、index 只剩 `keep.txt`——与 pwsh 侧**同一棵树指纹**，「两平台语义对齐」有了可复现证据；反向对照「只修括号」残留 `dist`、「修复前形态」三条全残留。
- 门禁：`npm run typecheck` 通过；`npm test` 372/372；`npm run build` 后 `lib/` diff 仅该两个模板文件（产物新鲜度合规）；`npm run verify:host` 装配断言通过。

## P2-4 核验：新常量该不该走 Config

**判定依据**：合规清单 #3 的判定标准是「能否在 cordis.yml 改值不改代码」，AGENTS.md 的发布前复核项也列了「#3 无新硬编码」。实测 `Config({})` 的字段集为 9 个（`gcSnaps`…`retentionDays`），不含这两个常量——按字面判定它们确实不满足 #3。

**分类结论**：两者与 `FUSE_AFTER` / `FUSE_BACKOFF_BASE_MS` / `FUSE_BACKOFF_CAP_MS` 同类，属内部策略常量而非用户可调参数——`GC_TIMEOUT_MS` 是把既有的 inline `timeoutMs: 600000` 具名化（非本 PR 新增参数），`GC_RETRY_BACKOFF_MS` 是退避窗口策略，取值与 `gcHours` 语义耦合（`gcLastAt` 回拨量由两者共同决定，单独暴露反而容易配出「退避长于周期」这类无意义组合）。仓库既有的豁免写法见 `STALE_LOCK_MIN`：「…属内部安全策略常量，与 snapshots.js 的 FUSE_AFTER 同类，不走 Config」。

**差距与定案**：`maintenance.ts` 里两个常量的注释只说了「为什么是这个值/这种机制」，没有那句分类定性。已按先例补上，**不新增 Config 字段**，理由写进代码注释：退避的回拨量由「`gcHours` − 退避」共同决定，退避单开成字段就能配出「退避长于周期」（`gcLastAt` 落到未来、永不重试）这类无意义组合；`GC_TIMEOUT_MS` 是被动兜底而非节流旋钮，要改 gc 节奏的用户调 `gcHours` 即可（issue #18 的根因也不是超时）。唯一有用户价值、将来若真要开口的是 gc 超时（GB 级库的 repack 时长），但那是独立议题，不在本 PR 范围。

## P2-5 核验：存量用户能否拿到加宽默认表

用本机 dsh 安装里的真实 `@deepseek-ai/dsh-settings` 0.1.6-alpha.2 + `dsh-settings-file` provider、插件真实 `Config`，复刻 loader 的 base（`cordis.patch.yml` 的 insert 行 config 经 schema 解析——该行不含 `baseExcludes`）与本机真实 `settings.yaml`，逐个场景观察解析值：

| 场景 | 解析出的 `baseExcludes` | 用户文档是否被改写 |
| --- | --- | --- |
| 存量用户现状（真实 `settings.yaml` 副本，`dsh-recall: {}`） | 26 条新表（含 `target/`、`*.zip`） | 否 |
| 全新用户（文档为空） | 26 条新表 | 否 |
| 老用户只改过其它字段（`gcSnaps: 100`） | 26 条新表，`gcSnaps` 保持 100 | 否 |
| 反例：用户层显式写过旧 4 项表 | 旧 4 项 | 否 |
| 上一条之后执行 config-reset（`settings.replace('dsh-recall', {})`） | 回到 26 条新表 | 是（分节变为 `{}`） |

**结论**：dsh-settings 不把解析后的默认物化进用户层（解析是 `schema(mergeLayers(base, section))` 的纯读路径，写入只触碰用户层），加宽的默认表经 schema 默认与 base 两层进入存量用户；唯一锁住旧表的是「用户自己显式改过排除表」，而这正是 `config-reset` 的出口。

**存量影子仓库的生效链路**也已实测：把 `info/exclude` 预置为旧 4 行，跑一次真实 `snapshotScript` → `exit 0` + `SNAP_OK`，`info/exclude` 被重写为 26 条新表（另加首行 BOM 占位空行），`target/` 下的文件未进 index。逐行比对因内容变化照常触发重写与 `ls-files -i -c` 清理循环，原判断的「不会触发」不成立。
