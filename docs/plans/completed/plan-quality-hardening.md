# rewind 专项加固实施计划（A1–A8）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已实施并验收（2026-09-30 归档）**——A1–A8 八项全部落地并过门禁（typecheck / 单测 478 / client 组件测试 83 / verify:host），活体冒烟第九节 R-1〜R-6 全过（含实弹掘出并修复的 4 个真实缺陷，见「活体冒烟」节）
> 驱动输入：2026-09-29 dsh-rewind 专项六维度对比评估（结论摘要见「背景与实测基线」）；前序研究见 [../research-competitors-2026-09.md](../research-competitors-2026-09.md) 与 [../pending/plan-competitor-ux.md](../pending/plan-competitor-ux.md)（其 U4 由本计划 A2 吸收）。

本计划把 rewind 对比评估的八条引入建议落成可执行任务：client UI 测试体系（A1）、操作意图 journal 崩溃恢复（A2）、磁盘格式版本守卫（A3）、i18n 双语层（A4）、client 命名空间 logger（A5）、`noUncheckedIndexedAccess`（A6）、磁盘格式 spec 文档（A7）、catch 理由注释纪律（A8）。八项分四波推进，波次内有序、波次间依赖见总览表；每项含改动落点、任务分解、验收标准与风险回退，可独立实施、独立发版。最高性价比子集为 A6+A8+A5+A1——以最小成本堵住「client 零测试、索引越界隐患、现场无诊断日志」三个最实际的洞。

## 背景与实测基线

dsh-rewind（v0.15.0-beta.2）与本项目目标相同、路线不同：它走「写前备份检查点 + append-only 会话遮蔽」，零子进程零依赖；本项目走「影子 git 快照 + sessions.fork」，全覆盖但持续付 git 进程与 gc 治理成本。对比结论：rewind 强在崩溃安全架构、client 测试与产品化文档，本项目强在代码规模纪律、错误治理体系与宿主兼容性——本计划只引入前者所长，不动摇后者。

方案依据以下实测（2026-09-29 于本仓库执行），非估计：

| 实测项 | 结果 | 影响的方案 |
|---|---|---|
| 现有测试框架 | vitest 4 已在用（`package.json` scripts/devDeps） | A1 零新框架，只补 jsdom 与 react devDeps |
| `tsc --noUncheckedIndexedAccess` 全量错误 | 仅 14 处（store.ts 5、index.ts/snapshots.ts 各 2、config-card/recall-node/util/config/exclude-patterns 各 1） | A6 量级 S，进第一波 |
| client 裸 `console.*` | 仅 5 处（app.ts 3、recall-node.ts 2） | A5 rollout 极小 |
| client 错误文案来源 | 直接渲染 host 下发的 `res.message`（config-card.ts 等 7 处） | A4 必须双层：client 字典 + host 文案键控化 |
| `writeTextViaShell` 原子性 | tmp+rename，含并发写者容忍（store.ts L783–798） | A2/A3 落盘接缝现成 |
| status 最近错误 payload | 展开 `ErrorRecord` 含 `kind`（routes-core.ts L213–217） | A4 按 kind 键控渲染成立 |
| shell 读命令契约 | 仅三个特化 ReadCmd，形态统一 `cat <f> 2>/dev/null || true`（scripts.posix.ts L566–586） | A2/A3 需新增通用 `fileReadCmd`（见 A3） |
| host 构建入口 | `scripts/build-host.mjs` HOST_ENTRIES 硬编码 15 项 | A2 新模块须同步三处（见 A2 任务 4） |

## 与既有计划的汇合

本计划三项内容与既有 pending 计划交汇，实施时按本节定界，避免双头记账：

- **A7 提前实施 [plan-p2.md](../pending/plan-p2.md) P2-2 的 FORMAT 半**并扩范围（追加 intent journal、format marker、各 stamp 文件的格式说明）；P2-2 的 SECURITY 半（威胁模型审视）不在本计划范围，仍留 P2-2。
- **A2 吸收 [plan-competitor-ux.md](../pending/plan-competitor-ux.md) U4（还原过程 journal 留痕）**：U4 诉求是「救援失败时知道恢复到哪一步」，A2 的 intent journal 记录 phase 与安全快照 tag，天然覆盖——rescue 失败提示附 intent 文件路径即完成 U4 验收语义，且写失败 `recordError` 告警、不阻断主流程两条纪律沿用 U4 原文。
- **A1 与 U3（crash-safety 测试）分域不重叠**：U3 是 host 侧崩溃场景单测，A1 是 client 组件测试；A2 的 intent-journal 单测与 U3 同族，未来可并入同一 crash-safety 测试族。

文档同步义务（随实施完成）：`improvement-plan.md` 索引状态、plan-p2 P2-2 标注、plan-competitor-ux U4 标注、`docs/README.md` 目录树（A7 产出 `docs/format.md` 时）。

## 总览

| 项 | 内容 | 波次 | 量级 | 依赖 |
|---|---|---|---|---|
| A6 | 开启 `noUncheckedIndexedAccess` | 一（质量基建） | S（~0.5–1 天） | 无 |
| A8 | catch 理由注释纪律 + 全量审计 | 一 | S（~1 天） | 无 |
| A5 | client 命名空间 logger | 一 | S（~0.5–1 天） | 无 |
| A3 | 磁盘格式版本守卫 + 通用 `fileReadCmd` | 二（数据安全） | M（~2–3 天） | 无 |
| A2 | 操作意图 journal 崩溃恢复（吸收 U4） | 二 | L（~4–6 天） | A3 的 `fileReadCmd` |
| A7 | `docs/format.md` 磁盘格式 spec | 二 | S–M（~1–2 天） | A3/A2 落地后动笔 |
| A1 | client UI 测试体系（vitest+jsdom） | 三（测试基建） | L（~4–6 天） | A5（helpers 的 spyLogger） |
| A4 | i18n 双语层 | 四 | L（~4–6 天） | A1（测试网兜底文案替换） |

---

## A6. 开启 `noUncheckedIndexedAccess`

### 目标

编译期堵住索引越界：消除 `list.get(...)!.push` 类非空断言（现状如 [maintenance.ts](../../../src/host/maintenance.ts) L56），开启 flag 后由 CI 既有 typecheck 步骤自动成门禁。

### 改动落点

- [tsconfig.json](../../../tsconfig.json)：加 `"noUncheckedIndexedAccess": true`。
- 14 处错误修复：store.ts 5、index.ts 2、snapshots.ts 2、config-card.ts / recall-node.ts / util.ts / config.ts / exclude-patterns.ts 各 1。复核命令见附录。

### 任务分解

1. 逐处修复，修法按语义二选一：索引结果先落局部 const 显式判空（多数情形）；`Map.get()!.push` 改为「get ?? set 新数组」守卫。
2. 顺带清理无注释的既有非空断言（maintenance.ts L56）；[index.ts](../../../src/host/index.ts) L454 与 [routes-core.ts](../../../src/host/routes-core.ts) L52 的 `store!` 已有动机注释、语义正确，保留。
3. 开启 flag；不连带开 `noUnusedLocals` 等其他 flag（一次一个变量）。
4. 边界行为有变的单测同步修。

### 验收标准

- flag 开启下 `npm run typecheck` 零错误；`npm test` 全绿。

### 风险与回退

- 风险低：纯编译期收紧，运行时行为仅在原断言会炸的路径变显式守卫。回退 = 撤 flag 与修复提交。

---

## A8. catch 理由注释纪律

### 目标

把 rewind「空 catch 必附理由」的纪律成文化：全 src 约 143 处 catch（host 99 + client 44，2026-09-29 实测）逐一有据可查，新增代码由 review 拦截无注释 catch。

### 改动落点

- [CODEBUDDY.md](../../../CODEBUDDY.md) §协作流程-6 代码规范：追加一条规约。
- 143 处 catch 的一次性审计与补注（host 优先）。

### 任务分解

1. 规约入档：「catch 必须附降级理由——为什么吞、为何安全、后续谁兜底；空 catch 需行内注释。review 时无注释的 catch 一律打回」。
2. 审计：逐处过目，缺注释的补「为什么」；重点嫌疑区为 client 44 处（此前无此纪律）与 store.ts 16 处。
3. 审计中发现的真问题（吞错 + 无 recordError + 无注释）单独开 fix 提交，不混入注释补注提交。
4. 不加 CI 启发式门禁（注释存在性检查误报高；纪律靠规约 + review，与 rewind 一致）。

### 验收标准

- 规约落地 CODEBUDDY.md；审计清单内每处 catch 有注释或已开对应修复项。

### 风险与回退

- 风险近零（纯注释）；唯一注意是注释补注与行为修复分开提交，保持历史可读。

---

## A5. client 命名空间 logger

### 目标

替代 client 裸 `console.*`（仅 5 处）：error/warn 恒输出，info/debug 由 `localStorage` 开关按命名空间过滤——用户现场排查只需控制台贴一行命令，无需重启。对齐 rewind `client/log.ts` 设计。

### 改动落点

- 新建 [src/client/log.ts](../../../src/client/log.ts)（~70 行，纯模块级导出，符合 client「纯函数模块级 + 有状态工厂」两分惯例）。
- 替换 [app.ts](../../../src/client/app.ts) L79/L98/L112 与 [recall-node.ts](../../../src/client/recall-node.ts) 2 处 `console.*`。
- CODEBUDDY.md §6 规约追加：client 新代码一律走 log.ts，禁裸 console。

### 任务分解

1. `createLogger(ns)` 返回 `{ error, warn, info, debug }`，前缀 `[dsh-recall:<ns>]`。
2. info/debug 读取 `localStorage['dsh-recall.debug']`（值 `*` 或逗号分隔命名空间），**每次调用重读**——改开关即生效；localStorage 读取整体 try/catch（隐私模式/测试环境不可用时静默降级为只出 error/warn）。
3. 替换 5 处调用点，命名空间取 `app` / `recall-node`。
4. A1 落地时在 tests/client/helpers.ts 加 `spyLogger()` 供测试断言日志输出。

### 验收标准

- 5 处替换完成；实弹验证 `localStorage.setItem('dsh-recall.debug','*')` 后 info 级输出可见、删除后隐藏。

### 风险与回退

- 风险近零：error/warn 行为不变，仅新增 info/debug 通道。回退 = 恢复 5 处 console 调用。

---

## A3. 磁盘格式版本守卫 + 通用 fileReadCmd

### 目标

补「新读旧」防线：现有兼容纪律是「读取侧字段全部可选化」（[payloads.ts](../../../src/types/payloads.ts) 头注释），只解决旧版插件读新格式；降级安装读到更高版本格式时行为未定义。引入 rewind 式 per-store `format` marker，高版本/损坏**拒写放行读**（fail-closed，宁停勿混）。同项交付通用 `fileReadCmd`——A2 及未来的任意小文件读取都走它，不再为每个文件加特化 ReadCmd。

### 改动落点

- [src/types/scripts.ts](../../../src/types/scripts.ts)：契约加 `fileReadCmd(file: string): string`；[scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) 与 [scripts.posix.ts](../../../src/host/scripts.posix.ts) 双平台同名实现（形态对齐既有 ReadCmd：`cat`/`Get-Content` + 缺席静默）。
- [snapshots.ts](../../../src/host/snapshots.ts)：加 `readStoreFormat` / `stampStoreFormat` / `guardStoreFormat` 三个内部函数（该文件有效行 ~506，+70 仍在 700 预警线内）。
- `tests/unit/store-format.test.js`（新建，~12 例）；scripts-contract 单测随契约自动钉同名导出。

### 任务分解

1. `fileReadCmd` 三处同步（契约 + 双平台），返回文件全文、缺席返回空串（与既有 ReadCmd 同语义）。
2. marker 语义：`SUPPORTED_FORMAT = 1`；`store.dir/format` 缺席视为 1；内容非整数或不可读按损坏处理。
3. `stampStoreFormat`：补戳挂在 saveIndex 写入路径（每次 index 落盘顺带确认 marker，缺席才写，稳态零额外进程）；`ensureGit` 建库后的首次 index 写入自然覆盖。原子写走 `writeTextViaShell`。
4. `guardStoreFormat` 挂三入口：`loadIndex` / `recordLineage` / `captureSnapshot`。值 > SUPPORTED 或损坏 → capture/saveIndex/recordLineage/purge 全部短路 + `recordError`（fail-loud）；manage list/status 等只读路径不受影响；maintenance 的 gc/retention 经 purge/saveIndex 进入 guard，拒写时按既有 recordError 路径表面化、不中断宿主。读 marker 带短时缓存（对齐 index.ts 既有 `*Cache` 先例），避免每快照一次进程。
5. CODEBUDDY.md 存储布局节补 `format` 行。

### 验收标准

- 单测覆盖五分支（缺席 / 1 / 2 / garbage / 不可读）× 读写放行矩阵，全绿。
- 手工放置 `format=99`：快照与撤回拒写、最近错误有提示，列表仍可读。

### 风险与回退

- 拒写是新增的可观察行为：guard 误判会把正常 store 锁死。防线是单测五分支 + 缓存只缓 affirmative 结果（读到 1 才缓存，读失败每次重试）。回退 = guard 改为仅告警不拒写（一个布尔开关的位置预留）。

---

## A2. 操作意图 journal 崩溃恢复（吸收 U4）

### 目标

堵 execute 的崩溃窗口：both 分支「安全快照 → rollbackFor → rescue」链（[routes-core.ts](../../../src/host/routes-core.ts) L167–189）中途断电时，安全快照 tag 已在磁盘但无任何记录指向它——用户不知道工作区可能半回退，也不知道救援 tag 存在。引入 rewind 式 intent journal：**先落意图再动磁盘，启动预热时续做**。同时吸收 U4 留痕职能：rescue 失败提示附 intent 文件路径，用户可精确知道中断点。

### 改动落点

- 新建 [src/host/intent-journal.ts](../../../src/host/intent-journal.ts)（~150 行独立域模块，避免给 777 行的 snapshots.ts 加压）：`createIntentJournal(deps)` 返回 `{ begin, advance, clear, read, recover }`。
- routes-core.ts execute both 分支插三针；[index.ts](../../../src/host/index.ts) 预热链（L448–459）挂 `recover`。
- [payloads.ts](../../../src/types/payloads.ts) 加 `RecallIntent` 接口（读取侧字段可选化纪律同现有）。
- `tests/unit/intent-journal.test.js`（新建，~15 例）。

### 任务分解

1. 意图形状：`{ v: 1, op: 'execute', messageId, root, safetyId, safetyOk, phase: 'rollback' | 'rescue', time }`，落盘 `store.dir/recall-intent.json`（writeTextViaShell 原子写；读走 A3 的 `fileReadCmd`）。
2. execute 三针：安全快照后 `begin`（记 safetyId/safetyOk，phase `'rollback'`）；`rolled.ok` 后 `clear`；rescue 前 `advance('rescue')`，rescue 无论成败 `clear`（rescue 失败已有手动命令逃生门，提示中附 intent 路径——U4 验收语义）。journal 写失败 `recordError` 告警，不阻断主流程（U4 纪律沿用）。
3. `recover(store)` 双挂载点：预热链 rebuildOrphans 之后 + init 端点 loadIndex 之后（预热有 shellReady 放弃分支，init 是每会话必经通道；state 记已恢复 root 去重，两路幂等）。判定顺序：
   - 无 journal → 空操作。
   - 有 journal → **先幂等判定再动作**：对工作区与目标 `snap-<messageId>` tag 走既有 diff 机制——一致说明回退实际已完成（clear 失败留下的残留 journal），仅 `clear` 不 reset；不一致才进入救援判定。
   - 需救援且 safety tag 存在 → 先过 agentBusy 护栏（与 execute P0-1 同理；忙则 recordError 并延后到下次 init），闲则自动 reset 到 `snap-pre-rollback-<ts>`（复用 H1 救援的 reset 路径）→ `clear` + `recordError('recovered interrupted rollback …')`。
   - 需救援但 safety tag 缺失 → 保留 journal + recordError（fail-loud 不静默），下次启动重试。
4. **构建三同步**：`scripts/build-host.mjs` HOST_ENTRIES 加 `'intent-journal'`（15→16）；`tests/unit/package-layout.test.js` required 列表加 `'lib/intent-journal.js'`；CODEBUDDY.md「15 个 host 产物」表述改 16。顺带修 ci.yml L33 注释「host 13 产物」的既有漂移。
5. session-only 短路径不接 journal（零文件写，无需）。
6. 冒烟清单追加一节：execute 进行中杀宿主进程 → 重启 → 工作区被救回安全快照 + 最近错误有记录。

### 验收标准

- 单测：begin/advance/clear 往返、recover 各分支（含「回退已完成但 clear 失败」残留 journal 仅 clear 不 reset、agentBusy 忙时延后）、原子写损坏按无处理，全绿。
- 冒烟「杀进程恢复」通过；`npm run verify:host` 绿（端点面不变）。

### 风险与回退

- 双实例并发（M3 心跳只管清扫让路）：两宿主同时 execute 同一 store 已由 git index.lock 串行化，recover 与 H1 rescue 同语义，不引入新竞态。
- **stale journal 误救援**：回退成功但 clear 失败会留下 phase `'rollback'` 的残留 journal，不加判定直接 reset 会把已完成的回退撤销回安全快照——recover 必须先做幂等判定（任务 3），该路径由单测钉死。
- recover 自动改工作区是新行为：它执行的 reset 目标（安全快照）是崩溃前用户已确认回退的同一状态集的近似——比「半回退现场无人知晓」严格更好；冒烟覆盖该路径。回退 = recover 降级为仅 recordError 提示（保留 journal 落盘，去掉自动 reset）。

---

## A7. docs/format.md 磁盘格式 spec（提前实施 P2-2 FORMAT 半）

### 目标

把只存在于代码与 CODEBUDDY.md 叙述中的磁盘格式固化为 spec，对齐 rewind `docs/format.md` 的「代码是事实源；代码与本文件漂移时，漂移即 bug——改格式必须同 PR 改本文件」约定。文件名按 docs/README.md 索引登记用 `docs/format.md`。

### 改动落点

- 新建 [docs/format.md](../../format.md)（docs/ 根，长期事实文档）。
- CODEBUDDY.md 存储布局节改摘要 + 指向 format.md；docs/README.md 目录树登记；README 双语各加一条链接（沿用 P2-2 任务 3）。

### 任务分解

1. 章节：存储布局总览（home/降级两态）→ tag 命名（`snap-<消息ID>` / `snap-pre-rollback-<ts>`）→ index.json（`IndexEntry` + feedback 联合 + 原子写 + `.corrupt-<ts>` 隔离）→ lineage.json（损坏按无处理，与 index 的 fail-loud 语义差是有意设计）→ root.txt / heartbeat / gc.stamp / attrs-v1.stamp / exclude.txt → `format` marker（A3）与 `recall-intent.json`（A2）→ 兼容纪律（读取侧字段可选化、未知字段忽略、高版本拒写）。
2. 文件头写死漂移即 bug 约定。
3. 格式形状继续由 snapshots-persist.test.js 钉运行时，文档与单测互证；不加 doc-drift 门禁（过度工程）。

### 验收标准

- spec 覆盖存储布局全部文件（含 A2/A3 新增）；CODEBUDDY.md 无重复叙述；docs/README.md 树同步。

### 风险与回退

- 纯文档，风险近零。注意与 P2-2 的边界：SECURITY 半不在本项，plan-p2 P2-2 标注「FORMAT 半已提前」。

---

## A1. client UI 测试体系（vitest + jsdom）

### 目标

堵「client React UI 零测试覆盖」这一最大盲区：确认面板主链、快照管理删除流、配置/排除卡片错误路径进 CI。vitest 4 已在用，零新框架。

### 改动落点

- [package.json](../../../package.json)：devDeps 加 `jsdom`、`react@^18.3.1`、`react-dom@^18.3.1`、`@types/react-dom`；scripts 加 `"test:client": "vitest run --config vitest.client.config.ts"`。
- 新建 `vitest.client.config.ts`（environment jsdom，include `tests/client/**/*.test.ts`，与 unit 的 node 环境隔离）。
- [tsconfig.json](../../../tsconfig.json) include 追加 `tests/client/**/*`。
- 新建 `tests/client/helpers.ts` + 四个测试文件（下表）；[ci.yml](../../../.github/workflows/ci.yml) 在 `npm test` 后加 `npm run test:client` 步骤。

### 任务分解

1. helpers.ts：`renderIntoDocument(element)`（createRoot + `act`——`act` 取自 react 18.3 导出，目标版本无该导出则退回 `react-dom/test-utils`，二选一实现时定；置 `globalThis.IS_REACT_ACT_ENVIRONMENT = true`）、`stubSessions/stubWorkspaces/stubUiWorkspace` 工厂、`stubFetch(routes)`（按 `/api/recall/<name>` 分派应答）、`spyLogger()`（A5 落地后补）。
2. 测试目标（优先级降序，起步 ~53 例）：
   - `recall-node.test.ts`（~20 例）：preview→confirm→execute 链、STALE 自动重拉（recall-node.ts L567）、cutSeq 为 null 不出 scope 选项、refillDraft 关闭行为。
   - `snapshot-manager.test.ts`（~15 例）：lineage 聚族渲染、三级删除确认流、PARTIAL_DELETE 展示。
   - `config-card.test.ts`（~10 例）：读取/保存/恢复默认三错误路径。
   - `exclude-card.test.ts`（~8 例）：列表拉取失败、快捷模式追加。
3. **测试写作规约**（为 A4 让路）：断言行为与结构（className、aria、调用次数、fetch 载荷），不断言中文案字面量。
4. 不 import entry.ts（`__ModuleLoader__` 全局，jsdom 无此物）；组件经工厂注入 stub 服务渲染（buildRecallNode 等工厂签名现成支持）。
5. CODEBUDDY.md 测试分层段补「client 组件测试（jsdom）」层。

### 验收标准

- `npm run test:client` ≥50 例全绿并进 CI；stub fetch 断言到 execute 请求载荷含 `previewTreeId`。

### 风险与回退

- jsdom 与官方渲染管线有差距：slot 注册、会话服务全部 stub，测试的是组件逻辑不是宿主集成——宿主集成仍归 verify:host 与冒烟，分工不变。
- react/react-dom 进 devDeps 后注意 peer 声明不动（运行时 react 仍由宿主 loader 提供）。回退 = 移除 config 与目录，零源码侵入。

---

## A4. i18n 双语层

### 目标

client 全部用户可见文案双语化（zh 事实源 + en），host 下发文案键控化。须在 A1 之后做——测试网兜底大规模文案替换。

### 改动落点

- 新建 [src/client/locales/](../../../src/client/locales)（`zh.ts` + `en.ts` + `index.ts` 三文件，规避单文件膨胀）。
- client 六模块滚动替换（recall-node → snapshot-manager → config-card/exclude-card/settings-cards → util），预估 ~200 keys。
- [config.ts](../../../src/host/config.ts)：第 10 字段 `locale: 'auto' | 'zh' | 'en'`（默认 auto）——schema 与 DEFAULTS 两处同步（项目铁律）。
- [src/types/api.ts](../../../src/types/api.ts)：`InitNotice` 与 `SnapshotInfoResponse` 加 `artifactSeg?: string`，`InitResponse` 的 config 子集类型加 `locale`。
- [routes-core.ts](../../../src/host/routes-core.ts)：init 响应 config 子集（L70）带 locale；两处响应下发 `artifactSeg`。
- cordis.patch.yml **无需改动**（config 按行覆盖、非全量枚举，locale 默认 auto 随 schema 下发即可）；README 双语配置表登记 locale 字段。
- `tests/unit/locales-parity.test.js`（新建）。

### 任务分解

1. 字典层：key 用语义 ID（`'recall.confirm.title'`），zh 为事实源；`t(key, params?)` 支持 `{name}` 插值；key 缺失回落 zh 原文。parity 测试钉两语言 key 集合相等、无空值、`{placeholder}` 集合一致。
2. host 文案键控化（host 侧零文案改动，旧 client 与 API 直调不受影响）：
   - 错误响应：client 按 `code` 查字典（18 个错误码即 key 空间，errors.ts 单一事实源），字典无此 code 回落 host `message`。
   - status 最近错误：payload 已带 `kind`，client 按 kind 渲染字典文案，host `hint` 仅作回落。
   - `buildRootNotice`：host 追加 `artifactSeg` 字段，旧中文字段保留一个版本周期；client 优先按 `artifactSeg` 本地渲染。
3. locale 解析：auto → `navigator.language` 前缀判 zh；config-card 加语言下拉（自身文案走字典）。
4. 分模块滚动替换，每模块一个提交。

**v1 明示限制**（写进 README）：Config schema 的 `.description()` 保持中文——它由宿主官方设置表单在 host 侧渲染，插件无法本地化；自定义配置卡片不受影响。

### 验收标准

- parity 测试绿；`locale=en` 下撤回全链英文（toast/面板/卡片/错误码/最近错误 hint）；A1 组件测试不因语言切换变红（规约已禁字面量断言）。

### 风险与回退

- 替换期漏 key 导致界面露语义 ID：`t()` 缺失回落 zh 原文兜底 + parity 测试防两语言漂移，但「代码里有 key、字典没有」需靠替换期逐模块自查；可在 parity 测试加一条「src 扫描 t() 调用 key 全在字典」的静态断言（实现简单则加，否则人工清单）。
- 回退 = locale 固定 zh（字典 zh 即现状文案，行为等价）。

---

## 实施记录（2026-09-30）

按波次自 A6 起逐项实施，各项过 typecheck / build / test（+ 涉装配跑 verify:host）后落此记录；差异与延后项逐条列出。

| 项 | 状态 | 落地与验证 | 与计划的差异 |
|---|---|---|---|
| A6 | 已实施 | tsconfig 开 `noUncheckedIndexedAccess`；14 处错误修复 + 清理无注释非空断言（maintenance / routes-manage / store / snapshots / util 的 `get(...)!` 与迭代器断言）；typecheck/build/test 全绿 | 超出计划点名的 maintenance.ts L56：同类无注释断言一并清理；snapshots 的 `store!` 经 typecheck 证实冗余后直接删除 |
| A8 | 已实施 | CODEBUDDY.md §协作流程-6 增「catch 必须附降级理由」规约；全 src 143 处 catch 审计（host 99 + client 44），缺理由处补注（host 全量 + client 29 处）；scripts 模板内的 PS `catch {}` 由函数头注释覆盖 | 未发现「吞错 + 无 recordError + 无注释」的真问题，无独立 fix 项；不设 CI 门禁（按计划） |
| A5 | 已实施 | 新建 `src/client/log.ts`（createLogger / appLog / recallNodeLog）；替换 5 处裸 console；app 装配完成补一行 info（现场确认 client 半是否 apply 过）；规约与文件地图登记 | info 级实弹验证落到 A1 的 `tests/client/log.test.ts`（jsdom 下 localStorage 开关矩阵），活体冒烟不再单列 |
| A3 | 已实施 | 契约加 `fileReadCmd`（双平台 + types + scripts-contract 自动覆盖）；`judgeStoreFormat` 纯逻辑 + `readStoreFormat/stampStoreFormat/guardStoreFormat` 工厂函数（30s 确认缓存、拒写不缓存、补戳挂 saveIndex）；守卫挂 capture/loadIndex/saveIndex/recordLineage + execute + maintenance 三处 purge + manage 三处删除；新增 `FORMAT_BLOCKED` 错误码（errors.ts/ALL_CODES/errors.test 同步 + client CODE_TEXT） | 计划写「挂三入口」；实际按「一切写路径」布点（tag 清理必须先行守卫，否则会留下「tag 删了、索引写被拒」的失配态）；高版本与 safety 缺失两类告警均按 5min 节流 |
| A2 | 已实施 | 新建 `src/host/intent-journal.ts`（begin/advance/clear/read/file/recover）；execute 三针；recover 双挂载（启动预热 + init，A3 拒写态跳过）；幂等判定复用 diffFor、复位复用 rescueScript+RESCUE_OK、护栏复用 agentBusy；构建三同步（build-host 16 入口、package-layout required、CODEBUDDY 产物数）+ ci.yml 注释漂移修正 | 「safety tag 存在性」用 `safetyOk` 判据等价实现（safetyOk=false 即无救援点；手工删 tag 走 reset 失败分支），省一条额外读命令；rescue 后无论成败 clear（按计划），提示附意图文件路径满足 U4 |
| A7 | 已实施 | 新建 `docs/format.md`（逐文件格式 + 版本与兼容纪律 + 源码/单测映射折叠节）；CODEBUDDY.md 存储布局节改摘要 + 指针；docs/README.md 树与归类表同步（security.md 仍属 P2-2）；README 双语各加一条链接；plan-p2 P2-2 标注改「已实施」 | 无 |
| A1 | 已实施 | devDeps + `vitest.client.config.ts` + tsconfig include + `npm run test:client` + CI 步骤；`tests/client/` helpers（renderIntoDocument/stubFetch/服务桩/spyLogger/qid/first）+ 5 个测试文件 79 例（recall-node 25 / snapshot-manager 17 / config-card 17 / exclude-card 13 / log 7） | 计划 4 个文件 ~53 例；实际多出 `log.test.ts`（承接 A5 验收）并把总量做到 79 例。测试写作中两条经验：jsdom 的 `#id` 选择器在多实例同 id 时被 getElementById 短路（用 `qid` 属性选择器）；`refresh(overLimit?)` 直接挂 onClick 会把事件对象当参数（见下） |
| A4 | 已实施 | 新建 `src/client/locales/`（zh 事实源 + en + index：`t`/`translate`/`resolveLocale`/`hasTranslation`/`zhTranslate`）；client 六模块（recall-node / snapshot-manager / config-card / exclude-card / settings-cards / util）文案全量键控化（190 key）；host 键控化（`err.*` 按 code、最近错误按 kind、init/snapshot-info 下发 `artifactSeg`，旧 `buildRootNotice`/`notice` 中文字段保留）；`locale` 第 10 字段（schema union 三值 + DEFAULTS + createConfig + config-get/set 白名单 + init config 子集）+ 配置卡片「界面」分组语言下拉（新增 `.dsh-recall-cfg-select` 样式，接入既有 focus/hover/disabled 规则）；`tests/unit/locales-parity.test.js`（parity + 字面量 key 静态扫描 + 兜底链）、`tests/client/i18n.test.ts`（zh/en 渲染链 + 下拉保存载荷）；README 双语配置表 + 「界面语言」节（v1 限制）；errors.ts/exclude-patterns.ts 注释同步 | ① `err.*` 只收 host 文案**静态**的 14 个码；`ROLLBACK_FAILED`/`BAD_TYPE`/`SETTINGS_WRITE_FAILED`/`PARTIAL_DELETE`/`ERROR` 有意不设条目、回落 host message（保住救援结果与手动命令），该策略由 parity 测试钉死并写入 README——顺带修掉「回退失败一律显示四字通用文案」的既有信息丢失；② 模块级纯函数（`summaryText`/`buildTree`/`fileCardInfo`）加可选 `t` 参数、缺省 zh 词表，保住单测与无 util 调用点不因缺词表而崩；③ `KIND_INFO.label` 改 `labelKey`（client-pure 单测同步断言）；④ 静态扫描只对「词典域前缀」的字面量判漏配（官方 slot 键 `conversation.chat.node` 等同形状，不属词表）；⑤ 配置卡片语言下拉另开「界面」分组（原计划只说加下拉，未定分组）；⑥ `Schema.union` 经 schemastery 3.18.1（peer 下限）与 3.18.4 双版本核实存在，无需 feature-detect |

A1 期间发现并修复的真实缺陷（属测试网兜底收益，已并入本轮）：

- `snapshot-manager.ts` 的「刷新」按钮：`onClick: refresh` 把点击事件对象透传为 `overLimit`，`JSON.stringify` 事件（含 React fiber 循环引用）抛错，按钮整只失效。修复为 `onClick: () => refresh()` 并留注释钉住原因，`tests/client/snapshot-manager.test.ts` 有用例覆盖。

## 活体冒烟（2026-09-30，第九节 R-1〜R-6）

环境：dsh 0.2.0-rc.2 ｜ link 模式（`profiles/web` + 临时接线的 `headless`）｜ `D:\tmp\rw-smoke`（1500 文件 bulk 子树）与 `D:\tmp\rw-smoke2\target\debug` ｜ API 直调 + 内置浏览器实弹。六项全过，逐项证据见 [smoke-checklist.md](./smoke-checklist.md) 第九节与 [smoke-checklist-records.md](./smoke-checklist-records.md) 的 2026-09-30 节。

实弹掘出并当场修复的缺陷（4 个，均已补单测/文本钉并重跑门禁）：

1. **win32 缺席读取把格式守卫变成永久锁死（严重）**：`fileReadCmd` 的 `Get-Content -ErrorAction SilentlyContinue` 对缺失文件仍以退出码 1 收尾（pwsh / PS 5.1 双实测），runShell 的退出码门禁把它当失败抛出 → A3 守卫把「没有 marker」判成「标记损坏」，且补戳挂在被守卫拦住的 saveIndex 上 ⇒ 快照/撤回/列表载入全停且不可自愈。修复＝Test-Path 分支（与 POSIX `|| true` 同语义）；沉淀 compat-audit **I41** + `scripts-contract` 文本钉。
2. **预热 async IIFE 未接 catch，可在宿主退出期 fatal**：`dsh --profile headless --help` 实测 `fatal load failure: cannot get required service "sessions" in inactive context`。修复＝IIFE 整体吞异常。
3. **守卫读失败文案误报「内容非法」**：与「marker 内容损坏」合流会误导用户去翻一个没问题的文件。修复＝future / corrupt / unreadable 三分文案（单测钉读失败不得含「内容非法」）。
4. **i18n 三处失配（浏览器实弹）**：英文确认句拼接缺空格；语言切换后设置卡片的分区折叠头停旧语言（外壳文案在 ConfigForm 之外渲染）；保存提示用切换前语言。修复＝en 补句首空格、`onLocaleApplied` 回调驱动外壳重渲染、locale 补丁先落地再报成功；三处补进 `tests/client/i18n.test.ts` 并在浏览器复验通过。

遗留观察（既有问题，不在本计划范围）：撤回面板贴近输入框时按钮被官方 composer 遮挡点击不中；官方侧栏悬停卡驻留。

## 波次与依赖

发版版本号发版时确定（docs 规范），此处只定顺序与语义：

| 波次 | 内容 | 语义 | 工作量 |
|---|---|---|---|
| 一（质量基建） | A6 → A8 → A5 | patch 为主 | ~2–3 天 |
| 二（数据安全） | A3 → A2 → A7 | minor（新防护能力） | ~6–9 天 |
| 三（测试基建） | A1 | patch（不改行为） | ~4–6 天，可与波次二并行起 |
| 四（i18n） | A4 | minor | ~4–6 天，须晚于 A1 |

总估 16–24 个工作日。最高性价比子集 A6+A8+A5+A1（~7–9 天）。

## 全局流程要求

- 每项实施前过 CODEBUDDY.md 官方文档合规清单（尤其 #3 Config 新字段两处同步、#8 字段核验）。
- 本地工作流：`npm run typecheck` → `npm run build` → `npm test`（→ 涉装配跑 `verify:host`）→ 冒烟清单追加对应验收项（A2 杀进程恢复、A4 en locale 各一节）。
- 文档同步随项完成：CODEBUDDY.md（产物数、存储布局、规约、测试分层）、docs/README.md 目录树、improvement-plan.md 索引、plan-p2/plan-competitor-ux 交叉标注；行为变更同步 README 双语，CHANGELOG 发版时写。

## 附：复核命令

A6 错误清单（本计划 14 处基线的复现方式）：

```powershell
$o = npx tsc -p tsconfig.json --noUncheckedIndexedAccess --pretty false 2>&1
$o | Select-String 'error TS'   # 逐处定位
```

catch 审计基线（~143 处的分布复现）：对 `src/` 搜 `catch`，按文件统计（host 99 + client 44，2026-09-29）。
