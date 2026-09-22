# dsh 0.1.7-alpha.1 适配计划（shell 接缝换 execute / settings 接缝换 SettingsForms）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：实施中（M1–M4 已实施、自动化门禁全绿；M5 双平台人工实弹待做，见实施记录）
> 评估底稿：[dsh-0.1.7-alpha.1.md](../../upgrade-assessments/dsh-0.1.7-alpha.1.md)（含全部消费点结论与本机实装产物出处；本计划只写「怎么做」，不复述证据）
> 触发：2026-09-22 本机全局实装 0.1.7-alpha.1 后门禁 `test:probe` 35/39（4 红），`verify:host` 因自带 settings 桩而掩盖 settings 换代（实证与出处见 [dsh-0.1.7-alpha.1.md](../../upgrade-assessments/dsh-0.1.7-alpha.1.md)）
> 范围：**只做适配，不加功能**。高相关条目（shell 接缝 / settings 接缝）走代码迁移；中相关与低相关条目按「[中/低相关条目的处置](#中低相关条目的处置)」逐条记账——多数零代码，仅事件集同步产生小改，另有若干对照点并入 M5 冒烟。

## 背景：为什么做

dsh 0.1.7-alpha.1 是插件首个破坏性上游版本，两处消费接缝整体换代：

1. **`ShellExecutor` 删除 `run`/`start` 抽象方法**，改为 `resolve(request)` + `execute(spec): Promise<ShellExecution>`，前台结果走 `ShellExecution.result()`。插件全部 git 命令（建仓/快照/diff/回退/gc/索引读写）都经 `runShellMeta` 的 `ctx.shell.run(spec)`（[store.ts](../../../src/host/store.ts)）；POSIX 上该调用必然抛 `TypeError`，**撤回全链在 linux/darwin 上直接死亡**；win32 因方言探针抛错被 catch 折成 `null` → 判 bash → 落到自建 spawn 直连通道，功能侥幸存活但打误导日志、且失去官方通道语义。
2. **`dsh-settings` 导出面只剩 `SettingsForms`**（`configure`/`describe`/`update`/`replace`/`mutate`/`writable`），`installSettingsSection`/`installSection` 全树移除；读写按 **profile entry id** 寻址，且**只有 schema 标 schemastery `.volatile()` 的字段**可被 `describe()` 收录、被写入。插件现有三分支接线（独立函数 → `SettingsProvider.installSection` → `register`）在 0.1.7 上**全部不命中且静默 no-op**——namespace 不注册、配置热更失效、设置页配置卡片读不到覆盖字段、保存与恢复默认必失败。

**兼容约束（决定方案形态）**：peer 范围保留 0.1.2–0.1.6 各线段（见 `package.json` 现有 6 个 `dsh-*` peer），老用户仍可能装——两处迁移都必须**双分支共存**，不能只为新版写单路径。

## 契约核验（合规清单 #8：先验证再动手）

### C1 Shell 接缝（`dsh-shell/lib/types/{index,types}.d.ts`）

- 公开面：`get sandboxMode()` / `abstract resolve(request: ShellExecRequest): ShellExecSpec` / `abstract execute(spec: ShellExecSpec): Promise<ShellExecution>`；`ShellExecution extends ShellProcess` 并加 `result(): Promise<ShellRunResult>`（按需创建、记忆化）。
- 语义要点（决定失败分级怎么写）：
  - `result()` **只在基础设施失败**（spawn 未产出进程）时 reject；非零退出、超时 kill、abort kill 一律 resolve，并以 first-cause 标 `timedOut`/`aborted`、回显生效的 `timeoutMs`；
  - `exitCode: number | null`——null 出现在「准备期超时」（已 settled 的无输出 handle）与信号终止两种情形；现有 `res.exitCode !== 0` 判失败对 null 仍然成立，但错误消息需区分「准备期超时」与「非零退出」；
  - `stdout`/`stderr` 仍是 `CollectedOutput {text, truncated, spillPath?}`——F-G3 的截断判定（`loadIndex` 区分「读截断」与「内容损坏」）**不受影响**；
  - `ShellExecSpec.sandboxPolicy: SandboxExecutionPolicy | undefined`，`{ mode: 'danger-full-access', workspaceRoot }` 仍是合法形态（`sessionId?` 为新增可选字段）；
  - `ShellExecRequest` 新增 `onExpiry`（默认 `'kill'`）/`env`/`dshEnv`，`workdir` 转可选——插件不传，零影响。
- 官方消费方形态（照抄依据）：`dsh-tool-pwsh/lib/index.js` 前台路径 `const result = await (await ctx.shell.execute(ctx.shell.resolve({...}))).result()`；后台句柄路径先 `execute` 再保留 handle；`startJob` 场景用 `resolve` 记账。

### C2 Settings 接缝（`dsh-settings/lib/{index.js,types/index.d.ts}`）

- 服务名不变（`ctx.settings`），实例变为 `SettingsForms`：`configure(presentation, owner?)` 只控制「自动页」策略，**不是插件注册 namespace 的入口**。
- **ns = profile entry id**：
  - `write(ns, …)`：`ownerContext.configEditor.entries().find(row => row.options.id === ns)`，找不到抛 `No configurable plugin entry "<ns>"`；
  - `describe()`：`ns: entry.options.id`，并跳过 `entry.fiber` 未就绪的项；
  - `configEditor.entries()` 只取「父 tree 归属 `include` 层」的条目、且**同 `options.id` 出现两次以上时整组剔除**（`counts.get(...) === 1`）——即 ns 是**局部 id**，不是带 `include:` 前缀的 `Entry.id`。
- **volatile 门槛**：`write` 里 `volatileForm(schema)` 为 `undefined` 直接抛 `Plugin entry "<ns>" has no volatile fields`；`describe()` 对无 volatile 字段的 entry 直接 `return []`。`volatileForm` 判据是 `schema.meta.volatile`（祖先为 volatile 即可整棵纳入表单）。
- **`.volatile()` 只有 schemastery 3.18.3+ 才有**（实证：`npm pack @deepseek-ai/schemastery@3.18.2` 解包后 `lib/` 下 grep `volatile` 零命中；3.18.3 有 `Schema.prototype.volatile()`，meta 标 `volatile: true`）。dsh 0.1.6-alpha.2 随装 3.18.2 → **必须 feature-detect**，否则老 dsh 上模块加载即崩。
- **热更链路**：`cordis-plugin-loader` 的 `Entry.update → volatileOnly → _commitVolatile()` 把新值写进运行中 fiber 的 ref 后，向该 fiber 派发 `loader/volatile-update(paths)`（「every value is committed before dispatch」）。插件可选两条：① 每次读都经 ref 的 `.get()`（最稳，但要改 ~20 个消费点）；② 收到事件后重新解析 config。**本计划采纳 ②**（见 M2-3，改动面最小且不改现有 cfg 架构）。
- **取值形态**：标了 volatile 的字段在 `apply(ctx, config)` 拿到的是 `Volatile<T>`（cosmokit，`isVolatile`/`.get()`），未标的是普通值——**需要一个 unwrap 收口**，否则 `cfg.gcSnaps` 会读成对象。

### C3 运行时可访问面

- `Context.fiber: Fiber`（cordis `fiber.d.ts` 的 `declare module './context.ts'` 增补）→ `apply(ctx)` 内可读 `ctx.fiber`；
- `Fiber.entry?: Entry`（loader 增补，**可选**：无 Loader 挂载时缺席）→ 必须判空；
- `Entry.id: string`（getter，含父 tree 归属前缀）/ `Entry.options: EntryOptions`（`{ id, name, config?, … }`，`id` 为「containing entry tree 内的稳定 id」）→ **ns 解析优先 `options.id`**，`id` 作为兜底候选。

## 方案取舍

### S-A shell：双分支 vs 单路径

| 路线 | 判定 | 理由 |
|---|---|---|
| 只写 `execute()` 路径 | **否决** | peer 保留 0.1.2–0.1.6 各线段，老 dsh 的 `ShellExecutor` 只有 `run`——单路径等于把老用户全断 |
| 只靠自建直连通道（把 win32 的侥幸路径推广到全平台） | **否决** | 直连 spawn 绕开官方托管环境（PATH 注入、输出预算、超时治理、进程树 teardown），对多数正常部署是回归；issue #15 已定「只在方言不匹配时才启用」的边界 |
| **双分支按运行时方法探测分流** | **采纳** | `typeof shell.run === 'function'` → 旧通道；否则 `typeof shell.execute === 'function'` → 新通道（`execute` + `result()`）。两分支共用同一 spec 构造与同一失败分级，改动局限在一处 helper |

### S-B settings：三路线

| 路线 | 判定 | 理由 |
|---|---|---|
| B1 放弃设置页配置能力，只留 `cordis.patch.yml` 手改 | **否决** | 配置卡片是已发布功能（README 双语可见），静默退化属回归 |
| B2 只做只读降级（读 describe、禁写） | **否决** | 9 个字段全部可编辑，只读等于废掉卡片；且 `describe()` 无 volatile 字段时根本不返回该 entry，连读都读不到 |
| B3 **新面 + 旧面双分支共存** | **采纳** | 新版：Config 标 volatile（feature-detect）+ 按解析出的 ns 走 `describe/update/replace` + `loader/volatile-update` 热更；旧版：现有三分支接线一字不动。客户端零改动（`plugins.bundle.config` 键不变，旧键 `settings.plugin.item` 保留给 ≤0.1.6） |

## 中/低相关条目的处置

评估底稿 §一 把 release notes 逐条分到「高/中/低相关 · 无关」四档，高相关即上文两条接缝。其余条目的处置在此一次记账——**目的是实施时不再重读 release notes，也不重复筛查**。表格「落点」列指向本计划的具体任务或明确写「零动作」。

| release notes 条目 | 初判 | 处置 | 依据与落点 |
|---|---|---|---|
| **Session 日志升级为 V4** + 批量迁移工具，并兼容部分 V3 会话缺少轮次结束记录 | 中相关 | **小改：事件集同步；零运行时代码** | 插件按 `type` 精确匹配扫描（只认 `user/message` + `turn/end`），事件集 54→59 的 5 个新增类型（`deliverables/presented`、`developer/message`、`image/offload`、`subagent/catalog`、`workspace/changes`）天然被忽略；V3→V4 迁移保留原始 message id、seq 由官方重映射后与 `fork({atSeq})` 同源，插件以 id 为主键定位、`scanCutSeq` 用实际 `e.seq` 非数组下标，故免疫。**落点**：`src/types/dsh-contract.ts` 事件 union 同步至 59 种（备忘面，零消费，见改动落点表）；**对照点** → M5-6 ①「旧 V3 会话撤回」 |
| **仅存于自定义事件中的附件不再自动读取或导出（插件需适配）** | 中相关 | **零动作 + 一条长期约定** | 本插件不写任何会话事件，附件回填读的是标准 `user/message` 内容块（`ImageBlock`/`FileBlock` 的 `attachment.attachmentId`），与官方同款路径 `attachmentRefsIn(message.content)` 一致；`session.readAttachment` → `{attachment, data}` 契约在位。**约定**：今后若要新增会话事件来携带附件引用，必须同时评估该条（官方不再为其自动读取/导出）。**对照点** → M5-6 ②「带附件消息撤回后回填」 |
| **工作区文件读取统一为 `readBytes`（插件需迁移旧接口）** | 低相关 | **零动作 + 一条前瞻约定** | 插件零处 `ctx.fs`/`readFile` 消费——工作区文件读写全部经自建 shell 模板（git 侧）或自建 `/api/recall/*` 端点（设置页读取 exclude 文件），不经官方工作区文件 API。**约定**：今后若需从 Client 读工作区文件，直接用 `readBytes`，不要引入旧接口 |
| **插件组合包支持按顺序加载多个 patch 文件（保留原有单文件写法）** | 低相关 | **零动作** | `DshBundleManifest.patch: string \| string[]`——单字符串写法显式保留，`package.json` 的 `dsh.bundle.patch: "./cordis.patch.yml"` 与 `cordis.patch.yml` 的 `insert` 行一字不改。**对照点** → M5-6 ③「插件管理页识别 bundle 与配置入口」（顺带覆盖单文件 patch 仍被解析） |
| **插件可经 locale 声明多语言标题/描述、经 package.json 声明图标** | 低相关 | **本计划不采纳（范围只做适配），记为可选后续项** | 属可选展示增强，与兼容性无关；本插件已有中英双语 README 但插件管理页只有单一名称/描述。若采纳，落点＝`package.json` 的 `dsh` 段（图标）+ locale 数据结构（标题/描述），并在插件管理页验证。**不纳入本计划**，避免范围蔓延——需要时另开小计划或并入既有打磨计划 |
| **问题修复 #4 不可读可选插件包不再中止 Profile 加载 / #9 插件投影缓存特殊 JSON 字段丢失 / #10 源码启动模块解析修复 + 支持 link 本地开发插件 / #15 会话重开误显示空白 / #20 取消轮次时结束记录写入失败** | 低相关 | **零动作（正向）**，其中两条并入对照 | 逐条：`#4` 不改变本插件装配语义（插件自身加载失败仍走既有 `recordError` 不抛）；`#9` 与本插件零交集（插件不写投影）；`#15` 与「切换」按钮读 workspaces 快照的判据无冲突；**`#10` 与 I11 同源** → 对照点 M5-6 ④「link 模式加载正常」（本机开发即 link 模式，顺带覆盖 junction 指向新嵌套包目录）；**`#20` 正向**——插件 `resolveCutSeq` 依赖 `turn/end` 记录，取消轮次的结束记录更可靠 → 对照点 M5-6 ⑤「取消运行中回合后再撤回」 |
| **无关清单**：Agent 预设改由插件组合包声明安装、`--dump-config-schema`、DeepSeek 适配器仅用 Messages API、体验优化各条（会话置顶/归档管理、工作过程展示设置、文件预览系列、Team 看板只读、模型页入口等） | 无关 | **零动作；仅一条并入对照** | 均为宿主新功能，与插件消费的槽位/服务零交集（`conversation.chat.node`、`plugins.bundle.config` 由探针持续盯防）。唯一例外是**体验优化「改善长对话的初始化加载、轮次导航跳转、加载历史开销」**——它触及 chat 节点渲染路径，虽判定无关但风险在「客户端按窗口加载历史后，旧消息的撤回按钮是否仍渲染」 → 对照点 M5-6 ⑥ |

> **计数核验（2026-09-22）**：「54→59」已与 0.1.7 实装 `KNOWN_SESSION_EVENT_TYPES`（`dsh-session/lib/types/known-event-types.js`，共 59 种）逐一对账，5 个新增类型即全部差异；评估底稿与本计划此前写的「60」系计数误差，底稿按文档生命周期约定第 6 条冻结不改写，以本计划为准。

**对照点汇总**：上表共 6 个对照点（V4 旧会话、附件回填、插件管理页、link 模式、取消回合后撤回、长对话翻页后按钮可见），集中落在 M5-6，不新增独立冒烟清单——它们是**既有冒烟路径的补充观察点**，不是新链路。

## 任务分解

**实施顺序与分工**：M1 与 M2 可并行（各自独立提交）；M3-1 探针改写钉的是宿主实装、与 M1/M2 无依赖，可同批进行，M3-2 桩断言依赖 M2-4 完成后才有意义；M4 在门禁全绿后启动；M5 最后。M1–M4 由 AI 实施、人工审查（M1/M3 各约半天，M2 约一天，M4 约半天）；M5 为人工实弹，双平台各约半天，另加旧版降级/复升约半天。

### M1 shell 接缝双分支迁移（独立提交，可先行）

M1-1 **抽出执行 helper**：`src/host/store.ts` 新增 `runViaExecutor(spec)`——探测 `run`/`execute` 分流并统一返回 `ShellRunResult` 形状（新通道 `(await shell.execute(spec)).result()`）。`runShellMeta` 与方言探针（`resolveShellDialect`）两处调用点改为经该 helper，spec 构造与 `sandboxPolicy` 传参一字不动。

M1-2 **失败分级补 null 分支**：改动点只有一处——`runShellMeta` 里的非零退出判定（`store.ts` 现 452–455 行；直连通道 `runShellDirect` 两处调用已区分超时/非零退出，不在本次范围）。新通道下区分「`exitCode === null` 且无 stderr → 准备期超时」与「非零退出」，错误消息各自可读：超时文案含「超时」字样、非零退出文案含退出码（`diagnostics.ts` 的环境错误分类保持可命中）。验收由 M1-3 ④ 单测断言两类文案关键字完成。

M1-3 **单测**：新增 `tests/unit/store-shell-execute.test.js`（假 executor 注入，覆盖）——① 旧 executer（只有 `run`）走旧通道；② 新 executor（只有 `execute`）走新通道且 `result()` 被 await；③ `result()` reject（基础设施失败）→ 走 `throwShellFailure`；④ `exitCode === null` 准备期超时 → 归类为超时；⑤ 两分支 `stdout.truncated` 透传一致。

M1-4 **方言探针回归**：探针改经 helper 后，本机默认路径应重新判 `pwsh`（不再误判 bash），日志行为恢复正常。

### M2 settings 接缝双分支迁移（独立提交）

M2-1 **`Config` 加 volatile（feature-detect）**：`src/host/config.ts` 加 `withVolatile(schema)` 包装——`typeof schema.volatile === 'function'` 时才调用，否则原样返回；9 个可编辑字段（`gcSnaps`/`gcHours`/`maxFileBytes`/`maxSnapshotsPerWorkspace`/`baseExcludes`/`refillDraft`/`snapshotEnabled`/`archiveOriginal`/`retentionDays`）逐个包一层。`src/types/dsh-contract.ts` 的 schemastery ambient 需补 `volatile?(): Schema<…>` 可选方法声明（保持 ambient 与真实类型不冲突）。

M2-2 **ns 解析 helper**：新增 `resolveSettingsNs()`，落 `src/host/config.ts`（与改动落点表一致，不再二选一）——候选顺序 `ctx.fiber?.entry?.options?.id` → `ctx.fiber?.entry?.id` → `'dsh-recall'`，逐个与 `settings.describe()` 返回的 `ns` 求交集，命中即用；全不命中返回 `null`（新面不可用的信号）。**不写死任何 id 字面量**，也不依赖单一候选的正确性（C2 已说明两种 id 形态的差异）。

M2-3 **cfg 取值收口 + 热更**：新增 `unwrapConfig(raw)`。**`Volatile` 判定用 duck-type（`typeof v?.get === 'function'`），不引入 cosmokit 依赖**——`package.json` 无 `dependencies` 段、host 构建 `bundle: false` 逐字透传裸 import，新增运行时依赖的解析要赌宿主提升，duck-type 零依赖且对 `Volatile` 形状（`{ get(): T }`）足够。unwrap 语义：值是 `Volatile` 则取 `.get()`；是数组则逐元素解一层；是 plain object 则逐属性解一层；不再向下递归（9 个字段的 volatile 都是一层 ref，`baseExcludes` 为字符串数组，一层足够）。`applyResolvedConfig` 改为 `Object.assign(cfg, createConfig(unwrapConfig(resolved)))`。在**新面**生效时注册 `ctx.on('loader/volatile-update', () => applyResolvedConfig(config))`（值已先行提交，事件里直接读即可），旧面继续走 `installSection` 的 `setSource`/`onChange` watch。

M2-4 **接线分派改写**：`src/host/index.ts` 的 settings 段改为两级判定——**先探新面**（`settings.describe`/`update` 均为函数 **且** `resolveSettingsNs()` 命中），命中则新路径（**不调 installSection**，也不注册 namespace）+ 挂 `loader/volatile-update`；未命中再退回现有三分支（`installSettingsSection` → `installSection` → `register`）。任一路径失败仍走 `recordError` 不阻塞 apply（现有 try/catch 语义保留）。

M2-5 **端点改造**：`src/host/routes-manage.ts` 的 `config-get`（`find(d => d.ns === ns)` 用解析出的 ns）、`config-set`（`settings.update(ns, clean, revision?)`）、`config-reset`（`settings.replace(ns, {})`，无 `replace` 时降级 `update(ns, DEFAULTS)`）——`ns` 一律取 M2-2 的解析结果，未解析到时按现有 `RECALL_SETTINGS_UNAVAILABLE`/`RECALL_SETTINGS_WRITE_FAILED` 返回（文案保留「请在 profile 的 cordis.patch.yml 按 id: recall 覆盖配置」的逃生口提示）。`expectedRevision` 可选参数先用不传（并发写冲突由官方 `SettingsConflictError` 兜底，后续需要再加）。

M2-6 **单测**：新增 `tests/unit/settings-bridge.test.js`——① 两代 settings 桩各自命中正确分支（新面桩不提供 `installSection` 也必须走通）；② `resolveSettingsNs` 的四条候选路径与全不命中；③ `unwrapConfig` 对 ref/普通值/嵌套对象/数组；④ `config-set`/`config-reset` 在 ns 缺失时的错误码与文案。

### M3 探针与装配门禁（根因治理：桩不再掩盖换代）

M3-1 **probe 新增/改写**（`tests/probe/api-surface.test.js`）：
- shell 面：钉「`ShellExecutor` 有 `execute`、无 `abstract run(`；`ShellExecution.result` 存在」；
- settings 面：钉「`dsh-settings` 导出面含 `SettingsForms`、**不含** `installSection`；`volatileForm` 判据依赖 `schema.meta.volatile`」；
- 热更与运行时可访问面（本轮新路径依赖、此前完全无盯防的两个契约）：钉「`loader/volatile-update` 事件名字符串在 `cordis-plugin-loader` 源码中存在且被 dispatch」与「`Fiber.entry` 增补形状（`entry` / `entry.options.id`）在 loader 类型与运行时在位」——官方改名即静默失效（热更悄悄死掉、新面悄悄不启用），与本轮被桩掩盖的换代属同类面；
- fork 三锚点按新实现重钉：`latestCompletedPrefixBoundary`、`buildForkSeed(source.events, boundary)`、`inheritedEventCount: SessionLogOffset(boundary + 1)`、`events[boundary]?.seq !== boundary` 校验；
- 保留 fork 签名三例（已绿）。

M3-2 **verify-host 桩升级**（`scripts/verify-host.mjs`）：桩同时提供两代面，并新增断言「**桩只给新面（无 `installSection`）时装配仍成功**」——这正是本轮真实换代被掩盖的根因，堵住后任何一代缺失都会红。

M3-3 **台账**（`docs/compat-audit.md`）：I36 复查动作按「公开面 = resolve/execute」改写；I30 从「`installSection` 在位」改写为「0.1.7 起整个 `SettingsProvider` 移除、三分支静默 no-op」；**新增 I38**（shell 执行接缝：`run` → `execute().result()`，含 exitCode null 分级）与 **I39**（settings 面换代：`SettingsForms` + profile entry id 寻址 + volatile 门槛 + `.volatile()` 需 feature-detect）。

### M4 兼容声明与文档同步（门禁全绿后）

M4-1 `package.json`：6 个 `dsh-*` peer（host-webserver / sandbox-policy / session / session-query / settings / shell；`@deepseek-ai/cordis` 走 `^4.0.1` 独立线不动）各补 `>=0.1.7-alpha.1 <0.1.8` 段（沿用逐 minor 线开窗约定，0.1.2–0.1.6 各段保留）；`dsh.compatibility.dshReleases` 补 `0.1.7-alpha.1: compatible`；`@deepseek-ai/schemastery` peer 保持 `^3.18.1`（3.18.3 已满足）。
M4-2 `docs/reference/` 按 `dsh-v0.1.7-alpha.1` tag 重拉 13 源并逐份比对（差异落 `reference/README.md` 头字段与本计划实施记录）。
M4-3 `docs/dsh-contract.md`：「对应版本」字段 + §1.1 shell 段（新接缝双分支）+ §1.1 settings 段（`SettingsForms`/entry id/volatile）+ §1.3（事件集 54→59）+ §四。
M4-4 `README.md` / `README.en.md` 兼容声明段；`CHANGELOG.md` 记 `Changed`（0.1.7 适配：shell 接缝与 settings 接入双分支）；版本号由发版流程确定，不在本计划预写。
M4-5 `docs/compat-audit.md` 头部追加「0.1.7-alpha.1 适配完成」核验段（替换现有「待改码」段的状态措辞）。

### M5 实弹冒烟（人工，双平台）

**前置条件**（冒烟开始前逐项确认，缺一项对应项即无法验收）：① WSL 环境可用且能在其中跑 dsh（M5-1 硬指标依赖）；② 本机可全局升降级 dsh（`npm i -g`，M5-5 依赖）；③ 冒烟起点全局实装为 0.1.7-alpha.1；④ 两种安装形态分工：M5-3 在 **npm 安装模式**下执行（对应待确认项 2 的 `fiber.entry` 可见性复验），link 模式由 M5-6 ④ 覆盖。

M5-1 **POSIX（WSL）撤回全链**——本轮最高优先级（硬失败面，此前从未被自动化覆盖）：init → 发消息出快照 → 改文件 → 撤回（文件恢复 + 对话回退 + 标题不变 + 回填）→ 设置页快照管理。
M5-2 **win32 撤回全链 + 默认路径归一**：方言探针日志应为 `recall shell dialect probe: pwsh`（不再误判 bash），全链正常。
M5-3 **设置页配置**（npm 安装模式，见前置条件 ④）：新面下保存 9 字段中若干 → 立即生效（volatile 热更，无重载日志）→ 恢复默认 → 重启 dsh 复查持久化。
M5-4 **fork 边界**：在 fork 出的子会话里撤回**第一条用户消息**（cutSeq 可能落在上一轮 fork 追加的合成 closer 上），确认不触发 `session/fork-unavailable`。
M5-5 **旧版回归**：全局临时降级到 0.1.6-alpha.2 跑一轮撤回 + 设置页卡片，确认双分支的旧路径未被新代码破坏（对应 2.3.x 的「未升级用户不变砖」承诺）。**收尾必做**：复核完毕立即复升回 0.1.7-alpha.1 并确认版本到位，避免环境停留在旧版污染后续验证。

M5-6 **中/低相关条目的对照点**（既有冒烟路径上的补充观察，不新开链路；来源见「[中/低相关条目的处置](#中低相关条目的处置)」）：
1. **V4 迁移面**：拿一个 0.1.5/0.1.6 时代创建的旧会话（V3 日志）走一次撤回，确认切点解析正确（cutSeq 落在真实 `turn/end` 上、不报 `session/fork-unavailable`）、被撤回消息能定位（message id 未因迁移漂移）；
2. **附件面**：带图片（或文件）附件的消息撤回后，输入框回填文本 + 附件按预期重建（`readAttachment` → `createDrafts` → `addAttachments` 全链）；
3. **单文件 patch 面**：插件管理页正常列出本 bundle 与其配置入口（证明单字符串 `dsh.bundle.patch` 仍被解析）；
4. **link 模式面**：本机 link 模式（工作区 `node_modules/@deepseek-ai/*` junction 指向 0.1.7 的嵌套包目录）下插件正常加载、`/api/recall/*` 端点可用；
5. **取消回合面**：先取消一个运行中的回合、再撤回该回合内的消息，确认 `turn/end` 记录可靠、切点解析正常（对应问题修复 #20 的正向确认）；
6. **长对话翻页面**：在长会话里用轮次导航/翻页跳到较早的消息，确认旧消息上的撤回按钮照常渲染、点击可用（客户端窗口化不得吞掉撤回入口）。

## 改动落点

| 文件 | 改动 | 行数预算（当前有效行 → 预估） |
|---|---|---|
| `src/host/store.ts` | `runViaExecutor` 分流 helper + 两处调用点 + null 超时分级 | 510 → ~535 |
| `src/host/config.ts` | `withVolatile` + `resolveSettingsNs` + `unwrapConfig`（三个模块级纯函数，便于单测） | 56 → ~110 |
| `src/host/index.ts` | settings 接线两级分派 + `loader/volatile-update` 订阅 + cfg unwrap | 316 → ~355 |
| `src/host/routes-manage.ts` | `config-get/set/reset` 改用解析出的 ns | 531 → ~555 |
| `src/types/dsh-contract.ts` | schemastery ambient 补 `volatile?()`；`ShellExecution`/`ShellExecutionResult` 形状；settings 面新类型；**事件 union 54→59**（Session V4，备忘面零消费） | 183 → ~220 |
| `tests/unit/store-shell-execute.test.js` | 新建：执行通道双分支 + 失败分级 | 新增 |
| `tests/unit/settings-bridge.test.js` | 新建：ns 解析 / unwrap / 双代分派 | 新增 |
| `tests/probe/api-surface.test.js` | shell + settings 新锚点、`loader/volatile-update` 与 `Fiber.entry` 锚点、fork 三锚点重钉 | 314 → ~350 |
| `scripts/verify-host.mjs` | 桩补新面 + 「只给新面也必须装配成功」断言 | 小改 |
| `docs/compat-audit.md`、`docs/dsh-contract.md`、`docs/reference/`、`README.md`(+en)、`CHANGELOG.md`、`package.json` | M3-3 / M4 | — |

全部文件预估后有效行均 < 700，不触发拆分线；`store.ts`（510）与 `routes-manage.ts`（531）保持在 700 以下但已是本仓库最大的两个文件，**后续新增逻辑优先落到新文件**。

## 验收标准

1. `npm run typecheck && npm run build && npm test` 全绿；`npm run verify:host` 绿（含新断言「桩只给新面也装配成功」）；`npm run test:probe` 全绿（含新锚点）。
2. **POSIX 撤回可用（本轮硬指标）**：WSL 下 init → 快照 → 改文件 → 撤回全链通过；冒烟全过程中 `shell.run is not a function` 类错误在日志中零出现。
3. **win32 默认路径归一**：方言探针日志为 `pwsh`；撤回全链通过；`RECALL_CLEANUP` 清扫路径仍不触发探针。
4. **设置页配置可写且热更**：0.1.7-alpha.1 上保存配置成功、无需重载即生效、恢复默认可用、重启后持久化；`describe()` 能返回本插件 entry（说明 volatile 声明被正确识别）。
5. **旧版不变砖**：0.1.6-alpha.2 上撤回全链与设置页卡片行为与本轮改动前一致（双分支旧路径回归）。
6. **fork 边界安全**：fork 子会话首条用户消息撤回不报 `session/fork-unavailable`，子会话内容符合预期。
7. **中/低相关对照点全过**：M5-6 六项（V4 旧会话切点、附件回填、插件管理页、link 模式、取消回合后撤回、长对话翻页后按钮可见）逐项确认，异常项按「[中/低相关条目的处置](#中低相关条目的处置)」表回填结论。
8. 文档一致性：`check:dsh` 无 peer 越界、镜像/契约版本字段与实际实装一致。

## 风险与回退

- **双分支判据误判**：若某第三方 executor 在 0.1.7 上同时有 `run` 与 `execute`，优先 `run` 会拿到旧语义——实测 0.1.7 官方 `ShellExecutor` 已无 `run`，风险仅在非官方执行器；判据与探针锚点绑定，官方若回退会先在探针变红。
- **`unwrapConfig` 漏点**：volatile 字段变 ref 后，任何未 unwrap 的读取点会读到对象（表现为配置「读成空」）。缓解：unwrap 只在 `applyResolvedConfig` 一处收口 + M2-6 单测覆盖 ref/普通值/嵌套；冒烟 M5-3 以「设置改动能生效」为端到端证据。
- **ns 解析失败**：新面探不到 entry id 时卡片退化为不可写（返回 `RECALL_SETTINGS_UNAVAILABLE` 与逃生口文案），**不阻塞撤回主链路**；M3-2 的桩断言会在装配层先发现。
- **`.volatile()` feature-detect 判据**：若未来 schemastery 改名，新面自动退化为「无 volatile 字段」→ 写入抛 `has no volatile fields`（卡片报错可见，不会静默）；探针已钉 `schema.meta.volatile` 机制。
- **官方 0.1.7 后续 alpha 再改接缝**：`check:upgrade` + 探针组合会在下一次升级先红——除 shell/settings 导出面外，M3-1 新增的 `loader/volatile-update` 事件名与 `Fiber.entry` 形状锚点把热更链路的静默漂移面一并纳入盯防（本轮教训：verify-host 自建桩会掩盖真实换代，故 M3-2 的断言是长期防线）。
- **客户端窗口化对撤回入口的影响**（中/低相关里唯一带 UI 风险的条目）：0.1.7 改善了长对话初始化加载与轮次导航跳转，若客户端改为按窗口装载历史节点，旧消息需经翻页才进入渲染树——撤回按钮挂在这些节点上，原则上会随节点一起渲染，但**「翻页前按钮是否存在」不再是可假设的事**。缓解：M5-6 ⑥ 直接实弹确认（这是该风险的唯一可靠判据，探针只能钉 `conversation.chat.node` 契约不变）。
- **事件集扩容的隐性影响**：`image/offload`、`workspace/changes` 等新事件会进入快照内容（快照是整树 git 快照，与事件无关）；插件只按 `type` 匹配两个既有类型，新增类型不改变 seq 空间与切点解析——已在评估底稿逐条核验，本计划只需同步 `dsh-contract.ts` 的备忘 union。
- **回退**：M1、M2 分两次提交——任一迁移出问题可单独 `git revert` 对应提交，另一条与本轮文档改动不受影响。

## 待确认项（实施前先验证，不影响计划结构）

1. **ns 的实际取值**：`Entry.id` 在 include 层会带前缀，而 `settings` 侧匹配的是 `options.id`（C2 已证）。M2-2 的候选顺序按证据设计，实施第一步先用本机 0.1.7 实装打一条诊断日志（或临时探针）确认真实命中值，再决定是否需要保留 `entry.id` 候选。
2. **`ctx.fiber.entry` 在 link 模式下的可见性**：本地开发是 link 安装，若 `entry` 缺席（官方注释明说「absent when the plugin was mounted without Loader」），新面不会启用——需在 M5-3 用 npm 安装模式复验一次。
3. **`Config` 的 TS 输出类型**：标 volatile 后 schemastery 推导为 `Volatile<T>`，`src/types/config.ts` 的镜像类型与 `ResolvedConfig` 需确认是否要同步放宽（不影响运行时，影响 typecheck）。

> 三条均已在实施中核实，结论见下方实施记录。

## 实施记录

> 实施日期：2026-09-22（本机全局实装 dsh 0.1.7-alpha.1，link 模式）。四个提交：M1 `1b7722d`、M2 `133f77d`、M2 收尾修正 `7a68b38`、M3 `33fde0f`；M4 为文档/声明批次（本记录同批提交）。

### 待确认项结论（先验证再动手）

1. **ns 命中值 = profile 条目 id `recall`**（不是 `dsh-recall`）。证据两条：① `dsh --profile web --dump-config` 输出本插件的组合行就是 `id: recall`（bundle patch 的 insert 行 id）；② 进程内探针（临时 `--patch` 覆盖层挂只读探针插件，真实启动一次 web profile）实测 `ctx.fiber.entry.options.id = 'recall'`、`entry.id = 'include:ns-probe'`（`EntryTree.sep = ':'`）。**并且 `settings.update('dsh-recall', …)` 在 0.1.7 上实测抛 `No configurable plugin entry "dsh-recall"`**——旧硬编码 ns 确实必失败。→ `options.id` 候选必须保留，`entry.id` 作为降级候选（官方若换报法）保留但不依赖，字面量仅旧面使用。
2. **`ctx.fiber.entry` 在场**（本机 link 模式实测 `hasEntry: true`，探针经 `--patch` 插入行挂载、与插件 bundle 行同形）；`describe()` 在 apply 期**看不到自身**（fiber 仍 LOADING，11 条不含 recall），boot 落定后 17 条含 `recall`。→ 计划 M2-2 的「与 describe() 求交集，全不命中返回 null」在 apply 期必然落空（见下「与计划的差异」第 1/2 条）。
3. **`ResolvedConfig` 无需放宽**：schemastery 由本仓库自建 ambient（`src/types/ambient-modules.d.ts`）建模，`Volatile<T>` 从不进入 TS 视野；`withVolatile<T>(field: T): T` 保持原类型，`typecheck` 与 `Config`/`DEFAULTS`/`ResolvedConfig` 的既有互锁不变（ambient 只补了可选 `volatile?()` 声明）。

### M1 shell 接缝（提交 `1b7722d`）

* 落地：`runViaExecutor(shell, spec)` 模块级分流（`run` 优先 → `execute().result()`）、两处调用点改经它、`runShellMeta` 补 `exitCode === null` 分级；`dsh-contract.ts` 补 `ShellExecution`、`run?`/`execute?` 可选、`exitCode: number | null` 与 `timedOut`。
* `tests/unit/store-shell-execute.test.js` 10 例全绿；**实机回归**：真实启动一次 web profile，方言探针日志由 `bash（ctx.shell 非 pwsh…）` 变为 `recall shell dialect probe: pwsh`（M1-4 达标，误导日志消失）。
* 与计划的差异：
  * M1-3 ③（`result()` reject）按**原样上抛**落地，不额外触发 `throwShellFailure`：M1-2 明确「改动点只有一处」，且旧通道 `run` reject 同样不触发清扫——两分支语义保持一致优先于字面照抄；测试断言「两代 reject 同形上抛」。
  * M1-2 的判据在计划基础上多认一个强信号：first-cause `timedOut === true` 直接归超时（计划只写「null + 无 stderr」）。理由：超时 kill 可能带 stderr，仅靠 null+无 stderr 会把「超时且 stderr 有输出」报成普通非零退出、丢掉「超时」字样与诊断分类。

### M2 settings 接缝（提交 `133f77d` + `7a68b38`）

* 落地：`withVolatile`（feature-detect，9 个可编辑字段逐个包）、`resolveSettingsNs`（**按面分叉**）、`unwrapConfig`（duck-type 解一层）；`index.ts` 两级分派（新面 → 挂 `loader/volatile-update`；否则旧三分支）+ 初始 cfg 与 `applyResolvedConfig` 两处 unwrap；`routes-manage` 的 `config-get/set/reset` 改用解析出的 ns；`dsh-contract.ts` 补 `HostEntry`/`HostFiber` 与 `SettingsService` 新面方法（旧注册入口改可选）。
* `tests/unit/settings-bridge.test.js` 24 例全绿。
* **实机验证（0.1.7-alpha.1，进程内探针，真实启动）**：① `describe()` 在 boot 落定后返回本插件条目 `{ns: 'recall', applies: 'live', revision: 0, value: {9 字段解析值}, user: {}, writable: true}` → volatile 声明被正确识别（验收 4 的读侧）；② `settings.update('recall', {gcSnaps: 11})` 成功且 `describe()` 立即反射 11（user 层同步），`settings.replace('recall', {})` 复位成功、describe 回到 50 且 profile patch 文件**字节回到写入前**（官方复位路径干净）；③ 同一轮里 `settings.update('dsh-recall', …)` 抛 `No configurable plugin entry "dsh-recall"`（修复点直接证据）。写入验证用的 profile patch 文件已按官方复位收尾，未留残留行。
* 与计划的差异：
  1. **ns 解析的判据形态**（计划 M2-2 写「逐个与 describe() 求交集，全不命中返回 null」）：实测 apply 期 describe 看不到自身，交集必然为空 → 若照抄，新面永远探不到、退回旧三分支、卡片在 0.1.7 上照旧坏掉。改为「**交集优先，交集为空则按面回退**」：新面回退 `entry.options.id`（官方 write/describe 同用该键寻址，对 Loader 挂载条目构造性正确）、旧面回退字面量 `dsh-recall`、无 entry 又非旧面才返回 null（「ns 缺失」的诚实信号）。
  2. **新面判据多一条必要条件**（计划 M2-4 写「`describe`/`update` 均为函数 且 ns 命中」）：旧面同样有 `describe`/`update`（routes-manage 一直在用），只按这两条会把 0.1.6 误判成新面 → namespace 不注册、卡片失联，直接违反验收 5。判据改为「**旧注册入口 `installSection`/`register` 缺席**且读写方法在位」。这条差异是 M3-2 的双面桩跑出来的。
  3. **初始 cfg 也要 unwrap**（计划 M2-3 只提 `applyResolvedConfig`）：`apply(ctx, config)` 拿到的 config 里 volatile 字段已是 ref（实测），`createConfig(config)` 的 `typeof`/`pickNumber` 判定会把 ref 当非法值**静默回退默认值**——profile 行里的用户配置全丢。改为 `createConfig(unwrapConfig(config))`。
  4. `parseInt`/环境变量等既有解析路径不动：9 个字段全部由同一个 unwrap 收口供 `createConfig` 消费，消费点无需逐个改（计划里「约 20 个消费点」的担心在「入口整体解包」方案下不成立）。

### M3 探针 / 装配桩 / 台账（提交 `33fde0f`）

* 探针：`test:probe` 由 4 红转全绿（37 → 46 例）——shell 面重钉 2 例（抽象面无 `run`/`start`；`result()` 与可空 `exitCode`/`timedOut`）、settings 面新增 3 例（`SettingsForms` 导出面 / profile 条目 id 寻址 / volatile 门槛与两条错误文案）、热更与运行时可访问面新增 3 例（`loader/volatile-update` 的 dispatch 与按 fiber 过滤、`Fiber.entry` 形状、`Entry.options.id`/`Entry.id` 双形态）、fork 三锚点按新实现重钉（`boundary = atSeq ?? latestCompletedPrefixBoundary`、`events[boundary]?.seq !== boundary` 校验、`buildForkSeed` + `inheritedEventCount: SessionLogOffset(boundary + 1)`）；fork 签名三例原样保留。
* 装配门禁：`verify-host.mjs` 改为两个 pass——pass 1 旧面桩（并断言 `installSection` 以 `dsh-recall` 注册，钉住旧路径确实被走到），pass 2 **只给新面**（无 `installSection`/`register`）+ 复刻 Loader 的 `Fiber.entry` + 断言 `config-get` 读到 describe 的 user 覆盖、`config-set`/`config-reset` 把 `recall` 交给官方、卸载后路由清零、无 settings skip。
* 台账：I36 复查动作/探针按「公开面 = resolve/execute」改写，I30 改判为「0.1.7 起整个 `SettingsProvider` 移除、三分支静默 no-op、按旧注册入口缺席分派」，新增 **I38**（shell 执行接缝 + `exitCode` null 分级）与 **I39**（settings 面换代 + volatile 门槛 + feature-detect + 热更链路），E1 对应关系节补「两个 pass」的说明。
* 与计划的差异：
  * verify-host 顺带把 shell 桩改为**应答方言探针**（回显插件自身产物里的哨兵常量）：原桩一律回空输出 → 插件判 bash → 走自建直连通道真的 spawn `powershell.exe` 跑真 git，与脚本自述「本门禁不起真 git/真会话」矛盾，且新面 pass 里预热与卸载竞态会冒未捕获拒绝。改后两 pass 都留在官方通道、装配断言更快且无副作用；卸载前另留 50ms 让 apply 期的启动预热 IIFE 收尾（它是 fire-and-forget，外部无法 await）。
  * 计划改动落点表未列 `AGENTS.md`，实际同步了它的「已知坑」一行式索引：I30/I36 两条更新 + I38/I39 两条新增（该索引是 compat-audit 的索引面，漏登记会让台账断链）。

### M4 兼容声明与文档同步

* `package.json`：6 个 `dsh-*` peer 各补 `|| >=0.1.7-alpha.1 <0.1.8` 段（0.1.2–0.1.6 各段原样保留），`dsh.compatibility.dshReleases` 补 `0.1.7-alpha.1: compatible`；`@deepseek-ai/schemastery` peer 仍 `^3.18.1`（本地 3.18.3 在范围内，`.volatile()` 可用）。
* `docs/reference/`：按 `dsh-v0.1.7-alpha.1` tag 重拉 13 源逐份比对——**9 份逐字节相同，4 份有差异**：`05-publish.md`（patch 支持有序文件列表 + link 安装的 peer 解析规则）、`09-architecture.md`（措辞与文档互链）、`11-cookbook-conversation-node.md`（新增 Group Definition 章节，插件零消费）、`12-cookbook-settings-card.md`（**整篇重写为 0.1.7 的 volatile 即时表单写法**）。README 头部「归档日期/归档 dsh 版本」同步为 2026-09-22 / 0.1.7-alpha.1，`check:dsh` 四层全绿（本地版本、镜像字段、契约文档字段、6 个 peer 范围）。**外部佐证**：重写版 12 给出的官方写法就是 `z.string().volatile()` + `ctx.on('loader/volatile-update', …)` 读 `config.x.get()`，与本轮实现同构。
* `docs/dsh-contract.md`：「对应版本」改为 0.1.7-alpha.1（含两处接缝换代摘要、Session format V4、事件集 59）；§1.1 shell 段给出两代接口并补「插件对策（双分支）」；§1.1 settings 段补 `SettingsForms` 接口与四条要点（ns / volatile 门槛 / 热更 / 分派判据）；§1.3 补 V4 迁移与事件集变化；§四 标题与清单更新为 59 种。
* 双语 `README`：badge 与兼容声明上界更新到 `0.1.7-alpha.1`（并写明双分支共存、老版本行为不变），开发/测试段数字与探针/装配门禁描述同步（34 文件 425 例、46 探针、两个装配 pass）。
* `CHANGELOG.md`：`Unreleased → 变更` 置顶新增一条（两处接缝换代的症状与修法，双语项目惯例为中文条目）。
* `docs/compat-audit.md` 头部 0.1.7 段由「破坏性版本，待改码」改写为「已双分支适配」，附门禁数字、实机证据与待人工项，并顺带修正底稿遗留的事件集计数（60 → 59）。

### 门禁与实机证据（2026-09-22）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 34 文件 **425/425**（新增 2 文件 34 例） |
| `npm run test:probe` | 2 文件 **46/46**（适配前 35/39，4 红） |
| `npm run verify:host` | 两个 pass 全过（旧面桩 + 只给新面桩） |
| `npm run check:dsh` | 四层全一致（本地 0.1.7-alpha.1 / 镜像 / 契约 / 6 peer 在范围内） |
| `npm run build` | 通过（lib/ 与源码同步，3 个 host 产物变更随提交） |
| 实机（0.1.7-alpha.1，真实启动 web profile） | 方言探针 = `pwsh`；`describe()` 返回 `ns=recall`、`applies: live`、`writable: true`、9 字段值正确；`update('recall')` / `replace('recall', {})` 生效且复位干净；`update('dsh-recall')` 抛 `No configurable plugin entry` |

### 行数核对（改动落点 vs 实测有效行）

| 文件 | 计划预算 | 实测 |
|---|---|---|
| `src/host/store.ts` | 510 → ~535 | 510 → **523** |
| `src/host/config.ts` | 56 → ~110 | 56 → **126**（多出的一层是 ns 按面分叉与 unwrap 的注释） |
| `src/host/index.ts` | 316 → ~355 | 316 → **328** |
| `src/host/routes-manage.ts` | 531 → ~555 | 531 → **535** |
| `src/types/dsh-contract.ts` | 183 → ~220 | 183 → **202** |
| `tests/unit/store-shell-execute.test.js` | 新增 | 127 |
| `tests/unit/settings-bridge.test.js` | 新增 | 195 |
| `tests/probe/api-surface.test.js` | 314 → ~350 | 314 → **421**（新增 6 例多于此预估） |

全部 < 700，未触发拆分线；`store.ts` 与 `routes-manage.ts` 仍是最大两个文件，后续新增逻辑优先落新文件（与计划同结论）。

### 遗留与待人工

* **M5 全部待做（人工）**：POSIX（WSL）撤回全链、win32 全链 + 默认路径归一、设置页保存/热更/复位/重启持久化（npm 安装模式）、fork 子会话首条消息撤回、0.1.6-alpha.2 降级回归与复升，以及六个对照点（V4 旧会话切点、附件回填、插件管理页、link 模式、取消回合后撤回、长对话翻页后按钮可见）。本批次已把其中可自动化的部分前置：《读侧》describe/热更/复位已在真机验证；**写入的端到端「重启后持久化」与旧版降级仍必须人工**。
* **观察项（未改，超出本计划范围）**：插件 `apply` 末尾的启动预热 IIFE 是 fire-and-forget，若在 fiber 停用后才走到服务访问会冒未捕获拒绝（`cannot get required service … in inactive context`）。verify-host 侧已用「卸载前留一拍」规避；插件侧未加固（属既有行为，非 0.1.7 引入），需要时另开小计划。
