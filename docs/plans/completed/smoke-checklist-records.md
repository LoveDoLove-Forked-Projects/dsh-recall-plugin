# 冒烟测试执行记录

> 配套文档：[smoke-checklist.md](./smoke-checklist.md)（测试项清单；逐项 ✅/△ 结果注在对应条目上）｜ 本文件只登记**会话级执行记录**：日期、环境、结果、发现与发版判定。
> 约定：每次执行后追加一节（日期 + 范围）；出现失败的记 issue 并回链；清单全部通过后与 checklist 一起移入 `completed/`。
> 状态总览：第一〜八节均已执行通过（一〜七节 2026-08-29：Windows 侧 + WSL 侧 + 修复实施 + v2.1.1 本机验证 + PF 性能批次实弹；第八节 2026-09-18：仅撤回对话模式 5/5）；第九节（rewind 加固批次 A2/A3/A4）2026-09-30 实弹通过；第十节（事件接缝 M5）2026-10-03 通过；第十一节（dsh 0.2.1-alpha.3 图片渲染换代 + 文本投影）2026-10-15 通过。

## 2026-08-29 Windows 侧（第一〜四节）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2（与 reference 镜像一致，`check:dsh` 全绿）｜ dsh-recall-plugin link 模式（工作区 2.0.0 未提交改动，含 M1/M2/M3）｜ dsh web 127.0.0.1:3080
- **结果**：22 项通过（19 完整通过 + 2 部分通过[三.1/三.3 无法构造场景] + H2 双重实弹）；测试产物留有两个测试工作区（`D:\workspace\dsh-plugin\冒烟测试工作区`、`smoke space 测试 工作区`）与 store 容器，供复验，可随时清理
- **执行方式**：浏览器实弹（IAB 自动化）+ API 直调 + Host 侧 git/tag/文件核对；三次重启 dsh-web（无 git PATH 试验 / 恢复 + 冷启动 / H2 演练）

**发现（按严重度）**：

1. **[缺陷·中] PS 5.1 降级环境读编码不安全**：dsh-pwsh-local 的可执行解析链为「`Program Files\PowerShell\7\pwsh.exe` → PATH 各项 → **PS 5.1 兜底**」。当 pwsh 7 不在 PATH（如 Store 版安装 + 精简 PATH 启动）时降级 PS 5.1，其 `Get-Content -Raw` 对 UTF-8 **无 BOM** 的 index.json 按 ANSI(GBK) 解码 → 中文 root 乱码 → JSON.parse 失败 → 走 H2 隔离分支 → **误判 corrupt**（tag 数据无损，索引明细 time 丢失、重建为 0）。本次意外真实触发并完整复现因果。修复建议（小改）：`indexReadCmd`/`lineageReadCmd` 显式 `-Encoding utf8`，或 UTF8_PRELUDE 统一 `$PSDefaultParameterValues['Get-Content:Encoding']='utf8'`。附带观察：PS 5.1 写侧文件带 BOM（读侧 `stripBom` 已兼容，无害）；曾偶发一次的「saveIndex Move-Item: index.json.tmp does not exist」与降级环境同窗出现，疑同根，修复后观察。
2. **[改进·低] rebuildOrphans 重建条目 time=0**：索引丢失重建后快照时间信息丢失（快照管理叶子时间前缀缺失、预览目标时间不可用）。tag 指向的 commit 自带时间戳，可从 commit 读回恢复。
3. **[观察] recordError 相邻去重的交错局限**：错误 A 与 B 交替出现（如 lock 失败与「新锁让路」记录成对交替）时，A 的重复不合并计数。设计权衡是只合并相邻防跨类挤占，保持现状可接受；如需改进可按「同 kind+归一化消息」聚合。
4. **[观察] CLEANUP_OTHER_INSTANCE 分支难命中**：心跳是单值文件且 snapshotScript 开头自写（自己 PID），快照失败清扫读到「最后写者=自己」→ 实际保护由 FRESH_LOCK（5 分钟新锁让路）承担——保护效果等价（不清扫对方的锁），但「另一个 DSH 实例（PID n）」文案在快照路径几乎不可达。若想让该分支可观测，可考虑心跳按「实例实例表」或多值化（成本收益待评估，不阻塞发版）。
5. **[UI 可选] 管理列表删除后不即时刷新**：「已删除」toast 后需手动点「刷新」。可用性可接受。

**发版判定**：Windows 侧一〜四节通过，**阻塞项仅剩第五节 WSL**（POSIX 分支实弹）。缺陷 1 建议随环境诊断批次修复后一起发（属同批次质量范围，改动极小）。

## 2026-08-29 WSL 侧（第五节，同日续）

- **环境**：WSL2 Ubuntu 26.04（GNU coreutils + bash 5）｜ node v22.22.1 / pnpm 11.23.0 / git 2.53.0 ｜ dsh 0.1.1-rc.2（用户级安装 `~/.npm-global`，与 Windows 侧及 reference 镜像一致）｜ 插件以**工作区复制**方式放 WSL ext4 `~/src/dsh-recall-plugin`（tar 复制，排除 node_modules/.git——9p 排除项见清单前置准备），profile link 模式 + 自备 `@deepseek-ai/{schemastery,dsh-settings}` symlink（I11）｜ dsh web 127.0.0.1:3090（双实例测试临时加 3091）｜ 测试工作区 `~/ws/smoke-中文路径`
- **结果**：9 项通过（7 完整 + 2 带说明[双实例 OTHER_INSTANCE 直弹替代 UI 命中路径；M1 ×N 交错局限复现]）+ 四级清扫出口直弹实弹全 PASS；执行方式：浏览器实弹（IAB 自动化）+ API 直调 + WSL 侧 node 直弹 POSIX 模板（`killOrphansScript` 生成 bash 后以真实 bash 执行断言四级出口）+ 三次重启 dsh-web（MIGRATE_OK / BOTH_PRESENT / 双实例）
- **前置搭建备忘**（复验用）：WSL 内 sudo 需密码 → npm 用户级 prefix（`~/.npm-global`，bash -lc 读 `~/.profile` 的 PATH）；凭证从 Windows `~/.dsh/.credentials.yaml` 复制（两侧 `~/.dsh` 互不相通）；headless 会话（`dsh --profile headless`）在目标 cwd 跑一次即可把工作区注册进 web 工作区树

**发现（按严重度）**：

1. **[缺陷·中] 双实例并发 saveIndex 的 tmp-rename 竞态（POSIX 实锤，Windows 同根）**：A/B 双实例启动预热并发 saveIndex → `recall saveIndex failed: mv: cannot stat '…/index.json.tmp': No such file or directory`——一方 rename 把 tmp 消费掉，另一方 rename 落空报错。Windows 侧执行记录「曾偶发一次 Move-Item: index.json.tmp does not exist」即同根，本轮复现实锤。影响有限（内存索引仍在、下次写索引自然自愈），但双实例常态下会反复刷错误。修复方向（小改）：rename 对 ENOENT 容忍为成功（tmp 已被同伴 rename 走 = 索引已落盘，目标语义已达成）；pwsh 版 `Move-Item` 同理。
2. **[观察] UI 消息路径的 OTHER_INSTANCE 不可达性 POSIX 与 win32 完全一致**：心跳单值文件 + snapshotScript 开头自写宿主 PID → 失败清扫永远读到「自己」→ 实际保护由 FRESH_LOCK 承担（锁未被清、双进程存活、B 侧零错误，效果等价）；`CLEANUP_OTHER_INSTANCE` 分支（bash `kill -0` 探活 + TTL）以直弹模板实弹验证通过。Windows 侧发现 4 的结论在 POSIX 侧原样成立。
3. **[观察] 快照主链路对 config.lock 免疫**：`git add/write-tree/commit-tree/tag` 均不读 config 写锁，config.lock 只影响 ensureGit 的 `git config` 写（重启后首条消息窗口）。环境演练造锁必须用 `index.lock`（add 写索引必撞）——本轮先用 config.lock 撞了个寂寞（快照正常成功），换 index.lock 后才命中。
4. **[观察] ×N 相邻去重交错局限 POSIX 复现**：lock 失败与 FRESH_LOCK 让路记录成对交替，两组 lock 错误 count 各=1 未合并——与 Windows 侧发现 3 同款设计权衡，非新问题。
5. **[观察] ensureGit 冷启动首消息与预热并发的 mkdir 瞬态错误**：首条消息 `git init` 与启动预热并发时输家报 `fatal: cannot mkdir …/git: File exists`（两个 init 竞态），下一消息自动恢复。窗口极小（冷启动首消息才可能撞），自愈无损；如需根治可让 init 对已存在目录的 EEXIST 容忍（`git init` 本身幂等，竞态在 mkdir 检查链）。

**发版判定**：第五节 WSL 全部通过，冒烟清单**无剩余阻塞项**。随批次建议修复两个小改缺陷：缺陷 1（PS 5.1 读编码，已修复待发）+ WSL 发现 1（saveIndex tmp-rename 竞态，未修）；其余均为观察项不阻塞。测试产物（WSL `~/src/dsh-recall-plugin`、`~/ws/smoke-中文路径`、store 容器 `eecc4753…`）保留供复验。

## 2026-08-29 修复实施（同日，测试发现问题的代码修复）

- **修 1（WSL 发现 1，saveIndex tmp-rename 竞态）**：`store.js` 新增模块级 `isTmpConsumedError`（POSIX mv / pwsh Move-Item 的 ENOENT 文案 + 必须 tmp basename），`writeTextViaShell` 的 rename 步经 `renameTmpQuietly` 容忍——**安全性依据**：能走到 rename 前提是写侧已完整成功（POSIX set -e / pwsh EAP=Stop 任一写步失败直接抛），tmp 消失只能是同伴把完整内容 rename 到目标，本侧写语义已达成；不进 recordError（消除刷屏），console.error 留诊断。单测 `store-write.test.js` 6 项（三平台文案/短文案/非 ENOENT/空值边界）。
- **修 2（WSL 发现 5，ensureGit init 竞态）**：`scripts.posix.js` ensureGitScript 的 `[ -d "$g" ] || git init` 改为「HEAD 不在才 init，init 失败复查 HEAD——同伴建成则继续，否则带 stderr exit 1」；检查 HEAD 而非目录（半截目录由 init reinit 补齐）。pwsh 版有意不动：native 非零不抛（I14）下竞态天然容忍、真失败由快照 add 显式检查兜底（模板注释已写明，防未来误「对称」）。WSL 直弹 4 场景 PASS（空 repo/幂等重跑/半截 repo 补齐），重启实例后首条消息端到端快照成功零错误。契约钉入 scripts-contract。
- **修 3（Windows 侧发现 2，rebuildOrphans time=0）**：两平台新增同名 `listTagsWithTimeScript`（`for-each-ref --format='%(refname:short) %(creatordate:unix)'`，lightweight tag 的 creatordate 即 commit 日期），`snapshots.js` 新增 `parseTagsWithTime` 纯函数，重建条目 time 从 tag creatordate 恢复（解析失败回退 0 保留旧行为）。WSL 直弹对真实容器验证 5 tag 全部带正确时间戳。契约钉 + parse 纯测 + rebuild time 恢复工厂级断言入 `snapshots-persist.test.js`。
- **不修（查实或维持现状）**：「删除后不即时刷新」查实机制已在位（client `run()` 成功即 `refresh()` + Host 删除后 `listCache.items = null`）——现象为异步列表重取的感知问题，不改码；OTHER_INSTANCE UI 路径不可达（心跳机制重设计，成本高收益低，两轮判定不阻塞）；×N 交错去重（设计权衡防跨类挤占）；config.lock 免疫（认知记录，非缺陷）。
- **验证**：`npm test` 224 项全绿（新增 12）；修复文件同步 WSL 副本 + 重启 dsh web 回归（status 零错误、管理列表 4 条、安全 tag 不在列表、新消息快照成功）。

## 2026-08-29 v2.1.1 本机验证（第六节，issue #12 换行符字节保真）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2 ｜ dsh-recall-plugin **npm 模式** 2.1.0 → 2.1.1（`pnpm add dsh-recall-plugin@^2.1.1`；注意 `pnpm update` 未在 ^ 范围内自动跟进新版本、下载 0，须显式 add）｜ dsh web 127.0.0.1:3080（v2.1.1 已发布：commit 9f216f5 + npm + GitHub Release）｜ 测试工作区 `D:\workspace\dsh-plugin\issue12-verify`（.gitattributes `* text=auto` + `secret.txt export-ignore`；lf.txt=LF / crlf.txt=CRLF / secret.txt），本机 system gitconfig `core.autocrlf=true` 即复现环境
- **结果**：第六节 3 项必测全过 + POSIX 抽查 △（可选项未跑 WSL；POSIX 模板已在发版前 Git Bash 实弹 final-e2e 14 项通过，同一修复路径）。链路：2.1.0 造存量（消息 1 快照 13dccca3：crlf.txt blob=LF 归一化、无 info/attributes——预修复状态复现）→ 升级 2.1.1 重启 → 消息 2（快照 65e4b016）自动迁移：`info/attributes` 固化、`attrs-v1.stamp` 生成、crlf.txt blob 恢复原始 CRLF → API 直调 preview/execute 两轮回退：① 回退到 65e4b016 三文件逐字节还原（lf.txt=LF、crlf.txt=CRLF、secret.txt 恢复——export-ignore 不再静默漏文件）；② 回退到旧快照 13dccca3：lf.txt 恢复为 LF（**原始症状回归钉**——修复前 archive 会转 CRLF），crlf.txt=LF 属已知限制（旧 blob 已归一化，信息在捕获时已丢失）。全程 `status` 零错误；2 消息快照 + 2 安全快照（snap-pre-rollback-*，H1 救援机制正常）齐全；迁移标记持久。
- **发现（过程性，不影响发版）**：
  1. `TaskStop`/杀 bash 包装停 dsh-web 会留孤儿 node 进程占 3080（EADDRINUSE），须 `netstat -ano` 找 PID 后 `taskkill /F` 再重启。
  2. web UI 输入区/发送按钮的 Playwright click 全部超时（疑似透明覆盖层拦截指针），fill 正常；改用页面内 `evaluate` 对发送按钮触发 `.click()` 成功发送。headless profile 不挂 recall 插件，造消息只能在 web UI（headless 会话仅用于把工作区注册进工作区树）。
  3. AGENTS.md「发布后 npm 模式跑 `pnpm update dsh-recall-plugin` 验证新版」实测不生效（pnpm 元数据缓存或解析策略，`^2.1.0` 范围内不跟进 2.1.1）——验证新版请用 `pnpm add dsh-recall-plugin@^<新版>`。

## 2026-08-29 PF 批次实弹（第七节，同日续）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.1-rc.2 ｜ dsh-recall-plugin **link 模式**（profile 改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + pnpm install，工作区即运行代码，commit 3b1867b + 诊断留痕 2fb4ad3）｜ dsh web 127.0.0.1:3080（本轮重启 3 次：link 生效 / PF-2 重启读回+PF-5 init / corrupt 演练）｜ 测试工作区：冒烟测试工作区（中文路径，30 条消息）、pf3-large-ws（新建，10002 文件 + Everyone-deny 目录）、issue12-verify（复用）
- **执行方式**：API 直调（curl/页面内 fetch）+ 浏览器实弹（UI 撤回、30 条消息连发、设置页快照管理树）+ 影子仓库 git ls-tree/for-each-ref 磁盘对账
- **结果**：9/9 通过（各项结果已注在清单第七节；PF-8 冷读口径环境受限已注明）。**发版判定：冒烟清单无剩余阻塞项，PF 批次可发版（minor 语义：PF-1/PF-6/PF-7 含行为变化与 client 改动）**。

**发现（按严重度）**：

1. **[异常·中，未复现] stale 一次约 29 分钟未自愈**：21:06 家族消息快照落盘后，manage list 连续多次调用持续返回 stale:true + 旧视图（31 条，不含新快照），21:35 自行恢复为 fresh（63 条）。期间 lineage/preview（同队列或同 dumpStores 链路）均秒级正常，dsh-web 日志零输出——`refreshListCacheInBackground` 与 `dumpStores` 的 silent catch 把一切失败/挂起吞掉，无法定位根因（疑方向：某次 dump shell 挂起占住后台刷新 in-flight promise 或串行队列）。**已修复观测性**（2fb4ad3）：两处 catch 补 console 留痕，复发时看「recall list refresh failed」/「recall stores dump failed」。健康路径复验正常（stale 窗口 2-9ms 秒回、~4s 刷新补上、790ms 完成日志）。
2. **[口径备忘] index `time` = 消息事件时间，非快照完成时间**：`captureSnapshot(sessionId, messageId, time)` 的 time 由事件侧传入；完成时间看 tag creatordate（秒级）。因此外部分解口径：click→事件（dsh 管线，实测均值 ≈3.8s）+ 事件→脚本起点（Host 准备 ≈0.6s）+ 脚本→tag（插件段 ≈0.6-1.6s，与合成基线 1.19s 同量级）。
3. **[备忘] manage messages 端点入参形态**：`{op:'messages', requests:[{sessionId,messageId},…]}`（数组，非裸 sessionId），返回 `{messageTexts:{<mid>:text}}`。
4. **[观察] pf3 store 出现 root.txt.tmp 残留**：与 WSL 发现 1（saveIndex tmp-rename 竞态）同族的 tmp 边角——headless 注册与 web 实例并发写同 store 时的输家残件；无害（读侧忽略 tmp），不阻塞。
5. **[备忘] 首条万文件快照 ≈52s**（10k 新 blob 哈希+写对象的固有 git 成本），增量快照 2-3s、preview 3.03s——大工作区首开慢是 git 行为，非插件回归。
6. **[操作备忘] web UI 大量按钮有透明覆盖层拦截 Playwright click**：全程用页面内 evaluate 触发 click（发送/设置/树展开均如此）；headless profile 会话（`dsh --profile headless "…"` 在目标 cwd 跑一次）可注册新工作区进 web 工作区树，弥补「添加工作区」原生文件夹选择框无法自动化。

**测试产物**：冒烟测试工作区（含 PF-9 文件 冒烟排除-pf9.txt）、pf3-large-ws（10k 文件 + store 2 快照）、issue12-verify，供复验，可随时清理；exclude.txt 已恢复为空、pf3 locked-dir ACL deny 已移除。

## 2026-08-30 发版（v2.2.0）与发版后快照清理事件

- **v2.2.0 发布**：提交 3f55da4（版本号+CHANGELOG 定版）+ tag v2.2.0 + npm publish + GitHub Release；发版前四道门禁全绿；发布后本机 npm 模式验证通过（status 零错误、list 正常）。
- **发版后快照清理事件（01:56）**：除「有活跃会话的工作区」外的快照店发生 tag purge + index 清空（sweep 签名：safety tag 保留、消息快照清光）。代码取证：设置页「立即 gc」→ runGcAll → sweepDeletedSessions 无条件执行（runGc 消息路径的 50 拍/24h 门控与 gc.stamp 跨重启加载均正常，runGcAll 无门控），对「不在 live 注册表且不在 listSessions」的会话逐一 purge。**待用户确认**：若测试会话是用户在 UI 里删的，purge 属「会话删除联动清 tag」设计行为（会话日志已从磁盘消失，与该假设吻合）；若用户未删过会话，则为 2.2.0 误清 bug（listSessions 冷态漏报），需 2.2.1 热修（sweep 对候选补 readSession 复核）。
- **恢复**：冒烟测试工作区 33/33、smoke space 1/1 快照从不可达 commit 抢救（commit message 内嵌 messageId），tag 重建 + index 回写（sessionId 置 null，sweep 免疫，树中落「已删除会话」组）+ 全量 bundle 固化于 `~/.dsh/recall-incident-backup-20260830/`（含事件档案 README.md）。pf3 的 2 条测试快照在恢复窗口内被后续 gc 剪除（不可恢复，可弃）；issue12 的 2 条为 PF-6 验证时有意删除，未恢复。
- **教训**：①联动清理的破坏半径 = 「立即 gc」按钮一键触达全部 store 的已删会话快照，且 purge 前无二次确认——UX 层面值得加确认或让 runGcAll 的 sweep 跳过最近 N 分钟仍被索引引用的会话；②影子库 commit message 内嵌 messageId 是最后的数据恢复通道（tag 名丢失后仍可从 `git fsck --unreachable` 完整重建映射），这个设计救了 34 条快照。

## 2026-09-04 设置页 UI 批次冒烟（第八节）

- **环境**：Windows 10 ｜ dsh 0.1.2-rc.1 ｜ dsh-recall-plugin **link 模式**（profile 依赖临时改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + pnpm install --no-frozen-lockfile；冒烟后已还原 npm 模式 `^2.3.1`，切换前备份 `package.json.bak-20260904`）｜ dsh web 127.0.0.1:12789（`--no-open --port 12789` + 一次性 token URL，browser-trust 围栏须带 token）｜ 测试数据：既有工作区「test」7 会话 9 快照（含 v1/v2/v3 版本家族，实数据覆盖树/确认条/操作区路径）
- **执行方式**：浏览器自动化（browser_use 子代理两轮）+ DOM/CSS 计算样式求值 + 注入等价 `@media(max-width:480px)` 样式模拟窄屏（工具无 CDP 视口仿真、`window.resizeTo` 被主窗口拦截）；功能回归走真实改-存-回读链路；浏览器控制台零报错
- **结果**：V1–V9 全部核验通过（含一轮「疑似不通过」经复核澄清为设计差异）；浅色/深色双主题对照通过；剩余 3 项人工复核（真实窄视口终验 / 真实键盘 Enter/Space / 读屏播报）

**逐项结论**：

1. **V1 语义色 — 通过**：改为 config-form 保存按钮普通样式、badge-modified 为 warn tert 底 + 浅/深主题色值随令牌正确翻转。
2. **V2 键盘结构 — 通过（真实键触发待人工）**：树折叠钮为原生 `<button class="dsh-recall-tree-toggle">` + `aria-expanded`/`aria-label`；Tab 可聚焦（activeElement 命中）、点击可折叠展开；`:focus-visible` 焦点环规则已注入。自动化合成的 Enter/Space 无 isTrusted 无法触发原生激活，真实键盘需人工复核一次。
3. **V3 禁用态 — 通过（澄清）**：排除配置未修改保存按钮 `disabled=true` + `opacity:.5` + hover 无色变（css 规则级证据）；配置表单保存按钮未修改可点、点击提示「没有修改」——**既定设计差异**（ConfigForm 未用 dirty 禁用，与 ExcludeCard 不一致，V3 计划未要求改），代理一度误判「不通过」，复核确认非缺陷。
4. **V4 Grid — 通过**：`.dsh-recall-cfg-row` computed `display:grid`、双列 52px/462px，label/控件分列对齐，卡片与页面均无横向溢出。
5. **V5 顺序 — 通过**：操作区按钮实测 刷新 → 立即 gc → 全部删除（danger 末位、在立即 gc 之后）。
6. **V6 健康/错误 — 通过**：`dsh-recall-health-pill-ok`「git 可用」绿色实测 rgb(34,197,94)；「最近错误」区当前无错误不渲染（有则显示，规则与逻辑均在）。
7. **V7 排版 — 通过**：无溢出、树行 ellipsis 正常，字级微调在双主题视觉对照内无回归。
8. **V8 窄屏 — 通过（模拟等价，真实视口待人工）**：注入等价 480px 样式后表单单列（522px）、快速添加输入 `flex:1 1 100%` 独占一行、无横向溢出；运行时改真实视口受工具限制。
9. **V9 确认条 — 通过**：点叶子「删除」原位出确认条，确认=`dsh-recall-ex-chip-danger`、取消=普通 chip；点取消关闭且未误删（计数归 0）。

**发现（按严重度）**：

1. **[方法·本机不可行] 「断 git（PATH 移除）」实弹无法模拟**：活体验证两次尝试均失败，根因三层——① `resolveGitScript` **按设计不依赖 PATH**（[store.ts](../../../src/host/store.ts) L304 注释明言「脚本里用绝对路径调用，避免每条命令依赖 PATH」），硬编码探测 `%ProgramFiles%\Git\cmd\git.exe` / `%(x86)%` / `%LocalAppData%\Programs\Git\cmd\git.exe`；② Windows 的 `ProgramFiles` 等 well-known 变量是 **per-process 伪变量，子进程不可继承篡改值**（幂等复验：`$env:ProgramFiles` 赋值后 node / Start-Process powershell 均还原为实际安装路径 `C:\Program Files`）；③ 真断 git 只剩文件系统级改名 `C:\Program Files\Git`，会全局破坏本机 git 消费者（含复验要用到的 git 本身），风险不承接。**处置**：失败态 pill（`health.gitAvailable=false` → `.dsh-recall-health-pill-bad`）为 ok 分支的同渲染路径镜像（条件 `gitAvailable ? pill-ok : pill-bad` 已在实弹中走通 ok 分支 + 计算样式绿），改**代码级镜像核验 + 标注待隔离环境**（CI 容器不装 git 跑 dsh web 断言 pill-bad）终验；该模拟方法本身的局限写入计划 V6 实施记录供日后参考。
2. **[观察·不阻塞] 浏览器自动化能力边界**：无 CDP 设备仿真/真实视口调整，合成键盘事件无 isTrusted——窄屏 400px 终验、Enter/Space 真实键触发、读屏（Narrator/NVDA）播报均留人工复核（环境受限，非产品缺陷）。
3. **[观察（设计差异，非缺陷）] ConfigForm 保存按钮未做 dirty 禁用**：与 ExcludeCard 的模式不一致（其 dirty 判定 → disabled）；计划 V3-1 只要求 disabled 态 css 可识别。如未来统一，可给 ConfigForm 补 dirty 判定（复用 ExcludeCard 现成模式），超本期范围。
4. **[过程备忘] 浏览器自动化工具无法直接点击被透明覆盖层拦截的按钮**与上轮（第八节外）一致：全程用页面内 evaluate 触发 click；dsh settings 页「通用」外观切浅色/深色可用（本轮浅色对照已还原深色）。
5. **[过程备忘] dsh web 的 browser-trust 围栏**：`dsh web --no-open` 需带一次性令牌 URL（启动日志打印）访问，裸地址 401；profile 依赖在 npm↔link 切换须用 `pnpm add dsh-recall-plugin@<spec>` 强制（`pnpm install` 对 lockfile 差异可能「Already up to date」不重链，junction 残留，本次实测）。

**发版判定**：设置页 UI 批次（V1–V9）冒烟基本通过（自动化全覆盖 + 双主题 + 功能回归零报错）；剩余复核项不阻塞代码质量、随发版前补齐——真实窄视口终验、真实键盘 Enter/Space、读屏播报 3 项人工复核 + 「断 git 失败态」隔离环境终验（本机方法不可行，见发现 1，代码级镜像核验已过）。计划文档保持「已实施（待冒烟）」留 pending/，上述复核完成后移入 completed/（按 docs 生命周期第 2 条同步三处链接）。

## 2026-09-04 冒烟补充：断 git（PATH 移除）模拟方法可行性探究（第八节附）

- **目的**：补 V6 验收「断 git（PATH 移除）实弹验证一次」（计划冒烟路径第 4 项遗留）。
- **过程与根因**（详见上节发现 1）：两次尝试（纯 PATH 移除；PATH 移除 + `ProgramFiles` 环境变量改指向不存在目录）均 `gitAvailable:true`。复刻 `resolveGitScript` 逻辑在等价 env 下解析为空，而真实服务器进程却解析出 `C:\Program Files\Git\cmd\git.exe`——定位到 Windows 对该类 well-known 变量（ProgramFiles 系）在子进程创建时强制重算，环境变量层面无法欺骗；结合模板对标准安装路径的硬编码探测，「PATH 移除」模拟对插件失效（这本身是插件的健壮性红利：DSH 进程 PATH 不含 git 也能用）。
- **结论**：本机安全边界内无法构造「git 不可用」；失败态验证改代码级镜像（渲染路径同一、条件取反）+ 建议隔离环境（如 CI 容器不装 git）终验。此项由「待冒烟」变为「待隔离环境」，不构成本批次代码缺陷。

## 2026-09-18 dsh 0.1.6-alpha.2 升级实弹（slot 迁移 + 会话导航）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.6-alpha.2（`npm install -g @deepseek-ai/dsh@alpha`，探针 37/37 + verify:host 通过）｜ dsh-recall-plugin **link 模式**（工作区 2.3.22 + 本批次两处改动，`npm run build` 后重启生效）｜ dsh web 127.0.0.1:3080（重启 2 次：升级后首启 / 导航修复后复验）｜ 测试工作区 `D:\tmp\recall-h0`（影子库基线 29 条快照 / 24 tag / 14 索引条目，含旧批次遗留会话）
- **执行方式**：浏览器实弹（Exec 内 snapshot+click 同批，避免跨批 ref 失效）+ Host 侧 git tag / index.json / lineage.json 磁盘对账 + API 层 config-set/config-reset 复验
- **结果**：迁移面三项全过；实弹中发现并修复一处升级引入的功能死点（fork 后子会话不打开）；另得一处待修退化（「切换」闸门失效）与两项观察。

**逐项结论**：

1. **① 插件管理页 bundle 配置卡（slot 迁移）— 通过**：`settings.plugin.item` 在 alpha.2 已随旧设置页插件 tab 移除，卡片经 `plugins.bundle.config`（key=`dsh-recall-plugin`）渲染——插件页是「插件列表 → recall-plugin → 展开: 撤回插件 → 卡片」，实测渲染快照行为 3 开关 + 自动治理 5 数值项 + 「高级：基础排除表 / 排除配置 / 快照管理」三个折叠区，无缺项；配置链路 `config-set`（快照保留天数 = 7）落库后再 `config-reset` 恢复默认（`overridden={}`）回读一致。
2. **② 撤回主链路（发消息 → 快照 → 撤回 → fork）— 通过（修复后）**：同会话发两条消息（各自出快照 `snap-f6c509ea` / `snap-eff197f6`）→ 撤回第二条 → 确认面板文案与预览清单正确 → execute 落安全快照 `snap-pre-rollback-1789671222994` 并写 lineage `childId=session-2c69a697… parentId=session-3f4f5afb…` → **子会话自动打开**（对话回退到消息 1、仅存 1 轮）、标题继承无递增、被撤回消息文本回填输入框、输入框上方无残留排队消息。
3. **③ 快照管理 — 通过**：两层树展开/折叠（工作区 `recall-h0` 8 会话 → 会话叶子）；叶子行渲染 `时:分 消息文本` 与单条删除钮；四级删除确认文案各自正确（快照级「确认删除该快照？此操作不可恢复。」/ 会话级「…该会话全部快照」/ 工作区级「…该工作区全部快照」/ 全部删除「…所有工作区的全部快照」）；**实删两级并 Host 对账**——单条：29→28 条、tag 24→23、index 14→13；会话级：28→26 条（状态「已删除 2 条快照」）、tag 23→21、index 13→11；「立即 gc」状态自「执行中…」转「gc 完成」（占用 94 KB 不变，数据量小）；「最近错误」区无错误不渲染（V6 既定规则）。
4. **文件恢复强验证（撤回消息 1）— 通过**：其快照早于 `marker-fork.txt` 创建，预览显示「共 1 个文件将变更（删除 1）」+「该消息是本会话中第一条用户消息，无法回退对话；确认后仅回退项目文件」；确认后文件确实从磁盘消失、落安全快照 `snap-pre-rollback-1789671312205`、不产生 lineage（首条消息仅回退文件）。

**修复（实弹中发现并落地）**：

- **fork 后子会话不打开（功能死点）**：alpha.2 移除 `ISessions.open`（契约注释「navigation belongs to view owners」），原调用的 `typeof` 守卫静默跳过 → 撤回完成后页面停在「选择一个工作区开始」空态；导航入口迁至独立 `uiWorkspace` 服务的 `openSession(target: SessionTarget)`（`SessionTarget = SessionId | SubagentAddress`，官方 UI 同样以裸 sessionId 调用）。修法＝`inject` 声明 `uiWorkspace` + `ctx.uiWorkspace` 类型化 + 导航双版本分支（`openSession` 优先、旧版回退 `sessions.open`）。复验：见本批次 ②。

**发现（按严重度）**：

1. **[缺陷·中，已修] 「切换」闸门在 alpha.2 失效**：`switchable` 判据是 `sessions.list.byId` 命中（代码注释写明「已归档会话不在 list（无法 open）」），而 alpha.2 的该快照**包含归档会话**——对被撤回后归档的原会话仍渲染「切换」，点击后官方导航先设置选择、随即按「归档选择不保留」清空，页面落「选择一个工作区开始」空态（本次两次实锤：一次为旧批次归档会话 `替换 hello.txt 文件内容`、一次为刚被撤回归档的原会话 `session-3f4f5afb`）。**修法**：判据叠加 `ctx.workspaces.list.getSnapshot().archivedSessionIds` 排除（`WorkspaceSnapshot.archivedSessionIds` 契约在位，`ClientWorkspacesService` 补 `list` 面、服务经 `buildSettingsCards` 传入快照管理卡）。**复验**：重启后同一棵树下，`创建 marker-fork.txt 测试文件` / `替换 hello.txt 文件内容` 等归档会话行已无「切换」；保留「切换」的活跃行（`确认回复好的`）点击后正常打开该会话（标题切换、对话渲染、非空态）。`npm run typecheck` + `npm run build` + `npm test` 361/361 全绿。
2. **[观察·中] 快照捕获窗口内的模型改动**：用户消息触发的快照从事件到落盘约 3 秒；本次第二条消息的模型 3 秒内完成追加，快照落到的是改后状态（`snap-eff197f6` 树内已含 `second-message-line`）→ 预览「共 0 个文件将变更」、文件回退成为 no-op（对话回退照常）。异步快照固有的 TOCTOU，非本升级引入；影响面是「极快任务撤回后文件不动」，对话侧语义不受损。
3. **[观察·低] G1 队列清理降级告警**：console 出现 `[dsh-recall-plugin] 残留排队消息未能自动清理（会话面未就绪）：[…]`，但 UI 无残留排队项（0.1.6 线 fork 切点已由官方修好，本就无入队事件带入 seed），告警属 best-effort 路径噪音。
4. **[过程备忘] 浏览器自动化点击的 ref 时效**：`snapshot` 与 `click` 必须同一批次（跨批次取到的 `[ref=eN]` 必失效，表现为点击后无任何事发生）；面板插入使行高变化时，首次点击也可能落空，需重取 ref 重试。诊断手段：页内安装 `click` 捕获监听，比对「点击是否到达 DOM」与「处理器是否存在」。

**发版判定**：升级迁移面（slot 迁挂 + 会话导航）实弹通过，无阻塞项；实弹发现的两处退化（fork 导航死点、切换闸门）均已在同批次修复并复验，建议连同兼容台账 I37 一起发版。

## 2026-09-18 dsh 0.1.6-alpha.1 旧版回退实弹（同批次改码的向后兼容）

- **目的**：本批次三处改码都落在跨版本面上（`uiWorkspace` 静态 inject、`plugins.bundle.config` 注册、`workspaces.list` 读归档集合），需确认停在 0.1.6-alpha.1 未升级 dsh 的用户更新插件后不变砖。
- **环境**：Windows 10 22H2 ｜ 全局 dsh **0.1.6-alpha.1**（`npm uninstall -g @deepseek-ai/dsh` + `npm install -g @deepseek-ai/dsh@0.1.6-alpha.1 --before=2026-09-16`——直接装该版本会因 dsh 自身 `^0.1.6-alpha.1` 范围放行同 tuple 预发布而得到混合树，实测 `dsh-session`/`dsh-settings`/`dsh-client-ui-workspace` 仍为 alpha.2 且多装 `dsh-client-ui-plugin-manager`；`--before` 才得到纯 alpha.1 树）｜ 插件 link 模式（工作区 2.3.22 + 本批次改动产物）｜ dsh web 127.0.0.1:3080 ｜ 测试工作区 `D:\tmp\recall-h0`
- **执行方式**：浏览器实弹（页面 viewport 实测 0×0、原生 click 全落空 → 统一改用页内取 `__reactProps.onClick` 直接调用，输入走 `browser_type` + `Enter`）+ Host 侧 git tag / index.json / lineage.json 磁盘对账
- **结果**：三项全过，console 零消息（无客户端报错）。

**逐项结论**：

1. **旧 slot 卡片渲染 — 通过**：设置 → 插件 → 插件配置下渲染「撤回插件」卡（快照行为 3 开关 + 自动治理 5 数值项 + 三个折叠区 + 保存/恢复默认），`dsh-recall-*` 样式类全部生效（CSS 注入正常）；`plugins.bundle.config` 在 alpha.1 渲染器上是静默 no-op（`specDynamic` 未命中即返回），无任何错误——双键并注册按设计只在各自版本命中一个。
2. **撤回 fork 打开子会话 — 通过**：同会话两条消息（快照 `snap-9615fcc0` / `snap-1379f058`）→ 撤回第二条 → 确认 → 落安全快照 `snap-pre-rollback-1789672854430`、写 lineage `childId=session-584d077e… parentId=session-49e6f617…`、视图切到子会话（仅剩 1 轮）、标题保持「回复确认」无递增、被撤回消息文本回填输入框。**归属实证**：切过去后再发一条消息，新快照在 index.json 里记到 `session-584d077e…`——当前视图确为 fork 出的子会话，`uiWorkspace.openSession` 在 alpha.1 生效。
3. **快照管理 — 通过**：面板报「共 30 条快照，全部工作区快照存储占用 108 KB · git 可用 · home 3 个工作区」；工作区节点 `recall-h0 8 会话 / 15 快照`；展开后按版本家族聚族显示 `回复确认 v1/2 · 2 条` 与 `（已删除会话）v2/2 · 1 条`（lineage 关系在 alpha.1 正确读出）；刷新 / 立即 gc / 全部删除齐备。

**发现（按严重度）**：

1. **[观察·中] TOCTOU 二次复现并给出窗口宽度**：本轮撤回首条以外的消息时预览同样报「共 0 个文件将变更」。磁盘对账：index 记录时间 03:19:52.841、tag commit 时间 03:19:54（**差 ≈1.16 秒**，即 index 的 `time` 不是捕获时刻——与 PF 批次发现 2 同根）、模型写 `a1-probe.txt` 03:19:53.768 落在窗口内，故 `snap-1379f058` 树内已含该文件。与 alpha.2 轮观察 2 同源，README「已知限制」的窗口量级与实际相符（固定开销 = PowerShell 启动 + `git add`；README 依此与本次实测把区间记为 0.5–1.5 秒）。
2. **[过程备忘] viewport 0×0 使原生点击全部落空**：页面 `window.innerWidth/innerHeight = 0`（顶栏存在「退出全屏」，疑窗口未恢复尺寸），ref 上的 click 静默无效（页内 `click` 捕获监听计数 0）。本批次改用页内 `__reactProps.onClick({})` 调用 + `browser_type`/`Enter`（合成事件仍能到达 React 处理器）。
3. **[环境备忘] 降级固有现象（非插件缺陷）**：alpha.2 写入的 `workspace/changes` 事件（seq 63）对 alpha.1 harness 未知且未标 ignorable，打开该旧会话报「历史加载失败：failed to observe session …」。实弹改在新会话中进行；**未验证项**：alpha.1 下这些旧会话的快照管理叶子（标题/消息文本两段式补全）未逐条核对。

**发版判定**：0.1.6-alpha.1 旧版回退路径无阻塞项。核验期间按 registry 产物把 `uiWorkspace` 服务可用性逐版查了一遍（结论见 compat-audit I37「服务可用性」）：**`0.1.1-rc.2` 线段没有该服务**（同线亦缺 `sessions`/`workspaces`），静态 inject 无法满足、装上也只白屏——据此把 `>=0.1.1-rc.2 <0.1.2` 段从 7 个 dsh-* peer 范围移除（该线从「静默坏」变「明确拦住」），README 双语兼容声明与 badge 上界同步为 `0.1.6-alpha.2`。验完装回 alpha.2（`npm install -g @deepseek-ai/dsh@0.1.6-alpha.2`，树内 8 个 `@deepseek-ai/dsh-*` 包一致为 0.1.6-alpha.2），`npm run check:upgrade` 三层门禁全绿（check:dsh 全一致 / test:probe 39 通过 / verify:host 通过）。

## 2026-09-18 仅撤回对话模式批次（第八节，scope）

- **环境**：Windows 10 22H2 ｜ dsh 0.1.6-alpha.2 ｜ 插件 link 模式（scope 批次产物，12:50 build）｜ dsh web 127.0.0.1:3080（重启加载新产物）｜ 测试工作区 `D:\tmp\recall-h0`
- **执行方式**：agent-browser 浏览器实弹（eval 取面板 HTML/触发点击/读输入框）+ Host 侧 git tag / index.json / lineage.json 磁盘对账 + 文件 MD5 字节对照
- **结果**：第八节 5/5 全过（S-1〜S-5），console 零插件报错。

**逐项结论**：

1. **S-1 session-only 全链 — 通过**：会话 A 发 m1（建 scope-test.txt=v1）/ m2（改 v2），手动追加「手动调整」行 → 撤回 m2 选「仅撤回对话」→ 确认：文件 MD5 前后一致（E6B14FB8…，字节级未动）、零新 `snap-pre-rollback-*` tag、lineage 6→7（`session-5ce2b866… ← session-45bb7361…`）、子会话打开仅含 m1、标题继承、m2 文本回填输入框、原会话从侧栏消失。
2. **S-2 默认 both 回归 — 通过**：子会话发 m5（追加 both-line）→ 手动追加「手动改动二」→ 撤回 m5 走默认 both → 文件回退到 m5 快照状态（手动改动被覆盖）、安全快照照打（`snap-pre-rollback-17897*` 恰 +1，与 session-only 的 0 形成对照）、lineage 7→8（`session-c5c41… ← session-5ce2b…`）、m5 文本回填。重开面板默认复位 both（上次 session-only 选择不残留，openPreview 复位逻辑实证）。
3. **S-3 AGENT_BUSY 拦截 — 通过**：agent 长任务（big.txt 300 行）运行中点撤回 → 错误面板「无法回退：Agent 正在运行中，请先停止后再撤回」。注：拦截发生在 preview 层（面板都进不去）；session-only execute 层的 AGENT_BUSY 由 routes-scope 单测钉住（实弹无法在「preview 通过→execute 前窗口」内插入 agent 启动）。
4. **S-4 首条消息无 radio — 通过**：撤回 m1 面板 HTML 无 `.dsh-recall-scope`/radio 元素，文案「该消息是本会话中第一条用户消息，无法回退对话；确认后仅回退项目文件」、按钮「确认回退」——与现状逐项一致。
5. **S-5 面板分叉渲染 — 通过**：radio 组默认 both（「回退文件与对话」checked）；切「仅撤回对话」后 notes 变「项目文件保持当前状态，不会被回退或删除；对话回退到该消息之前。」+「以下差异仅作参考，所选模式不会改动文件。」（安全快照预告隐藏）、按钮「确认撤回对话」、清单保留（scope-test.txt 修改 1）。

**发现（按严重度）**：

1. **[过程备忘] 自动化输入与回填叠加**：撤回后回填文本留在 contenteditable 输入框内，后续用 `execCommand("insertText")` 发消息会追加在回填文本之后（光标默认在末尾），导致个别测试消息成为「复合文本」。与真人操作（先清空再输入）不同，非插件缺陷；但提醒后续自动化冒烟发消息前先清空输入框。
2. **[观察·低] done 面板随视图切换卸载**：execute→fork→openSession 成功后视图切到子会话，done 面板挂在旧消息节点内随之卸载，用户几乎看不到「对话已回退到该消息之前…」文案——both 模式同理（既有行为，非本批次引入），done 文案矩阵实际只有 fork 失败（不切视图）时可见。

**发版判定**：scope 功能实弹通过、无阻塞项；测试产物（scope-test.txt/count.txt/big.txt）验收后已从 recall-h0 清理，2 个归档会话与快照 tag 留在 store（复验可用，亦可通过设置页快照管理清理）。

## 2026-09-29 dsh 0.2.0-rc.1 升级实弹（撤回全链 + 设置页）

- **环境**：Windows 10 22H2 ｜ 全局 dsh **0.2.0-rc.1**（`npm install -g @deepseek-ai/dsh@0.2.0-rc.1`；dist-tag `next`，`latest` 仍 0.1.7-rc.2）｜ 插件 **link 模式**（profile 依赖临时改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + `pnpm install --no-frozen-lockfile`，切换前备份 `package.json.bak-20260929` / `pnpm-lock.yaml.bak-20260929`；工作区 peer 已扩 `|| >=0.2.0-rc.1 <0.2.1`）｜ `dsh web --no-open --port 3080`（token URL）｜ 测试工作区 `D:\tmp\recall-h0`
- **执行方式**：浏览器实弹（agent-browser：snapshot + 页内 `__reactProps.onClick` 触发 + 页内 fetch 打桩核对请求响应）+ API 直调（`/api/recall/*`，token cookie）+ Host 侧 index.json / lineage.json / git tag 磁盘对账
- **结果**：撤回全链与设置页快照管理逐项通过；插件 Console 零报错，dsh stderr 仅两条非插件信息（`dshmarket` 兼容门禁 skip 说明 + 插件自身方言探针 `recall shell dialect probe: pwsh`）。

**逐项结论**：

1. **启动与 Host 半 — 通过**：插件通过 0.2.0-rc.1 新增口径下的启动期兼容门禁并正常激活（同 profile 的第三方 `dshmarket@1.65.1` 因 peer 只到 `^0.1.2-alpha.2` 被跳过，stderr 有明确说明）；`status` → `{ok:true, errors:[], storeBase: C:\Users\cc\.dsh\dsh-recall-snapshots}`；`init` → `root=D:\tmp\recall-h0`、无 notice、`config:{refillDraft:true, archiveOriginal:true}`。
2. **撤回主链路 — 通过**：同会话两条消息各出快照（索引 `8792104e`@00:19:45、`91e66f19`@00:20:47）→ 手动把 `smoke-020.txt` 改为 `v2 line (手动改动)` → 撤回第二条：面板文案「整段回退 / 将项目恢复到 00:20 发送该消息时的状态。共 1 个文件将变更（修改 1）…」+ 范围 radio 默认 both、清单 `修改 smoke-020.txt`；确认后 **文件回退为 `v1 line`**、安全快照 tag `snap-pre-rollback-1790612487546` 落盘、lineage 追加 `childId=session-478696aa… parentId=session-d278b62c…`、视图切到子会话（「1 轮 1 步」、被撤回消息消失）、标题继承无「 2」递增、被撤回消息文本回填输入框、输入框上方无残留排队消息、原会话从侧栏消失（归档）。
3. **设置页配置卡 — 通过**：插件管理页 `已安装` 列表中 `dsh-recall-plugin` 正常（撤回图标 + 描述），详情页卡片完整渲染（快照行为 3 开关、自动治理 5 数值项取值 50/24/100/500/0、三个折叠区、保存/恢复默认/放弃修改）；`保存`（保留天数 0→7）落库后 `config-get` 回读 `overridden.retentionDays=7`，`恢复默认` 后 `overridden={}` 且 `retentionDays=0`——I39 settings 面（SettingsForms）读写双通。
4. **快照管理树 — 通过**：两级展开（`recall-h0 16 会话 / 29 快照`、`dsh-recall-plugin 4 会话 / 21 快照`），版本家族聚族（`创建 scope-test.txt 文件 v2/2 3 条` / `v1/2 2 条`、`回复确认 v1/2·v2/2`），叶子行渲染 `时:分 消息文本` 与单条删除钮、行尾「切换」按归档集合正确隐藏；`立即 gc` 由「执行中…」转「gc 完成」（共 51 条 / 1.4 MB）；「最近错误」无错误不渲染。

**发现（按严重度）**：

1. **[观察·低，既有 PF-6 设计] 快照树首次打开可能少一条最新快照**：卡片挂载时 Host 以旧 items 立即应答并标 `stale`，客户端二段再拉若仍撞上 stale 即按设计止步（防抖动），本次即停在 50/51 条（缺最后一条）；改走 React 处理器触发「刷新」后补齐为 51 条、该会话行由「1 条」变「2 条」。非本版引入（`routes-manage` 缓存逻辑与 0.1.7-rc.2 逐字一致），记录以备后续评估「stale 二段是否值得重试一次」。
2. **[过程备忘] `DOM.click()` 不触发卡片按钮的 React 处理器**：`b.click()` 后 fetch 打桩日志为空 = 处理器没跑；改取 `Object.keys(b).find(k=>k.startsWith('__reactProps'))` 调 `onClick({stopPropagation(){}})` 才真实触发。与既往「透明覆盖层拦截原生 click」同族，后续自动化统一走该路径。
3. **[环境备忘] 模型端点不可用不妨碍本类冒烟**：profile 默认模型 `traeapi/kimi-k3` 指向本机 `127.0.0.1:7864`（未运行），两轮均以「本轮运行失败 Connection error.」结束——但 `turn/start`/`turn/end` 照常成对落日志，快照、cutSeq 切点、fork 与回退全链不受影响（撤回第二轮的 cutSeq 正好落在第一轮的 `turn/end` 上）。后续纯兼容性冒烟可沿用此低成本形态。
4. **[观察] 自动化任务默认关闭**：0.2.0-rc.1 把 `schedule`/`time-context` 从 `dsh-web-app` patch 移除、改由可选 bundle `@deepseek-ai/dsh-experimental-schedule-bundle` 提供（插件管理页开关默认关）；与撤回插件无耦合，仅提示用户能力开关变化。

**发版判定**：0.2.0-rc.1 升级实弹无阻塞项。本轮扩范围改动已发 **2.4.6**（2026-09-29：npm `latest` + GitHub Release `v2.4.6` 双上线，tag 指向 `484bf99`），并已切回 npm 模式复验「npm 模式 + 0.2.0-rc.1 不被启动门禁跳过」——核验记录见 compat-audit 的 2.4.6 段。测试产物 `D:\tmp\recall-h0\smoke-020.txt`（回退后为 `v1 line`）与本次 2+1 条快照 / 1 条 lineage 留 store 供复验。

## 2026-09-30 rewind 加固批次（第九节，A1–A8 活体验收）

- **环境**：Windows 10 ｜ dsh 0.2.0-rc.2（全局）｜ dsh-recall-plugin **link 模式**（`~/.dsh/profiles/web` 与临时接线的 `headless` profile，指向工作区 `lib/`）｜ dsh web `127.0.0.1:3080`（token 换 cookie 后走 `/api/recall/*` 直调）｜ 测试工作区 `D:\tmp\rw-smoke`（含 1500 文件的 bulk/ 子树）与 `D:\tmp\rw-smoke2\target\debug`（构建产物 root 场景）｜ 消息由 headless 宿主产生（web 宿主不驱动模型也能触发快照捕获），UI 侧用内置浏览器实弹。
- **结果**：R-1〜R-6 六项**全部通过**（证据逐项注在清单条目上）。门禁：`typecheck` / `npm test` 478 / `npm run test:client` 83 / `verify:host` 全绿；`npm run build` 产物同步。

**实弹发现（按严重度，除第 5 项外均已在本批次修复并重跑门禁）**：

1. **[缺陷·严重] win32 上 `fileReadCmd` 读缺席文件退出码为 1 → A3 格式守卫把正常 store 锁死**：启动日志实测 `recall store format blocked: 磁盘格式标记不可读或内容非法…`——`Get-Content -ErrorAction SilentlyContinue` 只吞报错文本，**进程退出码仍是 1**（pwsh 与 PS 5.1 双版本实测），runShell 的退出码门禁（I14）据此抛错，守卫遂把「没有 marker」判成「标记损坏」；由于守卫同时挂在 capture 与 saveIndex 上，补戳永远写不下去 → **快照/撤回/列表载入全停且不可自愈**（POSIX 侧靠 `cat … || true` 无此问题）。修复＝Test-Path 分支让缺席路径以成功收尾（与 POSIX 同语义）；补 `scripts-contract` 文本钉；沉淀为 compat-audit **I41**。修复后重启复验：启动零告警、首条快照照常落盘并自动补戳 `format=1`。
2. **[缺陷·中] 启动预热 async IIFE 未接 catch → 宿主退出期可 fatal**：`dsh --profile headless --help` 实测 `dsh: fatal load failure: Error: cannot get required service "sessions" in inactive context`（栈指向预热里的 `ctx.sessions.list()`）——宿主打印帮助后立即卸载，预热恰在 inactive context 上取值，未接的 rejection 被 cordis 加载器记成 fatal。修复＝IIFE 整体 `.catch(() => {})`（预热是纯优化，任何失败都不该影响宿主启动/退出）。
3. **[缺陷·低] 守卫读失败文案误报「内容非法」**：读命令失败（宿主启动早期 shell/subprocess 未就绪）与 marker 内容损坏共用一句「不可读或内容非法」，把用户引向一个没有问题的文件（headless 预热期实测命中）。修复＝按 future / corrupt / unreadable 三分文案，单测钉「读失败不得出现内容非法字样」。
4. **[缺陷·中] i18n 三处失配（浏览器实弹）**：① 英文确认句拼接缺空格（`sent.1501 files`）；② 语言切换后设置卡片的两个分区折叠头停在挂载时语言（外壳文案在 ConfigForm 之外渲染，不重渲染）；③ 保存提示用切换前的旧语言（提示是保存时刻取词的字符串）。修复＝en 词条补句首空格、ConfigForm 增 `onLocaleApplied` 回调驱动外壳重渲染、locale 补丁先本地落地再报成功；三处均补进 `tests/client/i18n.test.ts` 并在浏览器复验通过（切 English/切回 auto 三处同时生效）。
5. **[观察·既有·未修] 撤回确认面板贴近输入框时按钮被输入框遮挡**：面板锚定在消息附近、整体下移时会与官方 composer 重叠，`取消/确认回退` 被 `RlGAzG_input` 盖住点不中（两次实弹各自经 `elementFromPoint` 复核命中输入框）；滚回上方后正常。属既有布局问题（非本批次引入），留待单独评估。另：官方侧栏工作区悬停信息卡移开鼠标后长期驻留（官方 UI 现象，与插件无关）。
6. **[观察] recover 的两个挂载点实测分工**：崩溃续做（R-1）由**预热腿**完成（重启日志直接出现 `recovered interrupted rollback … 工作区已复位到安全快照`）；R-2 的「一致即仅清理」分支由 **init 腿**完成（空闲进程被 create 时预热腿恰好未覆盖到该 root）。两腿幂等（`handled` 去重），用户可见语义一致；「清理」是写空串而非删除文件（读侧空串按无记录处理）。
7. **[观察] 记实弹手法**：headless 宿主可直接产生「真实用户消息 + 快照」（web profile 不动模型也能复现），快照与索引由 headless 侧的插件写入、web 宿主经磁盘读回——`init/snapshot-info/preview/execute/status/manage` 全链可纯 API 直调验证；杀进程窗口用「轮询 `recall-intent.json` 出现即杀」稳定命中（两次分别落在回退前与回退中，恰好覆盖 inject 与 recover 两条分支）。

**发版判定**：第九节通过，无阻塞项；本批次修复（含 fileReadCmd 严重缺陷）随下一次发版一起上线。测试产物保留：`D:\tmp\rw-smoke`（含 bulk/ 1500 文件与 `a.txt=v1-killed`）、`D:\tmp\rw-smoke2\target\debug`、store `dff4e521…`（快照 1 条 + 安全快照多个 + 已清空的 intent journal 留档）供复验；web/headless profile 已还原为 npm 模式（2.4.6）、3080 服务已停。

## 2026-10-03 事件接缝批次（第十节，issue #19 M5 实弹验证）

- **环境**：Windows 10 ｜ dsh 0.2.0-rc.2（全局）｜ dsh-recall-plugin **2.5.0 未发版工作区**（web profile link 模式指向工作区 `lib/`）｜ web `127.0.0.1:3080`（token 换 cookie）｜ 测试工作区 `D:\tmp\recall-h0`（既有 UI 工作区，原生目录选择器无法自动化故复用；`D:\tmp\m5-smoke` 留有 headless 试验 store）｜ 消息由**浏览器 composer 实弹发送**（模型 DeepSeek-V41-Flash 在线，逐轮真实完成）｜ 事件观察面＝最小探针插件 `recall-event-probe`（普通 `ctx.on` 双事件 → JSONL 落盘 `~/.dsh/recall-event-probe.log`，`RECALL_PROBE_THROW=1` 时先落 received 再 throw）。
- **结果**：M5-1〜M5-4 四项**全部通过**。随发 2.5.0（事件契约见 README「事件契约」章与 `src/types/events.ts`）。

1. **M5-1 三场景 payload 核对 — 通过**：① both：确认面板清单 `修改 m5a.txt`、范围 radio 默认 both，确认后收到 `complete{version:1, sessionId:session-450b7d63…, childSessionId:session-0e000d98…, scope:'both', cutSeq:23, messageId:b211d0e7…, root:'D:\tmp\recall-h0', count:2, chatReverted:true, archiveRequested:true}`；文件实际回退（m5a.txt v2→v1，安全快照 vs 目标 tag 的 diff 仅 `M m5a.txt`）；视图切子会话、标题继承无递增、原会话归档消失、被撤回文本回填输入框。② session-only：`complete{scope:'session-only', count:0, chatReverted:true, childSessionId:session-e560b697…}`，文件未动，且 sessionId 正是①的 childSessionId（fork 链上连续撤回可用）。③ 无切点：新会话首条消息，面板显示「该消息是本会话中第一条用户消息，无法回退对话」、radio 不渲染，`complete{cutSeq:null, chatReverted:false, childSessionId:null, archiveRequested:false, scope:'both'}`。
2. **M5-2 fork 失败 — 通过**：API 直调 `POST /api/recall/notify` 携带 `{status:'failed', stage:'fork', …}`（规格「桩改返空」的 wire 侧等价形态；client 侧 fork 抛错→failed(fork) 的探测已由 tests/client 组件测试钉住），notify 返 `{ok:true}`，探针收到 `failed{version:1, stage:'fork', sessionId/messageId/scope/cutSeq 透传, root enrich, error 透传, 无 code 键}`，且 complete 计数保持 3 不新增。
3. **M5-3 监听器 throw — 通过**：宿主带 `RECALL_PROBE_THROW=1` 重启后浏览器真实撤回一条（both）：探针日志先 `received` 后 `listener-throw` 两行；宿主日志出现 `recall event emit failed: Error: probe listener intentional throw (M5-3)`（queueMicrotask 内 try/catch → recordError 兜住，status API 的 errors 列表可见、count:1）；**无 uncaught/unhandled/fatal**，宿主进程存活（3080 持续监听 + status API 行为级可用），撤回链完整走完（子会话切换、草稿回填）。
4. **M5-4 旧 host + 新 client 混合 — 通过**：web profile 切 npm 2.4.6，再把已安装包内 `lib/client.js` 替换为 2.5.0 构建（模拟「浏览器缓存新 client + 宿主旧版」的真实错位形态；wire 级证据＝旧 host 对 `POST /api/recall/notify` 返 **404**）。实弹：真实撤回一条（both）——preview/execute 照常（旧 host 吃下新 client 请求，参数契约未变）、文件回退成功、fork/归档/回填正常、无报错 toast、宿主日志零异常、探针**零新事件**（旧 host 无 notify 端点，不广播，符合 §3.4 版本错位矩阵）。

**实弹发现（按严重度）**：

1. **[环境·中，操作提示] headless 宿主 + 在线模型时插件 shell 被权限审批门拒绝**：本轮默认模型在线（与 2026-09-30 轮的「端点不通」不同），headless 下插件快照链全线 `Error: exit 1`（含 home store 判定失败回退工作区库也失败）＋「cannot get required service subprocess in inactive context」，模型回复亦自述「权限问题解决前……需要 shell 的步骤会标出待执行」——headless profile 的 patch 层为空、无 web profile 那份 `permission` 预设（`defaultPreset: danger-full-access`），审批 `ask` 在无人值守下拒砂。用 `--patch` 临时叠加同款 permission 预设后快照立即正常（format/index/tag 全落）。**headless 产消息的既有手法需带该 overlay**；09-30 轮未暴露纯因模型端点当时不通、审批链未被触发。另：headless 冷启动第一条消息的快照在 shell 就绪前仍会撞一次守卫「读不到」分支（提示「下一条消息自动重试」，第二条即恢复，与预热期命中记录一致）。
2. **[观察·既有] `execute` 返回的 `count` 是「回退触达条数」而非「diff 条数」**：回退脚本口径＝`restored(目标 tag 全部文件数) + deleted(被清除文件数)`，故 0 文件变更的无切点撤回也报 `count:2`（m5a.txt+smoke-020.txt 均被恢复覆盖），预览清单则显示 0 条。事件 payload 的 count 沿用该值（`count: number` 符合契约）。消费方若按 count 做展示/阈值判断，应知其非「变更条数」；README 事件表已按此口径描述。既有语义（本批次未触碰 snapshots/scripts），如需改为 diff 口径属独立行为变更。
3. **[观察·工具链] `build-client.mjs` 完成行打印的字节数 ≠ 落盘文件大小**：日志恒打 156136，`lib/client.js` 实际 169125（差值应为 CJS factory 包裹层，I13）。仅打印口径问题，产物校验（package-layout/CI diff）均按文件本体，无影响。
4. **[观察·装载] DSH bundle 装载三件套**：`file:` 依赖被 pnpm 复制成实体目录（改源不生效），测试插件须用 `link:`；bundle 的 package.json 必须带 `dsh.bundle.patch`（纯 `bundle:{}` 报「declares no dsh.bundle」，patch 文件须是「顶层 YAML 数组的挂载行」，注释-only 文件也不行）——最小合法探针＝`{bundle:{patch:'./cordis.patch.yml'}}` + 一条 `- insert: [{id, name}]`。普通 `ctx.on` 可听兄弟插件 `ctx.emit`（cordis 4.0.4 `dispatch` 在 emit 无 thisArg 时不做上下文过滤，app 级共享 `_hooks`，复现脚本 `D:\tmp\m5-smoke\cordis-emit-repro.mjs`）。
5. **[观察] 浏览器自动化补充手法**：composer 实弹发消息（fill + 发送按钮 + 轮询「已完成」状态）在模型在线时完全可行，每轮 ~10-30s；「新建会话」可走会话树工作区节点旁的「在 XX 中新建会话」按钮（工作区下拉菜单项在展开瞬间呈 disabled，Playwright actionability 会误判超时）；确认面板从 loading 到 confirm 约 1-2s，按钮计数须在预览完成后取。

**发版判定**：第十节通过，无阻塞项；2.5.0（事件接缝 + notify 端点 + client 五处上报）具备发版条件。事件证据：①三场景 complete 与 M5-2 failed(fork) 的完整 payload 已逐字引用于上文第 1/2 条；②`C:\Users\cc\.dsh\recall-event-probe.log` 留档 M5-3 的 received/listener-throw 对（throw 宿主）与 M5-4 宿主的 boot 行（throwMode:false @09:18:31，即「探针在旧 host 上处于监听态、E1 撤回全程零事件」的直接证据；M5-3 前清空过日志隔离证据，故早前事件不在文件中）。测试产物保留 `D:\tmp\recall-h0`（m5a.txt=v1、多代 fork 会话与安全快照）与 `D:\tmp\m5-smoke`（headless 试验 store + cordis 复现脚本）；web/headless profile 已还原（web＝npm 2.4.6 原版并强制重装、探针目录删除；headless＝空依赖），3080 服务已停，本插件仓库无 M5 引入的改动。

## 2026-10-15 dsh 0.2.1-alpha.3 活体冒烟（第十一节，图片渲染换代 + 文本投影；即 [alpha.3 评估](../../upgrade-assessments/dsh-0.2.1-alpha.3.md) 待办②）

- **环境**：Windows 10 ｜ dsh **0.2.1-alpha.3**（全局，`npm ls -g` 实测）｜ 插件＝**工作区未发版构建以「构建覆盖」方式装入**（web profile 的 registry 2.4.10 包内替换 `lib/client.js`（169125 → 170298 B）与兼容矩阵 `package.json`，其余文件逐字节相同；原因见发现 3）｜ `dsh web --no-open --port 3080`（token URL）｜ 测试工作区 `D:\tmp\recall-h0` ｜ 素材：新生成 `smoke-a3.png`（96×96 PNG）+ `a3.txt`
- **执行方式**：agent-browser（Playwright 内核：`upload` 注入隐藏文件输入 + 页内 `__reactProps` 触发点击 + `eval` 读 DOM / 调端点）+ 磁盘对账（git tag / `index.json` / `lineage.json` / `heartbeat` / `workspace.json` / 宿主 stderr）
- **结果**：4 项通过（逐项结论同 [评估文档 §2.6](../../upgrade-assessments/dsh-0.2.1-alpha.3.md)）

**逐项结论**：

1. **图片渲染（新面 Factory 分支）— 通过**：带 PNG 附件的用户消息在插件重绘气泡内渲染出 `<img>`（blob，96×96，`naturalWidth/Height=96`）；点击图片弹出官方灯箱（`_backdrop_19zw2`，`interactive:false` 未阻断查看）；行内 1 图 / 1 气泡 / 1 stack——`content.text=''` + `extraBlocks:[]` 的 `showBubble=false` 契约生效，正文只有插件自绘气泡、**无重复官方气泡**。
2. **文本投影（密钥脱敏对齐）— 通过**：同一条消息文本含 `AKIAIOSFODNN7EXAMPLE` 与 `sk-abcdefghij1234567890` → 插件气泡渲染 `AKIAIOSF************` / `sk-abcde***************`（官方规则隐藏 8 位可读、其余打码）；`row.innerHTML` 不含任一原串（**插件行内零原文**）。图片 + 两种密钥形态同现，一并覆盖组合场景。
3. **撤回全链（both）— 通过**：3 条消息各出快照（tag `snap-569734ed…` 00:11:38 / `snap-45268e75…` 00:12:25 / `snap-6e302004…` 00:13:42，`index.json` 会话归属 `session-c1c2a210…` 逐条正确）；改 `a3.txt`（v2→v3）后撤回消息 3：面板「整段回退 … 共 2 个文件将变更（修改 1 · 删除 1）」+ 两枚范围 radio → 确认后：`a3.txt` 恢复为 `v2 line (manual change)`、`smoke-write-test.txt` 被删、安全快照 `snap-pre-rollback-1791994471867`（00:14:33）、lineage 追加 `childId=session-5c91d82d… ← parentId=session-c1c2a210…`、原会话进归档（`workspace.json` 归档集合 8→9）、视图切子会话（3→2 行）、**子会话重绘后图片与脱敏文本仍正确**、标题继承「冒烟图片与文本投影」无「 2」递增、被撤回消息回填输入框、输入框上方无残留排队项、`recall-intent.json` 清零、心跳 `50696 1791994472`（PID 与宿主进程实测一致）。
4. **错误面 — 通过**：`POST /api/recall/status` → `{ok:true,errors:[]}`；宿主 stderr 仅第三方 `better-sidebar: pending` 与插件自身 `recall shell dialect probe: pwsh`，**无 skip/compat 行**。

**未覆盖（局限）**：① 旧面分支（≤0.2.1-alpha.2 的 `renderMessageImages` 闭包）未活体重跑——该分支语句与已发 2.4.10 逐字相同（本轮 diff 仅把它移入 `if`），实弹需先降级 dsh；② session-only 范围与设置页三卡片不在本轮范围（本次改动未触碰）。

**发现（按严重度）**：

1. **[观察·中，非插件面] 官方「工作过程」摘要卡明文回显用户消息**：会话里出现 `The user sent an image "smoke-a3.png" with text: "…AKIAIOSFODNN7EXAMPLE…"`（官方摘要卡渲染面；该串**不在插件行内**——`row.innerHTML` 无原文）。`dsh-client-ui-secret-mask` 只覆盖官方文本投影层，插件气泡复用该层后已打码，但该摘要面不受覆盖；非本轮引入，记录以备上游/用户预期评估。
2. **[过程备忘] 排队消息形态会让 cutSeq=null**：Agent 运行中再发消息会进队列并与当轮合并（两条消息之间没有 `turn/end`）→ 对后一条撤回时面板报「该消息是本会话中第一条用户消息，无法回退对话」（仅回退文件）。构造对话回退用例须先让上一轮结束——模型端点悬挂时用 UI「停止生成」收尾即可产生 `turn/end` 切点（本轮实测有效）。
3. **[过程备忘] 本机 shell 沙箱拦截 junction 遍历 → link 模式不可用，改「构建覆盖」**：沙箱内任何 junction 的 `stat`/`readdir`/`realpath` 均报 `UNKNOWN -4094`（PowerShell 文案「不可信装入点」），`pnpm add dsh-recall-plugin@link:…` 创建链接后自身都读不过去（工作区内的对照 junction 同样如此，证明是沙箱文件系统过滤、非链接损坏）。改走 M5-4 既有手法：npm 模式装 registry 2.4.10，再把工作区 `lib/client.js` + `package.json` 覆盖进已安装包（两者版本同为 2.4.10）。另：web profile 遗留 2026-10-03 M5 探针的断链 junction `node_modules/recall-event-probe`（沙箱下会让 `dsh web` 启动崩在 `realpath`）——已**移入 `~/.dsh/_quarantine/` 保留（未删除）**，其原目标目录补回为空目录；如需还原，把该链接移回 `node_modules/recall-event-probe` 即可（非沙箱进程下 dsh 对断链 junction 本身容忍：`realpath` 走 ENOENT 分支跳过）。
4. **[过程备忘] 还原手续**：冒烟后已把已安装包**逐字节还原**为 registry 2.4.10（`npm pack` 比对本：`lib/client.js` 169125 B、`package.json` 一致）、profile `package.json` / `pnpm-lock.yaml` 与冒烟前备份逐字节相同（备份 `*.bak-a3smoke` 留档）、临时脚本清除、3080 实例停止（`taskkill`）。

**发版判定**：本轮修复（图片双面适配 + 文本投影脱敏）在 0.2.1-alpha.3 真宿主 + 浏览器实弹**无阻塞项**，具备发版条件。测试产物保留：`D:\tmp\recall-h0`（`a3.txt`=`v2 line (manual change)`、`smoke-a3.png`、`m5a.txt`、`smoke-020.txt`）、store 三条消息快照 + 一条安全快照 + 一条 lineage、截图 `D:\tmp\recall-a3-smoke.png`；UI 子会话「冒烟图片与文本投影」保留供复验。

## 2026-10-16 issue #23 修复活体冒烟（第十二节，内容改官方单入口 + 判据重写）

- **环境**：Windows 10 ｜ dsh **0.2.1-alpha.4**（全局）｜ 插件＝**工作区未提交构建以「构建覆盖」方式装入**（web profile 的 registry 2.4.11 包内替换 `lib/client.js`（170298 → 172001 B），其余文件未动；原文件备份 `.bak-23smoke` 留档）｜ `dsh web --no-open --port 3080`（token URL）｜ 测试工作区 `D:\tmp\recall-h0` ｜ 素材：`smoke-a3.png`（96×96 PNG）+ `a3.txt`
- **执行方式**：agent-browser（`upload` 注入隐藏文件输入 + 页内 `__reactProps.onClick` 直调点击 + `eval` 读 DOM / 调端点）+ 磁盘与 store 对账（index.json / lineage.json / recall-intent.json / heartbeat / git tag / 宿主 stderr）
- **结果**：4 项通过

**逐项结论**：

1. **新面单入口渲染（本轮核心改动）— 通过**：带 PNG + 文件附件的消息行 DOM＝`.dsh-recall-row > .dsh-recall-stack > .Sixlwa_userStack`（官方内容）——官方 attachmentRow（图片 gallery，`naturalWidth/Height=96`）+**官方 `Sixlwa_fileCard`（`a3.txt` → `TXT 24B`；文件卡片改由官方渲染是本轮新增能力）**+ 官方 bubble；**插件自绘退场**（`.dsh-recall-bubble`/`.dsh-recall-filecard` 均 0 命中）；插件动作行保留（复制 + 撤回 2 枚）。
2. **密钥脱敏（经官方 user.text 链）— 通过**：消息文本含 `AKIAIOSFODNN7EXAMPLE` 与 `sk-abcdefghij1234567890` → 渲染为 `AKIAIOSF************` / `sk-abcde***************`；`row.innerHTML` 不含任一原串。
3. **撤回全链（both，含 fork）— 通过**：①**首条消息（cutSeq=null）**：面板「仅回退项目文件」且无范围选项，确认后 agent 生成期间新增的 `_probe/*.cjs` 删除、`a3.txt` 恢复 v2、结果面板「回退完成」、文本回填输入框（含密钥原文——回填是设计行为）。②**第二条（有 cutSeq）**：面板「修改 1 · 删除 1」+ 两枚范围 radio，确认后 fork 到子会话（视图 2 行 → 1 行）、**原会话归档**（侧边栏消失、子会话标题继承无「 2」递增）、**子会话重绘正确**（图片 96×96 + 官方文件卡 + 打码文本 + 撤回按钮在位）、回填第二条文本、磁盘恢复（`probe2.txt` 删除、`a3.txt`=v2）。③**store 对账**：index 15 条（新增 `220aa81c-…`@00:16）、lineage 追加 `childId=session-2f28df45… ← parentId=session-5409d1bb…`、安全快照 2 枚（`snap-pre-rollback-1792080921860` / `…1792081076891`）、`recall-intent.json` 清零、心跳 `63412 1792081077`（PID=宿主进程实测）。
4. **错误面 — 通过**：`POST /api/recall/status` → `{ok:true, errors:[], storeBase:C:\Users\cc\.dsh\dsh-recall-snapshots}`；宿主 stderr 仅 `recall shell dialect probe: pwsh` + 第三方 `better-sidebar: pending`，**无 skip/compat 行**。

**未覆盖（局限）**：① **issue #23 原始场景（0.2.0-rc.2「renderFactorySlot 在场、槽位缺席」）未实弹**——需降级全局 dsh 至该版本线；等价场景已由单测钉住（client「两面并存 → 归旧面」+「Factory 返回空/抛错 → 回落自绘并告警」、unit 判据/投影四例）；② 旧面闭包（`renderMessageImages`）活体未重跑（同上需降级 dsh），该分支代码与 2.4.10 逐字相同；③ session-only 范围与设置页三卡片不在本轮范围（本次改动未触碰）。

**发现（按严重度）**：
1. **[观察·低，非插件面] 宿主 stderr 出现 `MaxListenersExceededWarning`（11 close listeners on Socket）**：疑似长连接/SSE 累积，插件只走 fetch、不建 socket；归官方/第三方连接层，记录备查。
2. **[过程备忘] CLI `click` 对 React 合成事件无效**：`agent-browser click <sel>` 报 Done 但处理器不执行，须页内 `__reactProps.onClick(...)` 直调（本次两处点击均用此法；上节记录同款）。
3. **[过程备忘] 回填文本会留在输入框**：撤回后直接 `fill` 再发，第二条消息文本＝新输入 + 回填文本（本轮实测），构造用例需先清空（不影响插件行为）。

**收尾**：profile `lib/client.js` 已逐字节还原 registry 2.4.11（170298 B、无新标记）、`.bak-23smoke` 留档可删、3080 实例已停（taskkill）、浏览器已关、截图 `D:\tmp\recall-23-smoke.png`（68 KB）。测试产物：`D:\tmp\recall-h0`（`a3.txt`=v2；`probe2.txt` 已由回退删除）+ store 两条消息快照 + 两枚安全快照 + 一条 lineage；UI 子会话「冒烟文本投影密钥打…」保留供复验。

**发版判定**：本轮改动（内容改官方单入口 + 判据重写 + 兜底回落）在 0.2.1-alpha.4 真宿主 + 浏览器实弹**无阻塞项**，具备发版条件。

### 附：0.2.0-rc.2 原场景复验（issue #23 A/B 对照，同日）

- **环境**：Windows 10 ｜ **dsh 0.2.0-rc.2 临时 prefix 安装**（`npm install @deepseek-ai/dsh@0.2.0-rc.2 --prefix D:\tmp\dsh-rc2`，不污染全局）｜ `dsh web --no-open --port 3081` ｜ 插件＝工作区构建覆盖（同第十二节）与对照态 registry 2.4.11 ｜ agent-browser
- **前置现象**：rc.2 拒绝加载 alpha.4 写的会话（页面「历史加载失败…contains event type `job/registered` unknown to this harness」）——跨版本会话 fail-closed 属官方设计，故在 rc.2 新建会话内测试；rc.2 启动另 skip 了 6 个官方实验 bundle（rc.2 安装目录不含，非插件）。
- **A/B 对照（同一会话、同一消息，仅切插件产物）**：

  | 插件产物 | `.dsh-recall-bubble` 文本 | 行内其余 | 判定 |
  |---|---|---|---|
  | registry 2.4.11（bug 版） | `""`（空白） | 文件卡 `TXT a3.txt TXT 24B` + 时间 + 两枚动作按钮 | **issue #23 精确复现**（正文空白、自绘气泡只剩内边距） |
  | 工作区构建（修复版） | `"rc2冒烟：正文不应空白 AKIAIOSFODNN7EXAMPLE"` | 同上 + 图片 `96×96` | **修复确认** |

  两态其余维度一致：`renderMessageImages` 图片闭包 `96×96` ✓、自绘文件卡 1 枚 ✓、动作行 2 枚 ✓、`officialStack: false`（判据归旧面、未触碰 content Factory）✓。密钥在 rc.2 上**不打码**属预期（`dsh-client-ui-secret-mask` 是 alpha.3 才引入，旧面本就明文，与 2.4.10 行为一致）。
- **撤回链（rc.2 上）— 通过**：① P0-1 护栏正常拦截（agent 运行中点撤回 → 面板「无法回退：Agent 正在运行中」）；② 停止生成后撤回：首条消息 `cutSeq=null` → 「仅回退项目文件」，agent 生成期间新增的 `_probe/png_probe.py` 删除（`_probe/` 空目录残留＝git 语义，非缺陷）、`a3.txt` v5→v2 恢复、结果面板「回退完成」；③ **STALE 自动重拉实测**：预览后文件再变 → 确认时面板自动刷新为「修改 1 · 删除 1」（不执行旧预览）✓。
- **环境坑（非插件）**：本机 `write_to_file` 对**已存在文件**的写入两次出现未落盘（`a3.txt` mtime 未变），改用 `node fs.writeFileSync` 直写后一切正常——撤回/diff 全程基于真实磁盘，结论不受影响；记录以备后续测试避坑。
- **收尾**：`.bak-rc2smoke` 还原（170298 B）、3081 已停、浏览器已关、截图 `D:\tmp\recall-rc2-smoke.png`；rc.2 临时安装保留在 `D:\tmp\dsh-rc2`（可删）。

## 2026-10-23 编辑并重发（issue #26，清单第十节）

- **环境**：Windows 10 ｜ dsh 0.2.1-rc.2（全局）｜ `dsh --profile web --port 7899 --no-open` ｜ 插件＝web profile 临时切 `link:D:\workspace\dsh-plugin\dsh-recall-plugin`（工作区构建 2.5.0，`lib/client.js` 175,326 B）｜ 工作区 `D:\tmp\recall-h0` ｜ agent-browser 实弹
- **结果**：E-1〜E-4 全通过、E-5 由组件测试覆盖；连续两次编辑（B01→B02、C01→C02）均正常，无新缺陷
- **链路证据**：
  - 编辑面板：标题「编辑并重发」、textarea 预填与原消息逐字一致、主按钮「编辑并发送」、附件场景多一行「原消息的 1 个附件会一并带入新消息」；打开面板零网络请求
  - 提交：新会话历史恰为 `A01/A1 → B02/B2 → C02/C2`，`B01` 与 `C01` 均不存在；输入框在自动发送后已清空
  - 归档：原会话「冒烟A01与B01回复验证」在「视图选项 → 仅显示已归档」可见，切回「隐藏已归档」后主列表只剩新会话
  - 磁盘：`lineage.json` 精确 +1（`childId` ↔ `parentId`，time 与 store mtime 对齐）；`recall-intent.json` 无本次残留（最新写入仍是 10-16）；无新增 `snap-pre-rollback-*`（session-only 不打安全快照）
  - 附件：C02 消息带 `smoke-attach.png` 缩略图且 agent 回复「收到C2」——附件随该轮消息发出、未滞留在输入框，说明「等附件链路走完再 submit」的时序生效
- **发现**：无阻塞项。三条观察：① 编辑后标题由官方 titles bundle 重新生成为「冒烟测试A01与B02」，未出现「xxx 2」递增（fork 未传 `increaseTitle`）；② 两次编辑都在 agent 空闲态发起，`AGENT_BUSY` 护栏未被触发（该面由 P0-1 全链既有验收覆盖）；③ 首条消息拒绝面实机未构造（新会话首条消息即 `cutSeq=null`，单独构造需再跑一轮 agent），由 `tests/client/edit-flow.test.ts` 的「cutSeq null → 零 execute、零 setDraft」覆盖
- **收尾**：web profile 已还原 npm 模式（`pnpm install` 回 2.4.16、junction 解除、备份文件删除）、7899 已停、浏览器已关、`D:\tmp\smoke-attach.png` 与启动日志已清理；测试会话「冒烟测试A01与B02」保留在 `D:\tmp\recall-h0` 供复验

## 2026-10-23 气泡原位编辑 + 版本翻页器（同日二次迭代，清单第十节 E-6/E-7）

- **环境**：Windows 10 ｜ dsh 0.2.1-rc.2 ｜ `dsh --profile web --port 7901 --no-open` ｜ web profile **常驻 link 模式**（工作区 2.5.0，`lib/client.js` 185,552 B）｜ 工作区 `D:\tmp\recall-h0` ｜ agent-browser
- **结果**：E-6/E-7 通过；E-5（首条消息拒绝）在第二轮实机中顺带命中。两轮迭代各修掉一个实现缺陷，见下
- **E-6 气泡原位编辑**：点 ✎ 后气泡本体被编辑框顶替（`data-editing` 落在消息行上，动作行保留原位），编辑框宽度取进入前 `getBoundingClientRect()` 实测的气泡宽（短消息 220px，即 `min 220` 下限），textarea 预填原文逐字一致；取消后气泡恢复。原实现（消息下方面板）的纵向冗余消失
- **E-7 版本翻页器**：一次编辑重发后最后一轮回答操作区出现 `‹2/2›`；点 ‹ 后标题回退到第一版会话、翻页器变 `‹1/2›`、侧栏只剩该版本（另一版本已归档）；点 › 切回，`‹2/2›` 与标题同步恢复；历史回合的空容器被 `:empty` 隐藏，不占位
- **缺陷 1（翻页器不出场）**：`pagers:0` 但 `tails:2`、localStorage 里家族已写入。两个原因叠加：① 首版只在 `visible` 为真时渲染，而 `visible` 靠 `ref.current.closest('[data-turn-tail]')` 判定——返回 `null` 时 ref 从未挂载，永远判不出「我是最后一个回合」（自锁）；② list 槽注册只给了 `name`，缺 `id`，条目未登场。修复：容器无条件渲染、空则 `:empty` 隐藏；注册补 `{ id, order, inject(sessionId) }`（对照官方 `dsh-client-ui-message-feedback` 写法）
- **缺陷 2（会话 id 拿不到）**：assistant-actions 槽 props 只有 `messageId`，无法查版本家族。修复：用槽的 `inject(sessionId)` 回调注入；并保留两条兜底——消息行上的 `data-recall-session` 与 `activeSession` 共享位
- **收尾**：7901 已停、浏览器已关、启动日志清理；`link` 模式保留（用户要求）
