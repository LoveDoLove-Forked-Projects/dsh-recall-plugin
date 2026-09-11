# 三竞品六维度评估（第四轮，2026-09-09）

> 调研日期：2026-09-09 ｜ 本项目基线：dsh-recall-plugin 2.3.8（单测 25 文件 250 例 + 探针 + verify:host + typecheck 四层门禁）
> 调研对象（本地源码全量通读，快照路径 `D:\workspace\dsh-plugin\`）：
> [SiriLee/dsh-rewind](https://github.com/SiriLee/dsh-rewind) **0.10.0-alpha.1**、[Anionex/dsh-turn-rewind](https://github.com/Anionex/dsh-turn-rewind) **0.2.2**、[Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite) **2.4.1**。
> 调研方式：三项目 src/tests/scripts/CI 全量源码通读 + 关键论断实地抽查核验（见附录），按代码质量 / 模块设计 / 性能 / 可维护性 / 错误处理 / 扩展性六维度评估，每条结论附证据（文件:行号）。
> 与前三轮的关系：第一轮 2026-08-26 与第二轮 2026-08-28 见 [research-competitors.md](./research-competitors.md)（静态归档）；第三轮 2026-09-04 驱动 [plan-competitor-ux.md](./pending/plan-competitor-ux.md)。**本轮为竞品版本大幅演进后的第四轮**，核心增量见第四节；引入建议中与第三轮重合项已标注（如 crash-safety = U3）。

## 一、评估概览

### 1.1 版本演进（2026-09-04 轮 → 本轮）

| 项目 | 2026-09-04 快照 | 2026-09-09 本轮 | 演进要点 |
|---|---|---|---|
| dsh-rewind | （旧版，engine 无 verify-host 进 CI 记录） | 0.10.0-alpha.1，17 文件 6526 行 TS，304 用例 | marker 已历 form A→B→C 三次改形（0.9.x 需 `/dsh-rewind-fix` 迁移命令）；verify-host 进 CI；crash 注入测试 |
| dsh-turn-rewind | engine.ts 1090 行 | 0.2.2，15 文件 7401 行 TS，109 用例 | v2 git-native 模式（blob 入用户仓库 .git/objects）；plan 四层时效防护成型；0.2.x 仍无 CHANGELOG |
| DSH-EasyRewrite | client.src.js 1900 行 | 2.4.1，client.src.js **3346 行** + lib/index.js 427 行 | v2.1.1 新增**模型/思考挡位随行**（本轮最重要发现）；2.4.x 线硬分叉（旧宿主停留 2.3.1） |

### 1.2 路线定位（一句话）

- **dsh-rewind**：官方 `session.append` 的 `surfaceOp.replace` 就地截断模型可见 surface（日志 append-only）+ 写前轻量备份（无 git、零子进程）——体验最优雅，契约最深。
- **dsh-turn-rewind**：Change Ledger 引擎（v1 自建 CAS blob / v2 git-native 私有 ref 入用户仓库），plan→confirm→apply 安全合同，对外暴露 `ctx.changeLedger` 服务——工程最重，约束最严。
- **DSH-EasyRewrite**：纯对话层惰性撤回/编辑（确认零 IO，发送时才 fork），归档 + 同名新会话无痕替换，官方 parentId 派生版本翻页器——交互最丰富，工程最裸奔。

## 二、六维度评估

### 2.1 dsh-rewind（0.10.0-alpha.1）

**统计**：17 文件 6526 行 TS；最大文件 snapshot.ts 1653 / index.ts 1049 / portals.tsx 754；304 用例（302 it + 2 test）；0 运行时依赖 + 14 optional peer + 42 dev（含 33 个真实 `@deepseek-ai/*` 官方包）；tsconfig `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` 全开；CI = typecheck×3 + vitest + build + verify-host + npm pack dry-run（`check` 脚本，已核验）。

**代码质量**
- ✅ 全库零 `as any`/`@ts-ignore`，仅 8 处 `as unknown as` 结构化收窄；类型化错误码 RewindError（rewind.ts L48-63）。
- ✅ 纯函数规划层零 I/O 零 Session 依赖（rewind.ts）。
- ❌ snapshot.ts 1653 行 / index.ts 1049 行；`apply()` 约 160 行（index.ts L888-1047）装配+事件+嵌套 inject 混杂；15 处 `]!` 非空断言；无 lint 工具链。

**模块设计**
- ✅ 规划/存储/装配三层分离；client 用结构化类型（SlotsLike/UiConversationLike）零 import 官方 UI 包类型。
- ❌ **host 模块级可变状态 3 处**（activeLocale L81 / cleanupStore L89 / autoSweepChecked L671）——违反 cordis HMR 规则；SnapshotStore 一类六职；client 靠「最后一个 button」DOM 启发式定位（portals.tsx L345-360）。

**性能**
- ✅ 零子进程零 git，备份/回退全 node:fs；锚点 WeakMap 增量缓存摊还 O(1)；prune 1s 防抖。
- ❌ 每次 write/edit 前全量读文件入内存（大文件 O(size)×N）；每条用户消息边界重读全部 tracked 文件。

**可维护性**
- ✅ **「测试即审计」**：compat-invariants/interop/gaps 用真实 dsh 包跑探针；verify-host 15 项真装配门禁**进 CI**；11 篇 docs + 双语 README。
- ❌ 文档漂移：audit.md 钉 0.1.2-rc.1 vs package.json peer `>=0.1.3-alpha.2` vs AGENTS.md 三处不一致；tsconfig include 引用已删除文件。

**错误处理**
- ✅ **崩溃安全工程最系统**：journaled restore 三态机（running/rollback-running/recovery-required）+ 磁盘真相裁决 + 26KB crash 注入测试（crash-safety.test.ts）；.tmp+rename 原子写；cleanup 配置损坏 fail-closed；in-flight guard + agent.cancel + whenIdle 15s 超时。
- ❌ 无跨进程锁（roadmap 自认）；回退后需手动 `ctx.emit('fs/observed')` 补观察缓存（聪明但脆弱）；二进制文件经 utf8 往返损坏（snapshot.ts L257/L1029）。

**扩展性**
- ✅ host↔client 机器通道 locale 无关；5 份 tsconfig 分层构建；动态 `ctx.inject` 按需注入。
- ❌ **surfaceOp/sourceEventSeqs 深契约**：marker 三次改形、A/B 被新 harness 拒读、0.9.x 需迁移命令——dsh 每次线升级即全量迁移；DOM 启发式 harness 改 UI 即断。

### 2.2 dsh-turn-rewind（0.2.2）

**统计**：15 文件 7401 行 TS；最大文件 store.ts 1679 / engine.ts 1273 / client/index.tsx 1076 / git-checkpoint.ts 804；109 用例（node:test，真实 git fixture 集成测试）；0 运行时依赖 + 3 peer；tsconfig 严格度三项目最高（`exactOptionalPropertyTypes` + `noImplicitOverride` + `useUnknownInCatchVariables` 全实际启用，已核验）。

**代码质量**
- ✅ 无 any/@ts-ignore；持久数据全量防御性解析（parseManifest 重算 treeHash 核对 fileCount/totalBytes）；错误消息 JSON 转义防注入。
- ❌ store.ts 1679 / engine.ts 1273 行；`applyRestore` 约 150 行嵌套 6 层（engine.ts L561-711）；v1/v2 双格式分支散布 9 处无退役时间表。

**模块设计**
- ✅ **引擎与 DSH 适配完全解耦**（engine/store 零 cordis import，`exports './core'` 可独立复用）；changeLedger 服务面 12 方法，plan→confirm→apply 合同清晰。
- ❌ Coordinator 五个可变 Map 无会话级清理钩子（rewind-host.ts L134-138，长会话内存只增不减）；settings 直接 Object.assign 突变共享 config（engine.ts L99）。

**性能**
- ✅ git-native fast 模式 clean blob 零读（信任 fenced stat + index OID）；**文档化基准：15,500 文件 clean 捕获 2.00s / warm 对比 3.88s**；捕获 deadline 5s 不阻塞 agent 首步。
- ❌ **每脏文件一次 hash-object spawn**（git-checkpoint.ts L201，未用 `--stdin-paths` 批处理）；verifyGitCheckpoint 在 list/find/inspect/plan/apply 五处全量执行；legacy 模式双读全树。

**可维护性**
- ✅ 注释解释 why 的典范（git.ts L50-56 嵌入仓库排除推理）；FORMAT.md 用 TS 接口钉持久格式；SECURITY.md 七条 mutation gates；27KB 大仓库设计文档含 prior-art 审计。
- ❌ **无 CHANGELOG、无兼容台账、无探针层**（API 假设靠本地 *Like 接口自洽）；97KB 单测试文件；`agent/pre-step`/`tools/execute` 为本地声明事件，官方变更静默失效（我方 I10/I29 同款坑）。

**错误处理**
- ✅ 故障恢复三件套完备度最高：rescue point → operation journal 状态机 → 启动对账（含「锁被新发布占用的陈旧回收者」极端场景测试）；RECOVERY_REQUIRED 终态保留诊断；回滚不响应 abort 的权衡成文。
- ❌ 错误码扁平（`GIT_COMMAND_FAILED` 一码裹所有）；全英文技术性 message 无可行动提示；HTTP 仅 404/409 两档；**>16MB 文件抛错致整工作区无法建点**（fail-closed 过头）。

**扩展性**
- ✅ **零平台分支**：纯 Node fs + git CLI，全 src/ 仅 1 处 `process.platform`（机器 GUID 探测，已核验）——完全消除双脚本模板；配置 11 字段全 runtime 热更。
- ❌ 加配置项同步 4 处；client inject 声明与 package.json `dsh.client.inject` 不一致（旧包名，我方 I29 同款）；兼容表止于 0.1.2-alpha.5。

### 2.3 DSH-EasyRewrite（2.4.1）

**统计**：lib/index.js 427 行（host）+ src/client.src.js **3346 行**（client，经 build.mjs 图标 base64 内联生成 lib/client.js，行数相同）；**最长函数 UserBubbleView 716 行 / EasyRewriteSettingsCard 567 行 / RecallBanner 437 行，最大嵌套 10 层**；纯 ES5 风格 JS，30 个 JSDoc 块零类型标注；测试仅 10 断言块覆盖 2 个纯函数（且 "All passed" 打印在第 6-10 号测试**之前**，结果未汇报）；零依赖、无 CI；143 个 catch 中 **60 个静默吞错（42%）**。

**代码质量**
- ✅ 注释密度高且写「为什么」（var 提升坑引 React #321、review 编号全文可追溯）。
- ❌ **无类型已产实证发布版 bug**：`confirmEdit` 内 `var data` 提升遮蔽外层 `node.data`（client.src.js L2824），致 realSeq 恒 undefined 走 anchorSeq 兜底——而 L3060 注释明言该兜底对窗口外历史消息会退化，同文件撤回路径却无此 bug（同类逻辑一正一错）；lib/index.js L128 使用未导入的 `path` 命名空间被 catch 吞掉；RecallBanner 的 resize 监听写在卸载函数里（死代码）。

**模块设计**
- ✅ host 极薄（427 行，纯对话层定位合理）；pending store 用 useSyncExternalStore + storage 事件跨标签页同步。
- ❌ client 单闭包 6+ 个模块级可变状态（HMR 靠运气）；UserBubbleView 716 行含 5 种渲染形态；i18n 三语字典 274 行内联组件中部。

**性能**
- ✅ 惰性提交确认零 IO（纯 localStorage）感知即时；边界计算 client 直扫省一次 HTTP 往返；版本家族零持久化（官方 parentId 派生）。
- ❌ `familyOfSession` 渲染期全量重算无 memo（深度表 O(N×64) + 链上溯，设置卡 O(N²)）；MutationObserver 监听整个 chat flow 每次变更 querySelectorAll。

**可维护性**
- ✅ CHANGELOG 质量高（每版具体修复 + issue 引用）；review-round1-3 留评审轨迹。
- ❌ **文档漂移**：DESIGN.md 协议表写不存在的端点（/bubble/edit、/bubble/archive）、描述已删除的视口锚定实现（代码注释「已交还官方 chatScrollPositions」）；2.3.x/2.4.x 双版本线硬分叉，兼容代码散落全文件，CHANGELOG 自证两次「大规模重构」。

**错误处理**
- ✅ 边界错误分类细致（no-boundary 与 turn-open 语义分离）；fork 异常按官方文案子串分流；resume-send 30s TTL 防幽灵发送。
- ❌ localStorage 全场景静默 try/catch（29 处）；resume-send 标记无跨标签页同步（双标签页可能双发送）；日志默认静默。

**扩展性**
- ✅ 零依赖零构建链安装即用；官方 API 变化有意识收口在少数 compat 函数（resolveImageCompat 三级兼容）。
- ❌ **设置全走 localStorage + host 注册 dummy schema（`(x)=>x??{}` 伪造 toJSON）——违反官方合规清单 #3**；dsh 版本检测靠 argv 上探 + APPDATA 硬编码（已因 path bug 失效一半）；构建无断言无门禁。

## 三、六维度横向小结

| 维度 | dsh-rewind | dsh-turn-rewind | DSH-EasyRewrite |
| --- | --- | --- | --- |
| 代码质量 | ★★★★（strict 全开，巨文件） | ★★★★★（最严 TS，超大文件） | ★★（无类型，实证 bug） |
| 模块设计 | ★★★（三层分离，HMR 违规） | ★★★★（引擎解耦，服务化最佳） | ★★（双巨石，闭包全局态） |
| 性能 | ★★★★（零子进程，全量读） | ★★★（有基准，spawn 爆炸） | ★★★（确认零 IO，渲染期重算） |
| 可维护性 | ★★★★★（测试即审计+CI 门禁） | ★★★★（注释典范，无台账） | ★★（文档漂移，测试残缺） |
| 错误处理 | ★★★★★（崩溃注入测试） | ★★★★（三件套完备，无分类） | ★★★（分类细，吞错多） |
| 扩展性 | ★★（深契约脆断） | ★★★★（零平台分支+服务复用） | ★★（dummy schema 违规） |

## 四、与前三轮调研的关系：结论再确认与增量

### 4.1 再确认（四项选型第四次实证）

fork 路线、整树快照、影子仓库隔离、按文件 fail-open 跳过——四项在竞品新版本上再次得到交叉验证：dsh-rewind 的 marker 三次改形史（0.9.x 迁移命令）继续为「不碰 harness 内部契约」付费；turn-rewind v2 把 blob 写进**用户仓库自己的 .git/objects**（hash-object -w，git-checkpoint.ts L201）且强依赖 git worktree 存在——反向证明我方独立 git-dir 零侵入路线的正确性。

### 4.2 本轮新增发现（前三轮未覆盖）

| # | 发现 | 来源 | 与现有计划关系 |
|---|---|---|---|
| 1 | **模型/思考挡位随行**：fork 出的新会话是全新 agent，无进程内选择，host 落到全局默认——撤回后用户选的模型/推理挡位静默丢失。解法：fork 前经 `modelDirectories.directoryFor(sessionId).store.getSnapshot().current` 捕获 `{provider, model, reasoningEffort}`，fork 后经 `directoryFor(sessionId).select(sel)` 写回（官方 selectModel 持久化通道） | EasyRewrite v2.1.1（client.src.js L3224-3255 + L855-889，已实地核验） | **全新，无对应 U 项**——建议并入 plan-competitor-ux 新增 U7 |
| 2 | **plan 会话绑定**：preview 后切换会话再 execute 的错位回退，我方现有防护（agentBusy 复查 + TREE 树指纹 + U5 的 preview TTL）均不覆盖「会话维度」 | turn-rewind engine.ts L492-558（确认码 + session 绑定 + TTL + 防重入四层中的会话层） | U5 的补充维度，实施 U5 时顺带 |
| 3 | verify:host 进 CI 的可行路径：把 33 个真实 `@deepseek-ai/*` 官方包装进 devDependencies | dsh-rewind（`check` 脚本已核验：typecheck+test+build+verify-host+pack dry-run） | 新增（我方 verify:host 依赖本机 dsh 不进 CI） |
| 4 | 竞品 bug 实证标本：无类型巨石的 var 遮蔽致 targetSeq 静默错位、path 未导入被吞、42% catch 静默——全部漏网到发布版 | EasyRewrite | 我方 TS 分层 + 四层门禁的正面佐证 |
| 5 | 每脏文件一次 spawn 是 git-native 路线的性能陷阱；读路径全量校验五处调用点放大成本 | turn-rewind git-checkpoint.ts L201 / engine.ts 五处 | 若未来引入 git-native 优化须 `--stdin-paths` 批处理 + 分级校验 |

### 4.3 与第三轮（plan-competitor-ux）的重合标注

- crash-safety 测试（本轮 P2）= **U3**，本轮补充证据：dsh-rewind 的 crash 注入测试达 26KB，覆盖 journaled restore 三态机——U3 的「先核对现有覆盖再补缺口」路径不变，佐证其「纯收益随时可做」的优先级。
- preview TTL（本轮 plan 时效建议）= **U5**，本轮增量：在 TTL 之上补「会话绑定」维度（4.2 #2）。
- 版本翻页器 = **U6 调研态**，本轮补充：EasyRewrite 的翻页器实现质量一般（渲染期 O(N²) 重算、归档交换靠 200ms×40 轮询确认），但其「官方 parentId 派生 + unarchive 恢复 + 轮询确认后归档其余」证明**官方存在恢复归档会话的 API**（unarchive）——对 U6 前置探针是利好信号，仍须探针实证。
- 惰性提交/草稿保护 = **U1**，本轮补充：EasyRewrite「确认只写 localStorage、发送时才真正截断」的**服务端零预留状态**设计值得 U1 参考（中途退出天然零残留，无状态可回滚）。

## 五、引入建议（按优先级）

### P1 —— 模型/思考挡位随行（建议立项 U7）

**问题**：撤回 fork 后新会话丢失模型/推理挡位选择，回落全局默认——我方真实未解问题，且用户无感知（静默丢失）。
**方案**：照 EasyRewrite 双通道——fork 前捕获（`modelDirectories` snapshot 的 `current`），fork 后 apply（`directoryFor(sessionId).select(sel)`），失败降级为默认发送不阻塞主流程。
**落点**：`src/client/recall-node.ts` fork 链；**硬前置**：按合规清单 #8 先加探针条目核验 `modelDirectories` 服务字段（`.d.ts` 第一手），结论进 compat-audit 台账。
**量级**：小（约 40 行 + 探针 + 单测）。

### P2 —— plan 会话绑定（随 U5 实施）

execute 增加 sessionId 比对：preview 时记录所属会话，execute 时请求方会话不匹配 → 返回 STALE（复用既有错误码与 client 自动重拉闭环）。落点 `src/host/routes-core.ts`，约 15 行 + 单测。

### P2 —— crash-safety 测试（= U3，佐证优先级）

dsh-rewind 26KB crash 注入测试为本轮新证据；U3 原案「先核对现有覆盖、只补缺口」路径不变。

### P3 —— verify:host 进 CI（等 0.1.3 正式线再评估）

dsh-rewind 证明可行（官方包进 devDeps + CI 跑真装配）。代价：devDeps 体积 + dsh 版本追齐成本；0.1.3-alpha 线包未全发布，等正式线。

### P3 —— 大仓库性能基准文档化

turn-rewind 有 15.5k 文件实测基准（clean 2.00s / warm 3.88s）；我方 `git add -A` 全量快照成本从未量化。建议 docs 补基准（1k/10k/50k 文件的单次快照耗时、磁盘增长曲线），为未来 clean 路径优化提供决策基线。

### 方向性参考 —— 零平台分支（长期，不近期动）

turn-rewind 纯 Node fs + git CLI（child_process 直调 git）消除双脚本模板——我方 I14-I27 约一半坑位（PS 5.1 BOM、GBK stdin、循环语法差异）根源在此。但迁移 = 重写 runShell 基建与 13 个 host 模块命令路径，现有 stdin 单进程方案已稳定。记录为长期演进方向。

## 六、规避清单（缺点 → 我方现状对照）

| 竞品缺点 | 依据 | 我方现状与结论 |
| --- | --- | --- |
| surfaceOp 深契约就地回退 | marker 三次改形、0.9.x 需迁移命令 | **fork 路线正确性第四次确认**，不跟进 |
| 单文件巨石 + 无类型 | var 遮蔽 targetSeq 错位、path 未导入、死代码均漏网发布版 | 坚持 TS 分层 + typecheck 门禁 + 800 行红线 |
| fail-closed 硬限制 | turn-rewind >16MB 抛错致整区不可用 | SNAP_SKIP 跳过+反馈的 fail-open 保持 |
| 读路径全量校验 + 每脏文件一 spawn | turn-rewind verify 五处全量、hash-object 逐文件 | 引入 git-native 时必须批处理 + 分级校验 |
| host 模块级可变状态（HMR 违规） | dsh-rewind 3 处、EasyRewrite 6+ 处 | ctx 绑定工厂模式是正确纪律，新模块延续 |
| 文档漂移 | 三项目实证（版本三处不一致/幽灵端点/已删实现描述） | 「行为变更同步文档」+ check:dsh 巡检每次发布坚持执行 |
| localStorage 设置 + dummy schema | EasyRewrite 违反官方 #3 | Schemastery 活 schema 合规，不走回头路 |
| 双版本线硬分叉 | EasyRewrite 两次大规模重构自证 | compat-audit 台账 + check:upgrade 收敛路线正确 |
| 版本家族 localStorage 双源状态 | EasyRewrite 本地派生 vs 官方 parentId（U6 已钉：以 host lineage.json 为单一事实源） | U6 立项前提不变 |

## 七、定位结论

三个竞品恰好从我方路线的三个侧面提供交叉验证：**dsh-rewind 证明 fork 优于 surfaceOp 深契约；dsh-turn-rewind 证明独立 git-dir 优于侵入用户 .git/objects；EasyRewrite 与我方同走归档+fork 路线，但发现了「模型随行」这个我方漏掉的真实问题**。综合看，我方技术路线与工程纪律在四项目中整体最优，主要缺口是 P1 模型随行（建议 U7）与 P2 plan 会话绑定（随 U5）两个具体功能点。

---

## 附：关键论断核验记录（2026-09-09 实地抽查）

| 论断 | 核验方式 | 结果 |
|---|---|---|
| EasyRewrite 模型随行真实存在且工程质量高 | Read client.src.js L855-889 / L3220-3255 | ✅ 捕获/apply 双通道 + 注释完整（「官方 selectModel 持久化通道，即用户手动切换的同款路径」） |
| turn-rewind 零平台分支 | Grep `pwsh\|powershell\|process\.platform\|win32` 全 src/ | ✅ 仅 1 处命中（store.ts L1311 机器 GUID 探测，reg query） |
| dsh-rewind verify-host 进 CI | Read .github/workflows/ci.yml + Grep package.json scripts | ✅ `check` = typecheck + test + build + verify-host + pack dry-run，CI 直接跑 `npm run check` |
| 三竞品版本号 | Read 各 package.json version | ✅ 0.10.0-alpha.1 / 0.2.2 / 2.4.1 |
