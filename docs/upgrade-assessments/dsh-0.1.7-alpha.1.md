# dsh v0.1.7-alpha.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.7-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)（tag commit `c36a83f`，2026-09-22 发布；npm dist-tag `alpha` 指向本版，`latest` 已推进到 0.1.5-rc.2、`next` 为 0.1.5-rc.3）
> 本地基线：`npm install -g @deepseek-ai/dsh@alpha` 全局实装 0.1.7-alpha.1（旧基线 0.1.6-alpha.2）；对照源：[dsh-0.1.6-alpha.1.md](./dsh-0.1.6-alpha.1.md)
> 评估方式：release notes 逐条筛查（体验优化 23 / 问题修复 25 / 其他变更 13，重点比对插件系统、消息处理、API 接口）+ **本机实装产物核验**（新布局 `dsh/node_modules/@deepseek-ai/*` 下逐包读 `.d.ts`/`.js`）+ **三层门禁实跑**（test:probe 39 例、verify:host 装配断言、npm test 391/391、typecheck）
> 总结论：**本版是破坏性版本，撤回主链路在 POSIX 上直接失效、设置页配置卡片写必失败**——两处必须改码（§三 A/B），一处探针锚点必须更新（§三 C）。其余消费面（fork 签名、附件回填链、chat.node 槽位、插件管理页 bundle 配置、会话导航归属、模块解析）逐一核验在位或零交集。

## 一、更新日志梳理与初步判断

release notes 中与「插件系统 / 消息处理 / API 接口」相关、需插件侧核查的条目：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Shell 执行接缝改 `execute()`（`ShellExecutor` 移除 `run`/`start` 抽象方法）** | 其他变更隐含（release notes 未单列） | 高相关——插件 `runShell` 全链走 `ctx.shell.run` | **硬破坏**——`dsh-shell/lib/types/index.d.ts` 类仅剩 `resolve`/`execute`；全树 grep `shell.run` 零调用，官方 `dsh-tool-pwsh` 改 `(await ctx.shell.execute(spec)).result()`。详见 §三 A |
| **设置改由当前 Profile 的插件配置保存；自定义设置插件需适配** | 其他变更 #11 | 高相关——插件用 `installSettingsSection`/`installSection` 接入设置页 | **硬破坏**——`dsh-settings` 整体换代：导出面只剩 `SettingsForms`（`configure`/`describe`/`update`/`replace`/`mutate`），`installSection` 全树零命中；写入按 **profile entry id** 寻址，且**只有 schema 声明 `.volatile()` 的字段可写**。详见 §三 B |
| **插件可声明无需重载的配置字段，仅改这类字段时保留运行中实例** | 其他变更 #6 | 高相关——与上一条同源（volatile 机制） | 机制确认为 schemastery `.volatile()`（官方如 `z.number().default(10).volatile()`）；无 volatile 字段的 entry 在 `describe()` 中被跳过、写入抛 `has no volatile fields` |
| **Session 日志升级为 V4 + 批量迁移工具，兼容部分 V3 缺少轮次结束记录** | 其他变更 #1 | 中相关——插件扫 `user/message`/`turn/end` | **无破坏**——事件集 54→60（新增 `deliverables/presented`、`developer/message`、`image/offload`、`subagent/catalog`、`workspace/changes`），插件按具体 `type` 匹配、未知类型天然忽略；`UserMessage.id`/`content` 形状不变（`MessageBase.id` 语义「跨表示边界稳定」保留），V3→V4 迁移保留原始 message id；`turn/end` 缺失兼容属正向 |
| **仅存于自定义事件中的附件不再自动读取或导出，插件需适配** | 其他变更 #2 | 中相关——插件有附件回填链（I34） | **零交集**——本插件不写任何会话事件；回填读的是标准 `user/message` 内容块（`ImageBlock`/`FileBlock` 的 `attachment.attachmentId`），官方同款路径 `attachmentRefsIn(message.content)` 未变；`session.readAttachment` → `{attachment, data}` 契约在位 |
| **工作区文件读取统一为 `readBytes`，插件需迁移旧接口** | 其他变更 #8 | 低相关——插件读文件 | **零交集**——插件零处 `ctx.fs`/`readFile` 消费，文件读写全走自建 shell 模板（rg 实证） |
| **插件组合包支持按顺序加载多个 patch 文件，保留原有单文件写法** | 其他变更 #6 | 低相关——插件用 `cordis.patch.yml` | **无影响**——`DshBundleManifest.patch: string \| string[]`，单文件写法显式保留；`package.json` 的 `dsh.bundle.patch` 声明面不变 |
| **插件可经 locale 声明多语言标题/描述、经 package.json 声明图标** | 其他变更 #4 | 低相关——可选增强 | 无关（`LocalizedText`/`PluginLocalizedMeta` 类型存在，属可选采纳项） |
| **Agent 预设改由插件组合包声明安装；设置页移除复制/删除/打开目录** | 其他变更 #10 | 无关——插件不声明预设 | 零交集 |
| **`--dump-config-schema` 导出 Cordis 配置及 patch 的 JSON Schema** | 其他变更 #7 | 无关（开发工具） | 零交集（可作为后续配置校验工具） |
| **官方 DeepSeek 适配器仅用 Messages API，移除 Chat Completions/protocol** | 其他变更 #3 | 无关——插件不碰 LLM 适配 | 零交集 |
| **内置浏览器默认开关、实验性语音转写、会话置顶/归档管理/筛选、工作过程展示设置、文件预览系列、Team 看板只读** | 体验优化各条 | 无关——宿主新功能 | 与插件消费的槽位/服务零交集（`conversation.chat.node`、`plugins.bundle.config` 探针绿） |
| **修复插件投影缓存特殊 JSON 字段丢失 / 取消轮次结束记录写入失败 / 会话重开显示空白 / 不可读插件包不再中止 Profile 加载 / 源码启动模块解析失败 + 支持 link 本地插件** | 问题修复 #4/#9/#10/#15/#20 | 低相关——稳健性面 | 正向：cutSeq 依赖的 `turn/end` 记录更可靠；插件自身的加载失败不再拖垮 Profile；本地 link 开发体验改善 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.1.7-alpha.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run check:dsh` | 本地已装 0.1.7-alpha.1；报镜像漂移、契约文档漂移、6 个 dsh-* peer 越界（0.1.7 为新 minor 线，`<0.1.7` 上界拦截）——本次**不**同步（见 §四） |
| `npm run test:probe` | **35/39，4 红**：3 条 fork 切点锚点（实现重写）+ 1 条 `ShellExecutor 公开面无方言字段（resolve/run/start + sandboxMode）`（`abstract run(` 已不存在） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）——注意 verify-host 用的是**自带 settings 桩**（同时提供 `installSection`），故本门禁**掩盖**了 §三 B 的 settings 换代 |
| `npm run typecheck` | 通过（插件自身声明面自洽） |
| `npm test` | 391/391 通过（32 文件）——插件内部逻辑零回归 |
| `npm run build` | 未跑（本轮无源码改动） |

### 2.2 包布局变化

官方包从「全局扁平 `node_modules/@deepseek-ai/*`」收进 **`@deepseek-ai/dsh/node_modules/@deepseek-ai/*`**（核对 `dsh --version` 与 `npm ls -g` 时顶层 `@deepseek-ai` 仅剩 `dsh`）。

- **I11 无破坏**：插件工作区 `node_modules/@deepseek-ai/{schemastery,dsh-settings}` junction 指向新嵌套路径，实测 `import('@deepseek-ai/schemastery')` / `import('@deepseek-ai/dsh-settings')` 均解析成功（后者导出面已是 `SettingsConflictError/SettingsForms/redactSecrets`）。
- 安装遗留：npm 清理失败留下 `@deepseek-ai/.dsh-EBhnoWNL`（560MB 的整包副本，属 npm trash 目录，可删）。

### 2.3 关键证据链逐项

| 消费点 | 0.1.7-alpha.1 实装结论 | 出处 |
|---|---|---|
| `ISessions.fork({sessionId, atSeq?, increaseTitle?})` | 签名逐字不变；JSDoc 改为「`atSeq` 是**包含式**真实事件 seq；开放切点由 Host 侧合成 closer 配平；省略则取最近完成轮次前缀」 | `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts` |
| fork 实现 | 重写：源改走 `sessionQuery.observeSession`，`boundary = atSeq ?? latestCompletedPrefixBoundary(events)`，校验 `events[boundary].seq === boundary`（否则 `session/fork-unavailable`），`buildForkSeed(events, boundary)` = 前缀 + `session/end-seed` + 开放轮合成 closer，`inheritedEventCount = boundary + 1` | `dsh-api-session-controller/lib/index.js` + `dsh-session/lib/types/fork.js` |
| `session.readAttachment` / `updateQueue` | 均在位；`readAttachment(attachmentId)` → `RemoteResult<{attachment: ImageAttachmentRef, data: Uint8Array}>`，`updateQueue(itemId, action)` 契约不变（G1 清理继续可用，0.1.6 线 fork 已根治、此处退化为无害空操作） | `.../client/contract/session.d.ts` |
| 回填链 | `conversation.input.shell(id).actions.setDraft/addAttachments`、`conversation.createDrafts/releaseDraftAttachments`、`IConversation.input: SessionInputResolver` 全在位 | `dsh-client-ui-conversation/lib/types/client/{service,contract/input}.d.ts` |
| `conversation.chat.node` / `ChatNodeKind` | 探针绿（`renderMessageImages`、`node`、`cwd`、node union 未变） | `dsh-client-ui-chat`/`dsh-client-ui-conversation` slots/records |
| `plugins.bundle.config` | 仍在（与 `plugins.item`/`plugins.row.config` 并存，`plugins.item` 由官方设置页占用） | `dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts` |
| 会话导航（I37） | `ISessions.open` 仍缺席、`uiWorkspace.openSession` 探针绿、归档集合判据不变 | 探针「会话导航归属」2 例 |
| `sessions` 内存读 | `snapshotEvents(fromSeq?, toSeqExclusive?)`/`eventAt`/`ownEvents()` 全在位（后两者仍标 `@deprecated`）；`SessionStore.get/list/create` 不变 | `dsh-session/lib/types/index.d.ts` |
| `shell` 接缝 | `ShellExecRequest` 新增 `onExpiry`/`env`/`dshEnv`、`workdir` 转可选；`ShellRunResult` 形状（`exitCode`/`stdout.truncated`）保留；**`run`/`start` 抽象方法已删除**，改为 `execute(spec): Promise<ShellExecution>` + `ShellExecution.result(): Promise<ShellRunResult>`；`SandboxExecutionPolicy {mode, workspaceRoot, sessionId?}` 仍是 `{mode:'danger-full-access', workspaceRoot}` 的合法形态 | `dsh-shell/lib/types/{index,types}.d.ts`、`dsh-sandbox` |
| `settings` 接缝 | 导出改为 `SettingsForms`（Service 名仍 `settings`）：`configure/describe/update/replace/mutate/writable/documentPath`；`installSection` 全树零命中 | `dsh-settings/lib/types/index.d.ts`、`lib/index.js` |

## 三、必须改码项（按严重度）

### A. shell 执行接缝迁移（**POSIX 上撤回主链路直接失效**）

- **事实**：`ShellExecutor` 不再有 `run`；官方消费方统一 `(await ctx.shell.execute(spec)).result()`。
- **落点**：`src/host/store.ts` 两处——`runShellMeta` 的 `const res = await shell.run(spec)`（约 452 行）与方言探针 `res = await shell.run(shell.resolve({...}))`（约 363 行）。
- **表现分级**：
  - **linux/darwin**：`isWin` 为 false → 必经 `shell.run` → `TypeError: shell.run is not a function` → 建仓/快照/diff/回退/gc/索引读写**全部失败**，撤回不可用。
  - **win32**：方言探针同样抛错，但被 try/catch 折成 `null` → `judgeShellDialect` 判 bash → 走自建 spawn 直连 `powershell.exe` 通道（不依赖官方 `run`），**功能侥幸可用**，代价是每次启动都打一行误导日志（「ctx.shell 非 pwsh」）且失去官方通道（stdin 透传/超时语义由直连自实现）。
- **修法**：`runShellMeta` 与探针改 `const handle = await shell.execute(spec); const res = await handle.result();`；`res.exitCode === null`（准备期超时）与新 `ShellSandboxInfo` 字段按既有失败分级处理。同步更新探针 I36 锚点（断言 `execute(` 存在、`abstract run(` 不存在）。

### B. settings 接入换代（**设置页配置卡片只读、保存必失败**）

- **事实**：`installSection`/`installSettingsSection` 双双消失；`ctx.settings` 变成 `SettingsForms`，寻址键是 **profile entry id**（`configEditor.entries().find(row => row.options.id === ns)`），未知 ns 抛 `No configurable plugin entry "dsh-recall"`；且**只有 schema 标 `.volatile()` 的字段**能被 `describe()` 收录、被 `update/replace` 写入（无 volatile 字段时写入抛 `has no volatile fields`，`describe()` 直接跳过该 entry）。
- **落点**：
  - `src/host/index.ts` 的 settingsHooks/`installSettingsSection`→`installSection`→`register` 三分支：0.1.7 上三分支全不命中，**静默 no-op**（无异常、无日志），namespace 永不注册，"设置改动热更进运行中 cfg" 一并失效。
  - `src/host/routes-manage.ts` 的 `config-get`（找 `ns === 'dsh-recall'` 的 descriptor）→ 恒找不到 → 用户覆盖字段恒空。
  - `config-set` → `settings.update('dsh-recall', clean)` 抛 `No configurable plugin entry "dsh-recall"` → 卡片弹「配置写入失败」；`config-reset`（`settings.replace('dsh-recall', {})`）同因失败。
- **修法（双版本兼容，保留 0.1.6 线）**：
  1. `src/host/config.ts` 的 `Config` schema 给 9 个可编辑字段标注 volatile（schemastery `.volatile()`；随 dsh 0.1.7 实装的 3.18.3 具备该 API）；
  2. entry id 取 `ctx.fiber.entry?.id`（官方 speech-to-text 同款），不再写死 `'dsh-recall'`；
  3. 运行中热更改由 loader 的 volatile 提交 + `ctx.on('loader/volatile-update', …)` 驱动（`Volatile<T>` 取值需 `.get()`），旧版仍走 namespace watch；
  4. `config-get` 读 descriptor 的 `user`/`value`，`config-set` 走 `settings.update(entryId, patch)`，`config-reset` 走 `settings.replace(entryId, {})`；
  5. 客户端卡片：`plugins.bundle.config`（key=`dsh-recall-plugin`）照旧，旧键 `settings.plugin.item` 保留给 ≤0.1.6。
- **注意**：`Config` 字段变 ref 后，`createConfig(config)` 的取值路径（`cfg.gcSnaps` 等约 20 处消费点）需统一改为读值函数，改动面比看上去大——建议先做 `readCfg()` 收口。

### C. 探针与台账锚点更新

- `tests/probe/api-surface.test.js` 的 3 条 fork 锚点按新实现重钉：`latestCompletedPrefixBoundary`、`buildForkSeed(source.events, boundary)`、`inheritedEventCount: SessionLogOffset(boundary + 1)`、`events[boundary]?.seq !== boundary` 校验。
- I36 锚点随 §A 改为 `execute(` 正向断言。
- 补一条 settings 换代探针（`installSection` 不存在 / `SettingsForms` 存在 / volatile 声明面），把 verify-host 桩掩盖的盲区补上。
- `docs/compat-audit.md`：I1（keyed slot）、I12（bundle 配置）、I34（附件链）、I35（fork 切点）、I37（导航）逐条复查动作按本版结论改写；I30（`installSection`）状态从「在位」改为「**0.1.7 起整体移除**」。

## 四、版本策略与结论

- **影响程度**：**破坏性**。两处硬破坏（shell 接缝、settings 接缝）＋一处锚点更新；win32 上 shell 破坏被自建直连通道掩盖，POSIX 上功能性失效；设置页配置卡片在 0.1.7 上不可写。
- **不改码直接发布的风险**：0.1.7 用户（尤其 linux/darwin）撤回全链不可用；配置卡片保存报错。故**本轮不同步 peer 范围与 `dshReleases`**——不把 0.1.7-alpha.1 声明为 compatible，等 §三 A/B 落地并实弹冒烟后再补 `>=0.1.7-alpha.1 <0.1.8` 段与矩阵条目。
- **无破坏面**（可安心保留）：fork 客户端签名与插件调用语义等价（插件传的 `cutSeq` 本就是真实 `turn/end` seq，包含式切点与 0.1.6 的「吸附到该 turn/end」结果一致）；附件回填链、chat.node 槽位、插件管理页 bundle 配置、会话导航归属、模块解析（I11）、`snapshotEvents` 内存跳读全部在位。
- **残留观察项**：
  1. fork 子会话内撤回**第一条用户消息**时，cutSeq 可能落在上一轮 fork 追加的合成 closer 上（新 seed 含 `session/end-seed` + `openTurnClosers`）——需实弹确认不触发 `session/fork-unavailable`；
  2. `snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated`（官方存储方向停产全量常驻事件），插件降级链（`observeSession`→`readSession`）已具备，继续观察；
  3. fork 源改走 `observeSession` 后新增 `session/workspace-attach-failed` 失败形态（子会话已建但未挂工作区），插件 H1 救援逻辑需确认能兜住这一类。

## 五、后续动作

1. ~~全局实装 + 三层门禁复跑~~——已完成（见 §2.1，4 红均为本报告已定位项）。
2. 待做（改码，建议顺序）：§A shell 接缝迁移 → §B settings 换代 → §C 探针/台账锚点。
3. 待做（人工）：win32 + POSIX 双端实弹冒烟（撤回全链、设置页保存/恢复默认、快照管理、fork 子会话首条消息撤回）。
4. 待做（文档）：`docs/reference/` 镜像按 0.1.7-alpha.1 tag 重拉、`docs/dsh-contract.md`「对应版本」与 §1.1/§1.2/§四 更新、`compat-audit.md` 头部核验段、CHANGELOG。
5. 待做（收尾）：清理全局安装遗留的 `@deepseek-ai/.dsh-EBhnoWNL`（560MB）。
