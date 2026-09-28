# dsh v0.2.0-rc.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.0-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1)（prerelease，2026-09-28 发布，0.2.0 系列首个候选版本、汇总自 `v0.1.7-rc.2`；npm dist-tag `next` 指向本版，`latest` 仍 0.1.7-rc.2、`alpha` 仍 0.1.7-alpha.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.2.0-rc.1` 全局实装（0.1.7-rc.2 → 0.2.0-rc.1）；对照源：[dsh-0.1.7-rc.2.md](./dsh-0.1.7-rc.2.md)
> 评估方式：release notes 逐条筛查（优化 10 / 修复 7 / 调整 2）+ **全树逐文件哈希 diff**（npm 升级残留的 0.1.7-rc.2 整包副本 298MB 直接作基线）+ **符号级计数复核**（11 符号 0 差异）+ 槽位契约逐行核对 + 依赖清单比对 + **门禁实跑**（check:dsh 四层 / test:probe 52 例 / verify:host 装配断言 / typecheck + npm test 436 例）+ **活体冒烟**（真宿主 + 浏览器实弹，撤回全链与设置页快照管理逐项通过）
> 总结论：**零破坏、无需改码**——插件依赖面 15 个出处包（含 `dsh-shell` / `dsh-settings` / `dsh-session-query` / `dsh-agent` / `dsh-client-connection` / `dsh-host-webserver` / `dsh-sandbox-policy` / `dsh-client-ui-slots` / `dsh-client-ui-renderer` / `dsh-cordis-host-runner` 加载面）`.js` 与 `.d.ts` **双向字节级一致**，消费面符号计数 11 项 0 差异，`plugins.bundle.config` 槽位定义与渲染调用逐行一致；唯一接口增量是 `sessions.fork` 的**可选** `onCreated`（向后兼容、插件不传）。真增量集中在官方插件管理页 UI、插件配置继承值计算、会话标题「未命名」语义与消息提交埋点。**版本策略上必须做一件事**：peer 范围新增 0.2.0 tuple（`>=0.2.0-rc.1 <0.2.1`）——prerelease 门槛要求同 tuple 且带 prerelease 的比较器，旧范围 `>=0.1.7-alpha.1 <0.1.8` 在启动期兼容门禁下会把本插件**整行跳过**（官方 semver 7.8.5 实测 `false`）。

## 一、更新日志梳理与初步判断

release notes 为「功能汇总」粒度（多为用户视角描述）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **修复工具调度异常后对话无法继续；结果未知的操作提示先核实副作用** | 修复 | **高相关**——fork 切点与 seed 构造 | **零破坏**——`dsh-session` 的 `repair.ts` 抽出 `ToolCallRecovery` 类、`openTurnClosers` 改由它驱动（+99/−… 净重构），`dsh-agent-loop` 改为「owning step 补保守结果」；`buildForkSeed`/`interruptedTurnClosers`/`forked` cause 与边界语义未变，探针三条切点锚点（boundary 解析 / `events[boundary].seq === boundary` 校验 / `seed = buildForkSeed(events, boundary)` + `inheritedEventCount = boundary+1`）原样通过；插件 `cutSeq` 恒取「消息之前最近一次 `turn/end`」的平衡前缀，从不触发补闭合分支 |
| **改善插件管理界面、内置插件界面布局及交互，改善安装引导** | 优化 | **高相关**——I12 的 `plugins.bundle.config` 挂载点 | **零破坏**（且实弹通过）——`ui-plugin-manager` 的 client.js 约 6800 行 diff，但 `slot-contract.d.ts` **不在变更清单**；`plugins.bundle.config` 出现 9→9、定义块（keyed/root）与 `renderSlot("plugins.bundle.config", {view:"page"}, {entryKey: pkg.name})` **逐行一致**；新增物是刷新反馈（`PluginRefreshToast`/`refreshStatus`）与安装输入清洗。活体：卡片完整渲染（3 开关 + 5 数值 + 三个折叠区） |
| **改善插件配置保存操作的等待时间** | 优化 | **高相关**——I39 settings 面 | **零破坏**（且实弹通过）——改动在 `dsh-config-editor` 的 `configuration()`：`inherited` 由 `this.inherited(entry, loaded)` 改为从**组合层** `composeEntries` 的 `structuredClone(composed.get(id)?.config ?? {})` 取；插件配置卡片走自有 `/api/recall` → `ctx.settings` 的 `describe/update/replace`，而 `dsh-settings`（SettingsForms）**字节未变**。活体：config-set 落库（`overridden.retentionDays=7`）→ config-reset 回默认（`overridden={}`）双向回读一致 |
| **无标题的历史会话统一显示「未命名」，重命名时提供空白输入** | 优化 | 中相关——会话标题读取 | 零交集——`ui-workspace` 把 `sessionTitle()`/rename 的取值从 `session.displayTitle` 改为 `session.title?.trim() ?? ""`，新增 `session.untitled` 文案；**插件不消费 `displayTitle`**（快照管理标题走 Host 侧 `session-info.ts` 读 `session/title` 事件） |
| **改善会话在图片失效后自动重传并继续请求的可靠性** | 优化 | 中相关——I34 附件回填链 | 零交集——`dsh-attachment{,-local}` 字节未变、`readAttachment` 计数 4→4；`dsh-client-file-upload` 的改动是官方 composer 的上传重试，插件回填走 `sessions.binding().session.readAttachment` → `conversation.createDrafts` → `shell.actions.addAttachments`，不参与该重传链 |
| **优化对话进行中和完成状态的实时动画、用时信息、过程信息间距** | 优化 | 低相关——chat 视图 | 零交集——`ui-chat` 新增 `RunningStatus`/`RunningWhaleTail` 组件、`chat.deepDivingFor` 文案与 shimmer 样式；`client/contract/slots.d.ts` **不在变更清单**（chat.node props 原样） |
| **自动化任务改由可选插件包提供** | 调整 | 低相关——profile patch 行 | 零交集（**但影响用户能力开关**）——`dsh-app-boot` 的 `OPTIONAL_BUNDLES` 增 `@deepseek-ai/dsh-experimental-schedule-bundle`，`dsh-web-app` 的 patch 移除 `schedule`/`time-context` 两行（原为 `disabled: true`）→ 自动化任务默认关闭，需在插件管理页开启；本机 profile patch 无指向被删行的条目，加载不受影响 |
| **调整工作过程展示在不同初始化路径的默认值** | 调整 | 低相关——chat 设置 | 零交集——`TranscriptViewPolicy` 构造参数化（`defaultMode?`）+ `dsh-app-boot` 传默认值；插件的 `chat.transcriptView` 语义未动（profile 里显式配了 `standard`） |
| **使用 DeepSeek 账号模型的会话无需配置额外 API Key 即可网页搜索** | 优化 | 低相关——LLM/搜索装配 | 零交集——`dsh-web-search-deepseek`/`dsh-deepseek-account*`/`dsh-deepseek-account-platform` 变动全在搜索与账号域 |
| **Windows 内置沙箱新增权限诊断技能** | 修复 | 低相关——shell 执行 | 零交集——新增 `dsh-sandbox-windows-acl` 的 `acl-skill`（+`koffi` 3.3.1→3.1.1 原生绑定）；插件以 `sandboxPolicy: {mode:'danger-full-access'}` 执行，不走 ACL 沙箱路径，`dsh-shell`/`dsh-pwsh-local` 均字节未变 |
| 其余（桌面更新提示 / 深色主题开关 / Office-PDF 预览选区 / 桌面弹窗避让标题栏 / Windows 资源管理器打开 / macOS 录音权限 / Safari 流式恢复 / Linux 可选原生包安装 / 创造模式指引） | 混合 | 零相关 | 零交集——落点分别在桌面端、`ui-primitives`/主题、`dsh-host-open-in-app`、`dsh-native-command`、optional native deps；均不在插件路径 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.0-rc.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run check:dsh` | 本地已装 0.2.0-rc.1；cordis 4.0.4 在 `^4.0.1` 内、schemastery 3.18.4 在 `^3.18.1` 内、6 个 dsh-* peer 扩范围后**全绿**；镜像 / 契约文档漂移本轮已同步，末行 `✔ 全部一致` |
| `npm run test:probe` | **52/52 全绿**（fork 签名与三条切点锚点、I7 客户端 `stopActivity`、I38 shell 接缝、I39 settings 换代与 volatile 热更链、I12 双代面 slot、I40 子路径基址、I36/I38 方言与直连通道事实） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）；方言探针回归 `pwsh` |
| `npm run typecheck` / `npm test` | 通过 / **436/436**（34 文件） |
| `npm run build` | 通过且 `git status lib/` **零漂移**（本轮零源码改动） |
| 启动期兼容门禁（官方 semver 7.8.5 实测） | `0.2.0-rc.1` 对 `>=0.1.7-alpha.1 <0.1.8` = **false**（不扩范围本插件会被整行跳过），对扩范围后的 `… || >=0.2.0-rc.1 <0.2.1` = **true**；`0.1.7-rc.2` 两版范围均 true（老用户不受影响） |

### 2.2 差异比对方法与零改动集合

**方法**：本轮升级前未单独打快照——npm 在 Windows 上把旧包目录改名停放的残留副本 `.dsh-EBhnoWNL` 实测**就是 0.1.7-rc.2 整包副本（298MB）**，直接用作基线（比对完成后已删除，`dsh --version` 复核仍为 0.2.0-rc.1）。对两棵树做**逐文件 SHA1 比对**（`.d.ts` 与 `.js` 两侧）+ 契约/产物文件 `git diff --no-index` 逐行核对 + 符号计数复核。

**规模**：528 个包中 **310 包仅版本号 lockstep 变更**（`@deepseek-ai/dsh-*` 全系 0.1.7-rc.2 → 0.2.0-rc.1）；类型面 **65 改 / 23 增 / 0 删**，运行时 JS **71 改 / 11 增 / 2 删**。

**零改动集合（`.js` 与 `.d.ts` 双向字节级相同）**：`dsh-shell`、`dsh-settings`、`dsh-session-query`、`dsh-agent`、`dsh-client-connection`、`dsh-host-webserver`、`dsh-sandbox-policy`、`dsh-client-ui-slots`、`dsh-client-ui-renderer`、`dsh-client-ui-settings-plugins`、`dsh-pwsh-local`、`dsh-shell-env`、`dsh-subprocess`、`dsh-attachment`、`dsh-attachment-local`、`dsh-cordis-host-runner/lib/index.js`（插件加载路径，仅 typert 元数据表变）、`dsh-pwsh-sandbox`、`dsh-api-settings-controller`。

→ 台账这些不变量的出处包在本版**未变动**，其核验结论与探针锚点原样成立：**I9（SessionStore 内存 Map）、I10（inject 门禁）、I13（ModuleLoader 包裹）、I20（win32 命令行上限）、I27（PS 5.1 stdin 字节流）、I29（client 服务层与守卫）、I30（settings 入口换代）、I31（slots.entries）、I32（不得硬依赖 webServer）、I36（win32 shell 方言）、I37（会话导航归属）、I38（shell 执行接缝）、I39（SettingsForms + volatile 热更）、I40（子路径基址）**。

**依赖面**：cordis 4.0.4、schemastery 3.18.4 **版本与内容均未变**（peer `^4.0.1` / `^3.18.1` 继续满足）；三方 `sharp` 0.35.5、`ws` 8.22.0、`koffi` 3.3.1→3.1.1（降级，win32 ACL 原生绑定）、`libreoffice-kit` 0.1.2、新增 `got` 14.6.6 等小幅变动，均不在插件路径。

### 2.3 关键证据链逐项

| 消费点 | 0.2.0-rc.1 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位 props（I1/I2/I4/I5） | `ui-chat` 的 `client/contract/slots.d.ts` **不在变更清单**；`conversation.chat.node` 出现 44→45、`conversation.input.attachments` 6→6；`ui-chat` 的真改动是 RunningStatus/RunningWhaleTail 新组件与 shimmer/文案 | 变更清单过滤 + 逐行 diff + 符号计数 |
| fork / 队列（I6/I33/I35、G1） | **唯一接口增量**：`ISessions.fork` 新增可选 `onCreated?: (childId) => void`（「子会话已入 catalog，在可选标题递增重命名之前」回调）+ typert 签名表同步；fork 其余实现未动（`boundary = atSeq ?? latestCompletedPrefixBoundary`、`events[boundary]?.seq !== boundary` 校验、`buildForkSeed` 三条锚点探针全绿）；**实弹**：撤回后 lineage 落 `childId=session-478696aa… parentId=session-d278b62c…`，子会话仅含被撤回消息之前的一轮 | 逐行 diff + 探针 + 活体 |
| 归档与导航（I7/I37） | `archiveSession`(175)/`unarchiveSession`/`openSession`(31)/`stopActivity`(32)/`archivedSessionIds` 计数逐项相等；`ui-workspace` 的真改动是标题取值与「未命名」文案（另 `forkSession(sessionId, onCreated)` 为官方侧边栏路径）；**实弹**：原会话从侧栏分组表面消失、子会话自动打开、标题继承无递增 | 符号计数 + 逐行 diff + 活体 |
| 回填链（I34） | `readAttachment`(4)/`updateQueue`(72)/`createDrafts`(2)/`releaseDraftAttachments`(2)/`addAttachments`(4)/`setDraft`(33) 计数相等；`dsh-client-ui-conversation` 真改动是 `submit(mode, source?)` + `InputEvent.submission` + `messageSubmitted` 埋点（`send_button_click`），新参数全可选；**实弹**：被撤回消息文本回填输入框、输入框上方无残留排队消息 | 符号计数 + 逐行 diff + 活体 |
| shell 执行接缝（I36/I38） | `dsh-shell` 类型与实现**字节未变**（仍 `resolve` + `execute().result()`、无抽象 `run`/`start`、无方言字段）；`dsh-pwsh-local` 字节未变（直连通道复刻的三条官方事实照旧）；**实弹**：dsh 启动日志 `recall shell dialect probe: pwsh`，快照/回退的 git 命令全部成功 | 哈希比对 + 探针 + 活体 |
| 设置卡片与配置读写（I12/I39） | `ui-plugin-manager` 的 `slot-contract.d.ts` 未变（keyed/root）；`dsh-settings` 字节未变；**实弹**：卡片的 3 开关 + 5 数值项取值正确（50/24/100/500/0）、`保存`→`overridden.retentionDays=7`、`恢复默认`→`overridden={}`，`/api/recall/config-*` 与官方 settings 面双向一致 | 逐行 diff + 活体 |
| 快照主链路 | **实弹**：发消息出快照（索引 `8792104e`@00:19:45、`91e66f19`@00:20:47）→ 改文件 → 撤回预览「共 1 个文件将变更（修改 1）」→ 确认 → 安全快照 `snap-pre-rollback-1790612487546` 落盘 + 文件回退到 v1 + fork/归档/回填/lineage 全链通过；快照管理树（工作区/会话/版本家族 `v1/2`·`v2/2` 聚族 + 叶子消息文本）、`立即 gc`（1.4 MB、状态「gc 完成」）、「最近错误」无错误不渲染 | 活体 + 磁盘对账（index.json / lineage.json / tag） |
| AgentRegistry（P0-1） | `dsh-agent` 字节未变（`list`/`get` 与 `idle\|running` 语义照旧）；`dsh-agent-loop` 的真改动在工具调度失败补结果路径，不涉状态机 | 哈希比对 + 探针 |
| 启动期兼容门禁 | 官方对 peer 名 `@deepseek-ai/dsh*` 用 `semver.satisfies(runtime, range, {includePrerelease:true})` 判定，不兼容整行跳过；本插件**扩范围后**实测放行并正常激活（stdout 无 skip 警告、卡片刻渲染）；反例：同 profile 的第三方 `dshmarket@1.65.1` 因 peer 只到 `^0.1.2-alpha.2` 被跳过（stderr 有明确 skip 说明） | 官方 semver 实跑 + 启动日志 |

### 2.4 活体冒烟（2026-09-29，Windows 10 22H2）

- **环境**：全局 dsh 0.2.0-rc.1 ｜ 插件 **link 模式**（profile 依赖临时改 `link:D:/workspace/dsh-plugin/dsh-recall-plugin` + `pnpm install --no-frozen-lockfile`，切换前备份 `package.json.bak-20260929` / `pnpm-lock.yaml.bak-20260929`）｜ `dsh web --no-open --port 3080`（token URL 进入）｜ 测试工作区 `D:\tmp\recall-h0`
- **执行方式**：浏览器实弹（agent-browser）+ Host 侧 index.json / lineage.json / git tag 磁盘对账 + API 直调（`/api/recall/*`，token cookie）
- **结果**：撤回全链与设置页快照管理逐项通过，插件 console 零报错（dsh stderr 仅有 dshmarket 的兼容门禁 skip 说明与插件自身的方言探针输出）
- **逐项结论**：
  1. **Host 半存活**：`status` → `{ok:true, errors:[], storeBase: …\.dsh\dsh-recall-snapshots}`；`init` → `root=D:\tmp\recall-h0`、`notice:{gitMissing:false, homeFallback:false}`、`config:{refillDraft:true, archiveOriginal:true}`。
  2. **快照行为**：两条消息各出一条快照（时间 00:19:45 / 00:20:47，sessionId 归属正确）。
  3. **撤回主链路**：确认面板文案与清单正确（「整段回退」+「共 1 个文件将变更（修改 1）」+ 范围 radio 默认 both）；确认后文件 `smoke-020.txt` 由 `v2 line (手动改动)` 回退为 `v1 line`、安全快照 tag `snap-pre-rollback-1790612487546` 落盘、lineage 追加 `session-478696aa… ← session-d278b62c…`、视图切到子会话（「1 轮 1 步」、被撤回消息消失）、标题继承无「 2」递增、被撤回消息文本回填输入框、输入框上方无残留排队消息、原会话从侧栏消失（归档）。
  4. **设置页**：插件管理页 `已安装` 列表中 `dsh-recall-plugin` 正常（图标 + 描述渲染），详情页配置卡片完整（3 开关 + 5 数值 + 三个折叠区 + 保存/恢复默认/放弃修改）；快照管理树两级展开、版本家族聚族（`创建 scope-test.txt 文件 v2/2 3 条` / `v1/2 2 条`）、叶子渲染 `时:分 消息文本`、`立即 gc` 由「执行中…」转「gc 完成」、「最近错误」无错误不渲染。

## 三、结论

* **影响程度：零破坏。** 插件依赖面 15 个出处包的 `.js` 与 `.d.ts` 双向字节级一致，消费面符号计数 11 项 0 差异，槽位契约与渲染调用逐行一致；唯一接口增量是向后兼容的可选参数 `fork.onCreated`。
* **具体表现：无需改码、无功能退化。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填 + G1 队列清理）、P0-1 运行中拦截、设置页配置卡片与快照管理均无字段/签名/语义漂移；`check:dsh` + 52 探针 + 装配门禁 + 436 单测 + 活体冒烟五层全绿。
* **版本策略（本轮已落地）**：
  1. **peer 范围必须新增 0.2.0 tuple**——6 条 `@deepseek-ai/dsh-*` 追加 `|| >=0.2.0-rc.1 <0.2.1`。依据不是「放宽」，而是 npm semver 的 prerelease 门槛：带 prerelease 的候选版本只被「同 tuple 且带 prerelease 比较器」的段放行，`>=0.1.7-alpha.1 <0.1.8` 对 `0.2.0-rc.1` 实测 `false` → 启动期兼容门禁会把插件**整行跳过**（同 profile 的 `dshmarket` 就是活例）。**已在 `package.json` 落地并 `check:dsh` 全绿**。
  2. `dsh.compatibility.dshReleases` 补 `0.2.0-rc.1: compatible`。
  3. `docs/reference/` 镜像按 tag `dsh-v0.2.0-rc.1` 重拉：13 源中仅 `09-architecture.md` 有实质差异（新增一行「失败步骤会[记录缺失的工具结果]」，净 **+121 字节**，对应本版 repair 重构），其余 12 份逐字节相同；镜像 README 的「归档日期 / 归档 dsh 版本」与 `docs/dsh-contract.md`「对应版本」同步。
* **观察项（非阻塞）**：
  1. **`fork.onCreated` 是可选优化点**：官方在「子会话已入 catalog、可选标题递增重命名之前」回调，比等 `fork()` 的 Promise 返回更早；插件当前不需要（也不传 `increaseTitle`），记录备查。
  2. **repair 重构的合成 tool/result 文案与 seq 分配已变**（`ToolCallRecovery` 接管）；插件 `cutSeq` 恒取平衡前缀，不触发补闭合分支，无影响。
  3. **自动化任务默认关闭**：若要继续用定时任务，需在插件管理页开启 `@deepseek-ai/dsh-experimental-schedule-bundle`（原 `dsh-web-app` patch 里的 `schedule`/`time-context` 行已移除）。
  4. **npm 安装陷阱**：0.2.0-rc.1 挂在 dist-tag `next`，`npm install -g @deepseek-ai/dsh` 仍停在 0.1.7-rc.2；须显式写版本号（或 `@next`）。
  5. **第三方插件兼容门禁联动**：`dshmarket@1.65.1` 因 peer 范围只覆盖到 `0.1.2-alpha.2` 被启动期跳过（插件市场不可用），需其自身发新版或经 `dsh plugin allow-version` 豁免。
  6. **快照管理树的 stale 窗口（既有 PF-6 设计，非本版引入）**：实弹观察到「卡片首次打开时列表可能少一条最新快照」——Host 以旧 items 立即应答并标 `stale`，客户端二段再拉若仍撞上 stale 即止步，等手动刷新（本次手动刷新后补齐为 2 条）。附带过程备忘：`DOM.click()` 对卡片按钮不触发 React 处理器，须走元素上的 `__reactProps.onClick`（与既往冒烟记录同款自动化限制）。
  7. **既有观察项延续**：`dsh-tool-jobs` 唤醒上限、`sessionQuery.snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated`、SSH 远端工作区未覆盖。

## 四、后续动作

1. ~~全局实装 0.2.0-rc.1 + 五层门禁复跑~~——已完成（§2.1、§2.4）。
2. ~~peer 扩范围 + `dshReleases` 补声明 + reference 镜像重拉 + dsh-contract / README 双语徽章与兼容范围同步 + compat-audit 头部核验段~~——本轮完成。
3. **待办（发版决策，需用户拍板）**：把本轮的兼容声明改动**发一个 patch 版本**——否则 npm 模式下装了已发布版的用户在 0.2.0-rc.1 上会被启动兼容门禁跳过（`dsh.compatibility.dshReleases` 只是市场台账、不参与启动判定，真正生效的是 `peerDependencies`）。
4. **环境还原**：冒烟期间 profile 切到了 link 模式（`link:D:/workspace/dsh-plugin/dsh-recall-plugin`），备份在 `~/.dsh/profiles/web/package.json.bak-20260929`；恢复 npm 模式＝还原 `package.json` 后 `pnpm install`（注意第 3 条：在发布新版前，npm 模式跑不起来插件）。
5. **测试产物**：`D:\tmp\recall-h0\smoke-020.txt`（回退后为 `v1 line`）与本次会话的 2 + 1 条快照 / 1 条 lineage 记录留在 store 供复验，可经设置页快照管理清理；评估用的临时脚本、dsh 分析副本（298MB）等中间产物已全部删除。
