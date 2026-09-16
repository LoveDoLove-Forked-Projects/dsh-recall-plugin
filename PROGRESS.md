# PROGRESS — win32 shell 方言冲突修复（issue #15）

任务来源：docs/plans/pending/plan-shell-dialect-win32.md（唯一规格）。

## 任务 0：基线与理解

基线核对（2026-09-16 本机 Windows）：
- `npm run typecheck` → 零错误 ✅
- `npm test` → 27 文件 330 例全绿 ✅
- `npm run verify:host` → 「装配断言全部通过（inject=shell,sessions,agents，端点 12 项）」✅
- `npm run test:probe` → 2 文件 34 例全绿 ✅
- `npm run build && git diff --stat lib/` → 无 diff（产物新鲜）✅
全部对上基线，可以动工。

理解的目标 / 顺序 / 最大风险（≤10 行）：
1. 目标：win32 下 `ctx.shell` 被配成 bash 时，pwsh 模板不再被 bash 执行——探针判方言，bash 则直连 powershell.exe。
2. 顺序：S1 探针（缓存+in-flight 去重）→ S2 spawn 直连通道 → S3 纯函数单测 → S4 探针条目/台账/文档/版本 → 任务 5 活体冒烟。
3. 最大风险：默认路径回归（探针误判 pwsh 为 bash 会切走官方托管通道）——故误判退路是「直连通道同样能跑 pwsh 模板」，且默认 pwsh 宿主必须零触达 spawn 通道（冒烟用日志断点确认）。
4. 次要风险：spawn 通道语义遗漏（stdin 字节透传 / stdout 截断标记 / 超时 kill / 失败清扫）——逐项在 S2 实现、S3 单测覆盖。
5. 风险：`lib/` 产物过期 → 改 src/ 一律先 build 再 test。

## 任务 1/2/3/4/5 记录

- [x] 任务 1 方言探针（S1）
  - `src/types/state.ts`：`ShellDialect` 类型 + `SharedState.shellDialect` / `shellDialectProbe` 两字段。
  - `src/host/store.ts`：`SHELL_PROBE_COMMAND`（`Write-Output RCL_DIALECT_PROBE_9f4a2e`，内联、不进 scripts.pwsh.ts）+ 模块级纯函数 `judgeShellDialect`；工厂内 `resolveShellDialect()` 惰性 + 缓存 + in-flight promise 去重，探测直调 `ctx.shell`（不带 UTF8_PRELUDE、30s 超时、不触发 cleanupAfterGitFailure）。POSIX 不探测（`isWin` 门控）。
  - 判定口径：exit 0 且含哨兵 → pwsh；其余（非零 / 无哨兵 / 空输出 / reject 折成 null）→ bash。
- [x] 任务 2 spawn 直连通道（S2）
  - `runViaSpawn`（模块级，spawn 依赖注入）+ `scrubChildEnv` + `collectStdout` + `directPwshPath`；argv `-NoProfile -NonInteractive -Command <单元素>`，env 剥凭证形状名与全部 DSH_*（不区分大小写）后叠 NO_COLOR/PAGER/GIT_PAGER，cwd = `sandboxPolicy.workspaceRoot || process.cwd()`，windowsHide。
  - 四项语义齐：stdin 字节透传（`stdin.end(Buffer.from(body,'utf8'))`）、stdout 截断标记（保留尾部）、超时 `child.kill()`、非零退出仍走 `cleanupAfterGitFailure`；stderr 截 1500 字符进错误消息。失败收口抽到 `throwShellFailure`，两通道共用（官方通道行为逐字不变）。
- [x] 任务 3 单测（S3）
  - 新建 `tests/unit/store-shell-dialect.test.js`（31 例）：判定/收集/清洗/路径四个纯函数 + `runViaSpawn` 假 child（argv/cwd/env、stdin 字节、截断、超时 kill、超时前退出不误杀、spawn error reject）+ `createRuntime` 分流接线（pwsh 零触达 spawn、bash 走直连且官方只跑探针一次、in-flight 去重、POSIX 不探测、清扫脚本不探测、直连失败仍清扫）。
  - `npm test`：28 文件 361 例全绿（基线 27/330），skipped 0。
  - 反向验证：把 `judgeShellDialect` 临时改成恒返 `'pwsh'` → 新文件 6 例红（见对话贴出的红输出），还原后全绿。

- **实施差异（比计划多的一处，为什么）**：`runShellMeta` 的探针入口按命令分流——带 `RECALL_CLEANUP` 哨兵的失败清扫脚本**不触发探针**、只读缓存（未判定时按 pwsh 走官方通道）。理由：清扫只在一条真实命令失败后被调用，那条命令必然已跑过首调探针、方言早判定完；善后路径已够脆弱，再叠一条探测进程只会更重。此门控同时让既有 `tests/unit/diagnostics.test.js`（假 shell 只实现 resolve/run，探测会把它判成 bash 并推去直连）语义不变——既有测试文件按任务界限一字未改。

- [x] 任务 4 探针/台账/文档/提交前检查（S4）
  - `tests/probe/api-surface.test.js` 新增「win32 shell 方言（I36）」3 例（ShellExecutor 公开面无方言字段；直连复刻的 PS 5.1 候选路径 + argv 旗标 + env overrides；env 清洗口径）→ `npm run test:probe` 2 文件 37 例全绿（基线 34）。
  - `docs/compat-audit.md` 新增 I36 条目（依赖的官方行为 / 症状 / 插件对策 / 出处 / 探针单测 / 失效症状 / 复查动作，七项齐全）。
  - `CHANGELOG.md` 新增 `## [2.3.22] - 2026-09-16` 修复节；`package.json` version 2.3.21 → 2.3.22；README 双语「工作原理」各补一条行为说明（bash 方言宿主从功能全死变直连可用，2.3.22+）。
  - 验收：`npm run typecheck` 零错误；`npm test` 28 文件 361 例全绿；`npm run verify:host` 装配断言全部通过；`npm run test:probe` 37 例全绿；`npm run build` 连跑两次 `lib/store.js` SHA256 一致（确定性），`git diff --stat lib/` 仅 `lib/store.js`（src 对应产物）。提交前 `git diff --exit-code lib/` 需提交后才为 0（当前 lib/ 相对 HEAD 的差异正是本次 src 改动，属预期）。
  - 备注：`verify:host` 的 shell 是桩（回灌固定输出、无哨兵），日志会打 `recall shell dialect probe: bash`，装配断言仍全通过——探针在桩环境下的既有语义（见「实施差异」）。

- [x] 任务 5 活体冒烟（自动化全绿后执行）
  - 前置：`cordis.patch.yml` 原内容为注释 4 行 + `[]`（217 字节），已备份到上下文（未在 profile 落任何备份文件）；profile 为 link 模式（`dsh-recall-plugin` → `D:/workspace/dsh-plugin/dsh-recall-plugin`）；工作区用会话默认的 `D:\workspace\dsh-plugin\2.3.13`（空目录，无其他内容受影响）。
  - 步骤 2 默认路径零回归：
    - [x] 启动 `dsh web`（cwd=临时目录）；启动日志即出现 `recall shell dialect probe: pwsh`（探针判 pwsh、未走 bash 分支 → 直连通道零触达；分流条件为 `=== 'bash'`，单元测试另有「pwsh 方言 spawn 零调用」断言）。
    - [x] 浏览器发消息 → 设置页「插件配置 → 撤回插件 → 快照管理」显示「共 22 条快照，全部工作区快照存储占用 63 KB」「git 可用 · 快照存储：home 2 个工作区」「2.3.13 7 会话 / 14 快照」树形，含「冒烟测试回复确认 2 条」。
    - [x] shell 追加 marker：`smoke-marker.txt` 由 `baseline` → `baselineMARKER_ADDED_BY_SMOKE`。
    - [x] 浏览器点撤回 → 确认面板 DOM 文本：`共 1 个文件将变更（修改 1）… 修改 smoke-marker.txt` → 点「确认回退」。
    - [x] 撤回后文件断言：`Get-Content smoke-marker.txt` = `baseline`（字节 98,97,115,101,108,105,110,101，marker 消失）；对话回退：标题回到「冒烟测试：请回复一句话即可」、轮次 `2 轮 2 步` → `1 轮 1 步`、输入框自动回填 `content="第二次冒烟：请只回复 ok"`。
  - 步骤 3 故障路径实弹（profile 只启用 bash-sandbox）：
    - [x] `cordis.patch.yml` 改写为禁用 `pwsh-sandbox` + 启用 `bash-sandbox`（timeoutMs 60000，按任务书原文，name 重述），重启 `dsh web`。
    - [x] 启动日志：`recall shell dialect probe: bash（ctx.shell 非 pwsh，改用直连 powershell.exe 通道）` → 探针判 bash、切直连。
    - [x] 发消息 → 快照落盘断言：`index.json` 新增 `0865ec80-8ae1-4a5d-ac2a-80ee506f8cd4`（session-b6e9df40…），`git tag -l` 出现 `snap-0865ec80-…`（bash 方言下 pwsh 模板必失败，成功即证明走了直连通道）；heartbeat 为本次 dsh web PID 28772。
    - [x] 追加 marker `BASH_DIALECT_MARKER` → 撤回 → 确认面板同样显示「修改 smoke-marker.txt」→ 确认后文件回到 `baseline`（字节同上）、轮次回到 `1 轮 1 步`、输入框回填 `content="bash 方言冒烟：请只回复 ok"`；tag 总数 22 → 25。
  - 步骤 4 收尾：
    - [x] `cordis.patch.yml` 还原为原文（注释 4 行 + `[]`，字节数 217，与原文件一致，见对话中 `Get-Content` 输出）。
    - [x] 停掉本次启动的 `dsh web`（port 3080 无监听）；删除冒烟痕迹（`2.3.13\smoke-marker.txt`、临时目录 `D:\workspace\dsh-plugin\recall-smoke`）。
  - 未覆盖项（如实记录）：计划验收 3 的子项「人为 kill 制造 stale 锁后快照自愈」未实弹（任务书步骤 3 只要求重复步骤 2 全链）；`user_profile` 里提到的 macOS 侧同理不在本机能力内。