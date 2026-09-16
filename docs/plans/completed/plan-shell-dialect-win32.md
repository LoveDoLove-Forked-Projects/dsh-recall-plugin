# win32 shell 方言冲突修复计划（issue #15）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：已实施（2026-09-16 落地并随 2.3.22 发版，见文末「实施记录」）
> 触发来源：GitHub issue #15（2026-09-16，报告者 yihefeikong-rgb，dsh harness 0.1.6-alpha.1 + Windows 11）；契约核验基于本机 dsh 安装目录 `@deepseek-ai/dsh-shell`、`@deepseek-ai/dsh-pwsh-local` 的 `.d.ts` 与构建产物源码。

## 背景：为什么做

插件按 `process.platform === 'win32'` 选择 PowerShell 脚本模板（[store.ts](../../../src/host/store.ts) `createRuntime` 内 `isWin` / `scripts` 二选一），但命令实际全部经 `ctx.shell.run()` 执行。官方 shell 能力是**提供方注册制**：一个 composition 恰好一个 `ctx.shell` 实现（bash-local / bash-sandbox / pwsh-local / pwsh-sandbox 四选一），宿主 profile 可以把 win32 上的 `ctx.shell` 配成 **bash**（如仅启用 `bash-sandbox`、禁用 `pwsh-sandbox`）。此时 pwsh 模板被 bash 执行，第一行编码前导就报语法错误：

```
bash: -c: line 1: syntax error near unexpected token `('
bash: -c: line 1: `$OutputEncoding = [Text.UTF8Encoding]::new($false)'
```

后果：快照从未成功、撤回按钮不可用——win32 上整个功能面死亡。

## 契约核验（合规清单 #8：先验证再动手）

- **官方 `ShellExecutor` 不暴露方言标识**。`dsh-shell/lib/types/index.d.ts` 的公开面只有 `resolve(request)` / `run(spec)` / `start(spec)` 与 `sandboxMode` getter；`ShellExecRequest` / `ShellRunResult` 无任何「我是 bash 还是 pwsh」字段。因此**不能查询、只能行为探测**——`constructor.name` 之类实现细节属禁止的字段假设。
- **官方 pwsh 执行形态可复刻**。`dsh-pwsh-local/lib/index.js`：候选顺序 `ProgramFiles\PowerShell\7\pwsh.exe` → PATH 各目录 `pwsh.exe` → `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`，spawn 参数 `-NoLogo -NoProfile -NonInteractive -Command <单 argv 元素>`。插件模板本就按 PS 5.1 兼容写（I14/I27 探针钉），直连 `powershell.exe` 是最小公分母。
- **issue 附注「v2.3.21 lib/store.js 是 CRLF」不实**。实测 HEAD 与工作区的 `lib/store.js`、`src/host/store.ts` CRLF 计数均为 0（纯 LF 入库）；报告者本地 `core.autocrlf=true` 令 checkout 转 CRLF，属其本地配置，仓库无需动作。

## 方案取舍

issue 给了两条建议（①②），另评估一条不换通道的套娃路线（③）；采纳 ① 的改良版、否决 ②③：

| 路线 | 判定 | 理由 |
|---|---|---|
| ② 按 `ctx.shell` 实际方言换 POSIX 模板 | **否决** | win32 下 `isWin` 不止决定方言，还锁着路径分隔符、store 目录哈希、home 解析、git 输出解析（JSON vs TSV）。换模板必须连根换 `isWin`，而 Git Bash 的 `$HOME` 是 POSIX 风格路径，与 Node 侧算出的 Windows 路径哈希不一致——**存量快照库撕裂**（老快照找不回）。 |
| ③ 经 bash 套娃 `powershell.exe -EncodedCommand`（保留官方托管通道） | **否决** | 错误消息双层包裹（bash stderr 套 pwsh stderr）令 recordError 分类失真；stdin 需穿透 bash→pwsh 两层；argv 长度上限 32767 被 base64 膨胀吃掉 4/3。直连 spawn 已被 issue 报告者实测可用，通道更短、诊断更干净。 |
| ① win32 下绕过 `ctx.shell` 直连 powershell.exe | **采纳（加方言探针门控）** | 保住 pwsh 模板全部语义，只换执行通道；默认生产路径（ctx.shell 即 pwsh）零变化。但**不能无条件直连**——那会绕开官方 pwsh 执行器的托管环境（PATH 注入、输出预算、超时治理），对占多数的正常部署是回归风险。故只在「win32 且 ctx.shell 是 bash 方言」时启用直连通道。 |

安全模型不变：现有 shell 调用已是 `sandboxPolicy: { mode: 'danger-full-access' }`（等价本地执行，理由见 store.ts 注释），直连 spawn 不扩大能力；命令仍是固定模板，唯一变量是插件自推导路径。

## 任务分解

### S1 方言探针（一次性、惰性、缓存）

`runShellMeta` 首次调用时经 `ctx.shell` 执行探测命令（pwsh 语法标记输出，如 `Write-Output <哨兵>`，哨兵取罕见 ASCII 串防巧合命中）：

- 输出含哨兵且 exit 0 → pwsh 方言；
- 非零退出（bash 下 command-not-found 即 127）或 reject → bash 方言。

实现要点：

- 结果缓存在 `state`（工厂级，无模块级可变状态），并以 **in-flight promise 去重**——session/event 突发时 `runShellMeta` 会并发首调，探针本身只许跑一次。
- 探测走独立路径（直调 `shell.resolve`/`shell.run`，不经 `runShellMeta`），**不触发** `cleanupAfterGitFailure`（探测失败是判据本身，不是 git 失败）；不带 UTF8_PRELUDE（探针测的是执行器方言，不是前导兼容性）。
- 探针用短超时（30s）：已核 dsh-timeout `clampTimeout = min(requested ?? default, max)`，只 cap 上限、不抬下限，短超时不会被抬到执行器默认 120s。
- 探测命令**内联在 store.ts**，不做成 `scripts.pwsh.ts` 新导出——后者会触发双模板同名契约断言（types/scripts.ts + scripts-contract 单测）。
- POSIX 平台不探测：bash 模板与 bash shell 天然一致。理论上 POSIX 宿主也可配 pwsh 执行器（`resolvePwshPath` 有非 win32 分支返回 `'pwsh'`），该组合现实中未见、本计划不支持；探针按方言枚举设计，保留扩展位。

### S2 直连 pwsh 执行通道

win32 且探针判 bash 时，`runShellMeta` 改走 Node `child_process.spawn`：

- 可执行文件：`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`（PS 5.1 全平台自带，不赌 PS7 存在）；
- 参数：`-NoProfile -NonInteractive -Command <整段命令单 argv>`，命令仍前置 `scripts.UTF8_PRELUDE`（与现路径一致）；
- **env 复刻官方清洗**（dsh-subprocess `scrubbedParentEnv` + pwsh-local `ENV_OVERRIDES`）：子进程 env = 宿主 env 剥掉 `/KEY|PASSWORD|SECRET|TOKEN/i` 与全部 `DSH_*`（不区分大小写）+ `{NO_COLOR:'1', PAGER:'cat', GIT_PAGER:'cat'}`——补上官方 credential scrub，「安全模型不变」严格成立（否则宿主凭证进入 powershell.exe 进程环境；对本插件固定本地命令虽无实际风险，几行成本换语义对齐）。store 不分裂的论证：`homeDirScript` 第一分支 `$env:DSH_HOME` 在官方路径恒被 scrub 为空、走 Node 侧传入的 envHome 字面量（= `process.env.DSH_HOME`）；spawn 通道剥掉 `DSH_*` 后同样走 envHome 字面量——两通道收敛到同一 store 根；
- **cwd 显式传** `sandboxPolicy.workspaceRoot || process.cwd()`，对齐官方 `resolve` 的 workdir 默认行为（模板全用绝对路径，本项是防御性对齐）；
- 保留四项官方语义（缺一个就有对应回归）：
  1. **stdin 字节透传**——`index.json` / `exclude.txt` 靠 stdin 传全文，`spawn` 后 `child.stdin.end(Buffer.from(body,'utf8'))`，绕开 PS 5.1 `Console.In` 代码页坑（I27：直写字节流，不经文本编码层）；
  2. **stdout 截断标记**——收集器超 `stdoutMaxBytes` 后保留尾部并置 `truncated`（F-G3：`loadIndex` 靠它区分「读截断」与「内容损坏」，误判会覆盖完好大索引）；
  3. **超时**——`opts.timeoutMs` 到点 `child.kill()`，错误形态与 `runShellMeta` 现失败路径一致（抛出可被上层 `recordError` 分类）；
  4. **失败清扫**——非零退出仍走 `cleanupAfterGitFailure(command)`，`RECALL_CLEANUP` 哨兵防递归语义不变。
- stderr 收集进错误消息（截 1500 字符，对齐现行为）。
- **spawn 工厂依赖注入**（默认 `child_process.spawn`），单测以假 child 覆盖 stdin 字节路径与超时 kill 分支。

### S3 纯函数纯化与单测

探针判定（输出 → 方言枚举）与截断收集器（chunk 流 → `{text, truncated}`）做成模块级导出纯函数（对齐 `selectPosixHomeBase` / `parseCleanupResult` 先例）。CI 仅 ubuntu-latest、**无 win32 环境**——判定/收集器纯函数与注入 spawn 工厂的假 child 单测均平台无关，Linux CI 即可覆盖全部分支；真实 win32 路径由本机冒烟兜底（验收 2/3）。新增 `tests/unit/store-shell-dialect.test.js`：哨兵命中/未命中/空输出、截断阈值边界、stdin 字节透传与超时 kill（经假 child）。

### S4 探针条目与台账

- `tests/probe` 加方言探测条目（钉「官方 ShellExecutor 无方言字段、行为探测判据成立」，dsh 升级后 `check:upgrade` 自动复验）；
- [compat-audit.md](../../compat-audit.md) 台账新增一行不变量：win32 下 `ctx.shell` 方言不受插件控制，pwsh 模板 ⇄ pwsh 执行器之间无契约保证（出处：issue #15 + dsh-shell index.d.ts 公开面）；
- CHANGELOG.md 记 fix（行为变更：bash 方言宿主从「功能全死」变「直连可用」）。

## 改动落点

| 文件 | 改动 |
|---|---|
| `src/host/store.ts` | 探针 + `runShellMeta` 分流 + spawn 通道 + 两个纯化函数（约 +100 行；有效行 350 → ~450，不触发 700 拆分线） |
| `src/types/state.ts` | `SharedState` 加探针缓存字段（方言枚举 + in-flight promise） |
| `tests/unit/store-shell-dialect.test.js` | 新建：判定与收集器单测 |
| `tests/probe/` | 方言探测条目 |
| `docs/compat-audit.md`、`CHANGELOG.md`、`README.md`(+en) | 台账与行为说明 |

## 验收标准

1. `npm run typecheck && npm run build && npm test` 全绿；`npm run verify:host` 绿（装配面未动，防回归）。
2. **默认路径零回归**：本机（ctx.shell=pwsh 系）冒烟——发消息出快照 → 改文件 → 撤回，全链正常；探针结果应为 pwsh 方言且**从未触达 spawn 通道**（日志断点确认）。
3. **故障路径实弹**：本机临时把 profile 切成仅 `bash-sandbox`——init 返回 `{ok:true}`、快照成功、撤回可用；失败清扫语义验证（人为 kill 制造 stale 锁后快照自愈）。
4. POSIX 平台（CI/WSL）行为不变（探针不运行）。

## 风险与回退

- **探针误判**（bash 恰好能跑 `Write-Output`？——不能，command-not-found 即 127；pwsh 侧输出被 profile 污染？——探测命令自带 `-NonInteractive` 语义由官方执行器保证，且哨兵匹配失败只会退到「按 bash 处理」→ 直连通道本身也能跑 pwsh 模板，双通道对 pwsh 模板都兼容，误判代价低）。
- **直连通道与官方托管环境差异**：无 `dshEnv` 注入、PATH 不含 harness 托管目录——插件模板全部用绝对路径与固定命令，不依赖托管 env（`resolveGitScript` 自带标准安装路径探测，I24 教训已覆盖 home 三档回退）。
- **进程树终止差异**：官方 subprocess 服务在 composition teardown 时杀进程树；直连 spawn 的子进程在宿主崩溃时不自清，可能留下孤儿 git 与陈旧锁——M3 心跳/陈旧锁分级清扫在下次启动自愈（issue #11 机制复用），影响可接受。
- 回退 = git revert 单提交（本计划全部改动独立成一次提交）。

## 实施记录

（实施后回填：与计划的差异、实弹结果、探针运行证据。）

**2026-09-16 实施（2.3.22，一次 `fix:` 提交）**

- **S1/S2/S3/S4 全部落地**，落点与「改动落点」表一致：`src/host/store.ts`（探针 + 分流 + 直连通道 + 四个模块级纯函数，有效行 350 → 510，未触 700 拆分线）、`src/types/state.ts`（`ShellDialect` + `shellDialect`/`shellDialectProbe` 两字段）、`tests/unit/store-shell-dialect.test.js`（新建 31 例）、`tests/probe/api-surface.test.js`（+3 例，32 → 37）、`docs/compat-audit.md`（I36）、`CHANGELOG.md`（2.3.22 节）、README 双语、`package.json` version 2.3.22。
- **与计划的一处差异（新增门控）**：`runShellMeta` 的探针入口按命令分流——带 `RECALL_CLEANUP` 哨兵的失败清扫脚本**不触发探针**、只读方言缓存（未判定时按 pwsh 走官方通道）。理由：清扫只在一条真实命令失败后被调用，而那条命令必然已跑过首调探针、方言早已判定，善后路径不需要也不该再叠一条探测进程。该门控在桩执行器（只有 `resolve`/`run`、无哨兵回显）场景下也让命令留在官方通道，既有 `tests/unit/diagnostics.test.js`/`cleanup-legacy.test.js` 语义不变（既有测试文件一字未改）。
- **判定口径细化**：计划只写了「exit 0 且含哨兵 → pwsh；非零/reject → bash」，实现把「exit 0 但输出无哨兵」「空输出」也归 bash（拿不到 pwsh 证据不认 pwsh）；直连可执行文件取 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`（`SystemRoot` 缺失回退 `windir`/`C:\Windows`），spawn 额外带 `windowsHide`（桌面端宿主是 GUI 进程，不设会闪控制台窗口）。
- **验收结果（本机 Windows 10 + dsh 0.1.6-alpha.1，link 模式）**：
  1. 自动化：`typecheck` 零错误、`test` 28 文件 361 例（基线 27/330）、`verify:host` 装配断言通过、`test:probe` 37 例（基线 34）、`build` 两次产物 SHA256 一致。
  2. **默认路径零回归**：探针日志 `recall shell dialect probe: pwsh`；设置页快照管理出快照（22 条 / 2.3.13 7 会话 14 快照）；`smoke-marker.txt` 追加 marker 后撤回，文件逐字节回到 `baseline`、对话 2 轮 → 1 轮、输入框回填被撤回文本。
  3. **故障路径实弹**：profile 改写为「禁用 pwsh-sandbox + 启用 bash-sandbox（timeoutMs 60000）」重启后，探针日志 `recall shell dialect probe: bash（ctx.shell 非 pwsh，改用直连 powershell.exe 通道）`；快照成功落盘（`index.json` 新增一条 + `snap-0865ec80-…` tag 出现，bash 方言下 pwsh 模板必失败，成功即证明走直连）；撤回同样成功（marker 消失、对话回退、输入框回填），全链无错误日志。收尾已把 `cordis.patch.yml` 还原为 `[]` 并停掉本次 dsh web。
  4. POSIX 行为不变：探针由 `isWin` 门控，单测有「POSIX 不探测、不进直连」断言（CI ubuntu 覆盖）。
- **未实弹子项**：验收 3 里的「人为 kill 制造 stale 锁后快照自愈」未在本轮执行（任务书步骤 3 只要求重复步骤 2 全链）；该子项复用 M3 既有机制（I25），本轮改动未触其代码路径。
