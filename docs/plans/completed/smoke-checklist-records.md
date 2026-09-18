# 冒烟测试执行记录

> 配套文档：[smoke-checklist.md](./smoke-checklist.md)（测试项清单；逐项 ✅/△ 结果注在对应条目上）｜ 本文件只登记**会话级执行记录**：日期、环境、结果、发现与发版判定。
> 约定：每次执行后追加一节（日期 + 范围）；出现失败的记 issue 并回链；清单全部通过后与 checklist 一起移入 `completed/`。
> 状态总览：第一〜七节均已执行通过（2026-08-29：Windows 侧 + WSL 侧 + 修复实施 + v2.1.1 本机验证 + PF 性能批次实弹）。

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
