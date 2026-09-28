# dsh v0.1.7-rc.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.7-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)（prerelease，2026-09-24 发布；npm dist-tag `next` 指向本版，`latest` 仍 0.1.5-rc.3、`alpha` 仍 0.1.7-alpha.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.1.7-rc.2` 全局实装（0.1.7-rc.1 → 0.1.7-rc.2）；对照源：[dsh-0.1.7-rc.1.md](./dsh-0.1.7-rc.1.md)
> 评估方式：release notes 逐条筛查（新增 6 / 修复 20 / 调整 6 / 优化 12）+ GitHub compare 提交比对（rc.1→rc.2 共 **346 提交**）+ **聚焦消费面的内容级 diff**（`npm pack` 下载 28 个包的 rc.1 版本与 rc.2 树全文件 SHA256 比对 + 契约/实现文件 `git diff --no-index` 逐行核对）+ **符号级计数复核**（13 包 × 23 符号，0 差异）+ 依赖清单比对 + **门禁实跑**（check:dsh 四层 / test:probe 52 例 / verify:host 装配断言 / typecheck + npm test 436 例）
> 总结论：**零破坏、无需改码**——插件消费面的客户端契约目录（`api-session-controller` 的 `lib/types/client/**`）**不在变更清单内**，核心接缝 12 包（`dsh-shell`/`dsh-settings`/`dsh-sandbox-policy`/`dsh-host-webserver`/`dsh-pwsh-local`/`dsh-client-connection`/`dsh-client-modules`/`dsh-client-ui-renderer`/`dsh-client-ui-session`/`dsh-client-store`/`dsh-host-plugin-inventory`/`dsh-api-gateway`）只动版本号与 i18n 元数据，门禁全绿；rc.2 的真实增量集中在模型选择/账号、工具热更、快捷键、归档筛选 UI 与额度提示，全部落在插件不消费处。

## 一、更新日志梳理与初步判断

release notes 为「功能汇总」粒度（多为用户视角描述）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **归档筛选支持「隐藏已归档／全部对话／仅显示已归档」** | 优化 | 中相关——归档会话可见性（I7/I37） | **零破坏**——`ui-workspace` 客户端新增归档筛选三态与快捷键系统（含 fork/archive 快捷键、`dismissForkError` 通知）；`archiveSession`/`unarchiveSession`/`openSession`/`stopActivity`/`archivedSessionIds` 符号计数逐项相等，`archivedSessionIds` 派生与「归档不是合法主视图选择」判据原样在位 |
| **进行中的对话可直接使用新启用的工具（工具热更）** | 新增 | 中相关——会话日志新增 `developer/message` 事件族 | **零交集**——`dsh-session` **纯新增** `ToolHistoryProjection` + `Session.toolHistory()`（+89/−0）；`ui-chat` 新增 `developerMessageDefinition`（新 node kind `developer-message`），插件 key 覆盖 `['user','steering']` **不命中**该 kind；`readSession`/`SessionQueryError` 计数相等 |
| **修复部分插件详情和设置页无法正常显示插件信息** | 修复 | 中相关——I12 双 slot（`settings.plugin.item`/`plugins.bundle.config`） | **零破坏**——`ui-plugin-manager` 的 `slots.d.ts` **不在变更清单**；`ui-settings` 的 `slots.d.ts` 仅新增 `SettingsLauncherOwnerProps.{settingsOpen,settingsShortcut}`（侧边栏启动器），插件两个 slot 契约原样 |
| **修复应用异常退出或安装中断后，后续插件安装和配置保存持续失败** | 修复 | 低相关——插件市场/配置写入链 | 零交集——变更在 `ui-plugin-manager`/`dsh-plugin-manager` 的安装与状态机侧；插件自身配置写入走 `ctx.settings`（`dsh-settings` 未变） |
| **插件管理页可启用自动审阅；Inspector 不再默认提供** | 调整 | 低相关——新增官方 bundle 包 | 零交集——rc.2 主包依赖 80→81：新增 `@deepseek-ai/dsh-experimental-auto-review`，无删除；插件不消费 |
| **不兼容插件的跳过提示每次启动只显示一次** | 优化 | 中相关——启动期兼容门禁的提示时机 | **零破坏**——`dsh-app-boot` 把「未兼容/不可读 bundle」的跳过报告从 stderr 打印改为 `Profile.skippedBundles` 收集 + `reportSkippedBundles` 单次打印；**判定逻辑（peer 范围 + semver.satisfies）未变**，本插件 6 条 peer 实测放行 |
| **插件安装时可清楚辨认当前使用的官方源或镜像，重复选项合并显示** | 优化 | 低相关 | 零交集——`ui-plugin-manager` 的 `registryKey`/`asksMirror` 注册表识别逻辑 |
| **账号任务与 API Key 任务使用独立的模型入口** | 调整 | 低相关——LLM provider 装配 | 零交集——`dsh-base` 的 `cordis.patch.yml` 把 `llm-deepseek` 行拆为 `llm-deepseek-api-key` + 新增 `llm-deepseek-account`；`api-session-controller` 新增 `initializeDefaultModel`/`hasProviderApiKey`/`requireModel`，全部在模型选择域 |
| **修复部分长对话持续无法发送消息** | 修复 | 中相关——消息处理 | 零交集——修复落在模型可用性校验路径（`prompt` 由 `routeServed` 改 `requireModel`），插件不代发消息 |
| **修复过长工具输出中的字符残缺（并可能导致后续对话失败）** | 修复 | 中相关——工具输出处理 | 零交集——插件 shell 输出截断走自建 spec 的 `stdoutMaxBytes`，不读官方 spill/工具输出链 |
| **减少标准模式每轮对话中固定提示信息的 token 开销** | 调整 | 低相关——系统提示词装配 | 零交集——镜像 `09-architecture.md` 的「循环发送不可变请求/模型可见即已记录/系统提示词」三处措辞与新增说明已核（见 §2.2） |
| **定时任务与时间上下文（新增，Web/桌面默认关闭）** | 新增 | 低相关——profile patch 新增行 | 零交集——`dsh-web-app` 的 `cordis.patch.yml` 新增 `time-context`/`schedule`（disabled）与 `shortcuts`/`ui-shortcuts` 行，与插件行无交互 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.1.7-rc.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run check:dsh` | 本地已装 0.1.7-rc.2；cordis 4.0.4 在 `^4.0.1` 内、schemastery 3.18.4 在 `^3.18.1` 内、6 个 dsh-* peer 全在 `<0.1.8` 段内；初跑两处 ⚠ 文档漂移（reference 镜像 / dsh-contract 仍记 rc.1），本轮已同步 |
| `npm run test:probe` | **52/52 全绿**（fork 切点锚点、I7 客户端 `stopActivity`、I38 shell 接缝、I39 settings 换代与 volatile 热更链、I12 双代面 slot、I40 子路径基址等） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）；方言探针回归 `pwsh` |
| `npm run typecheck` / `npm test` | 通过 / **436/436**（34 文件） |
| `npm run build` | 未跑（本轮零源码改动，无产物漂移面） |

### 2.2 差异比对方法与零改动集合

**方法**：本轮升级前未做整包快照（npm 在 Windows 上把旧包目录改名停放的残留副本 `.dsh-EBhnoWNL`，实测为本轮 rc.2 自身的解包中转目录而非 rc.1 树，不能作基线——见 §三 观察项 5），故改用**聚焦消费面的内容级 diff**：`npm pack` 下载 28 个包（插件全部 peer + 全部消费点所在包 + 官方 bundle `dsh-base`/`dsh-web-app`）的 rc.1 版本解包，与 rc.2 树做**全文件 SHA256 比对**；对契约与实现文件用 `git diff --no-index` 逐行核对；端点级证据见 §2.3。

**零改动集合（本版仅 `package.json` 版本号与 `README.i18n.yaml` 变化，文件内容字节级一致）**：`dsh-shell`、`dsh-settings`、`dsh-sandbox-policy`、`dsh-host-webserver`、`dsh-pwsh-local`、`dsh-client-connection`、`dsh-client-modules`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-store`、`dsh-host-plugin-inventory`、`dsh-api-gateway`；vendor 栈（`cordis` 4.0.4 / `schemastery` 3.18.4 等）**版本号与内容均未变**。

→ 台账这些不变量的出处包在本版**未变动**，rc.1 的核验结论与探针锚点原样成立：I13（ModuleLoader 包裹）、I27（PS 5.1 stdin 字节流）、I31（slots.entries）、I32（不得硬依赖 webServer）、I38（shell 执行接缝）、I39（settings 换代与 volatile 链）、I40（子路径基址）。

**真改动集合（12 包 + 2 处官方 patch）**：`dsh-api-session-controller`（模型目录/账号模型，+140/−73）、`dsh-session`（纯新增工具历史，+89/−0）、`dsh-session-query`（+7/−1）、`dsh-workspace`（+7/−5）、`dsh-api-workspace-controller`（+25/−12 + client.js +4/−5）、`dsh-app-boot`（+49/−33）、`dsh-client-ui-chat`（+187/−38）、`dsh-client-ui-conversation`（+306/−14）、`dsh-client-ui-plugin-manager`（+197/−94）、`dsh-client-ui-primitives`（+1174/−673，样式/图标/焦点环）、`dsh-client-ui-workspace`（+608/−329）、`dsh-base`/`dsh-web-app` 的 `cordis.patch.yml`。

### 2.3 关键证据链逐项

| 消费点 | 0.1.7-rc.2 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位 props（I1/I2/I4/I5） | `ui-chat` 的 `contract/slots.d.ts` 变更**全部是新增**（`shell.quota-notice` chain slot + `QuotaNotice*` 类型 + `HostObservable` import）；`conversation.chat.node` / `ConversationNodeDefinition` / `MessageImagesOwnerProps` 原样，`renderMessageImages`(19)/`loadImage`/`conversation.chat.node`(32) 符号计数逐项相等；`ui-conversation` 的 `slots.d.ts` 仅新增 `ComposerBarInjected.hooks.stopShortcut` | 逐行 diff + 符号计数 |
| fork / 队列（I6/I33/I35、G1） | **客户端契约目录 `api-session-controller/lib/types/client/**` 不在变更清单（字节未变）**；host 侧 `lib/index.js` 的 +140/−73 全在模型选择域（`buildModelCatalog`/`modelAvailable`/`hasProviderApiKey`/`initializeDefaultModel`/`requireModel`/`selectModel` 异步化），`readAttachment`/`updateQueue`/`binding`/`fork` 计数相等；探针 fork 切点锚点全绿 | 变更清单过滤 + 逐行 diff + 符号计数 + 探针 |
| 归档与导航（I7/I37） | `ui-workspace` 客户端新增快捷键系统（`installWorkspaceShortcuts`：session.fork / session.archive / 搜索）与归档筛选；`archiveSession`(34)/`unarchiveSession`(19)/`openSession`(4)/`stopActivity`(1)/`archivedSessionIds`(24) 计数相等；`derive(workspaces.list, s => new Set(s.archivedSessionIds))` 与 `uiWorkspace.unarchiveSession` 逐行核对在位 | 逐行 diff + 符号计数 |
| 回填链（I34） | `createDrafts`/`releaseDraftAttachments`/`addAttachments`/`setDraft` 计数相等；`ConversationBinding.binding()` **签名未变**，仅新增 `@throws`（未知会话/绑定过期）文档说明与 `openTurn` 只读观测；`dsh-attachment{,-local}` 字节未变 | 符号计数 + 契约 diff |
| 插件配置卡片（I12） | `ui-plugin-manager` 的 `slots.d.ts` 不在变更清单（`plugins.bundle.config` 原样）；`ui-settings` 的 `slots.d.ts` 仅动 `SettingsLauncherOwnerProps`；`dsh-settings` 字节未变 | 变更清单过滤 + 逐行 diff |
| 启动兼容门禁（rc.1 新增机制） | `dsh-app-boot` 的 `profile.d.ts`：新增 `Profile.skippedBundles` + `reportSkippedBundles`，移除 `skippedProfileBundles`；**判定逻辑未变**（仍是 peer 名 `@deepseek-ai/dsh*` + `semver.satisfies(..., { includePrerelease: true })`），仅提示从「加载时打印 stderr」改为「launcher 每次启动打印一次」；6 条 peer 对 0.1.7-rc.2 实测放行 | d.ts diff + check:dsh |
| 会话查询降级（I33） | `dsh-session-query` 的 `read()` 在投影计算失败时新增显式抛出 `SESSION_QUERY_CORRUPT_SESSION`（+7/−1，此前为静默路径）；插件对 seeded 会话已达降级 `observeSession`（restore 无 seed 校验），本变更方向与插件降级链一致 | 逐行 diff |
| 工具热更（本版新能力） | `dsh-session` 纯新增 `ToolHistoryProjection`/`toolHistory()`；`ui-chat` 新增 `developer-message` node kind；镜像 `09-architecture.md` 三处同步（含「工具变更不依赖能力；Session 工具历史提供提供方声明」）——插件零消费（不定义节点定义、不读工具历史） | 逐行 diff + 镜像比对 |
| 设计令牌（视觉） | 插件消费的 20 个 `--dsw-alias-*` 设计令牌在本版 `ui-primitives` 大面积重构后仍全部存在（`ui-primitives` 真改动集中在样式/图标/焦点环与 settings-form 字段，插件卡片走自身 CSS 常量） | 全树存在性扫描 |

## 三、结论

* **影响程度：零破坏。** rc.2 是 rc.1 的迭代补丁版（346 提交），插件消费面的客户端契约目录字节未变，12 个核心接缝包只动版本号，符号计数 0 差异；真增量全部落在官方模型选择/账号、工具热更、快捷键、归档筛选 UI、额度提示与样式层。
* **具体表现：无需改码、无功能退化。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填）、G1 陈旧排队消息清理、P0-1 运行中拦截、设置页配置卡片与快照管理均无字段/签名/语义漂移；check:dsh + 52 探针 + 装配门禁 + 436 单测四绿。
* **版本策略**：`dshReleases` 补 `0.1.7-rc.2: compatible`（台账声明）；peer 范围 `>=0.1.7-alpha.1 <0.1.8` 天然覆盖 rc.2，**无需新 tuple**（启动兼容门禁实测放行，不需要 profile 豁免）；reference 镜像按 `dsh-v0.1.7-rc.2` tag 重拉，13 源中仅 `09-architecture.md` 有实质差异（3 处替换、净 +55 字符），其余 12 份逐字节相同。
* **观察项（非阻塞）**：
  1. **`dsh-session-query.read()` 新增显式抛错**：投影失败时抛 `SESSION_QUERY_CORRUPT_SESSION`（此前静默）。插件冷会话标题/消息读取的降级路径（I33 `observeSession`）已具备 try/catch，探针与单测覆盖；后续若新增 `read()` 消费点须沿用降级惯用法。
  2. **新增 `developer-message` node kind（工具热更事件）**：插件 `conversation.chat.node` 的 key 覆盖范围是 `['user','steering']`，不命中该 kind，行为不变；若未来希望在内部消息上扩展交互，需要另行核验该 kind 的 owner props。
  3. **归档筛选三态是 UI 层新能力**：未改 `archivedSessionIds` 语义与 `openSession` 判据，I37 的「切换类导航须排除归档会话」结论继续有效；用户视角上归档会话现在可经「仅显示已归档」直接找回，与插件 `archiveOriginal` 的说明一致。
  4. **`initializeDefault` 签名破坏性变更**：`dsh-workspace`/`dsh-api-workspace-controller` 的 `initializeDefault(request, signal)` → `initializeDefault(signal)`（默认标题改取路径末段）。插件零消费此 API，无影响；如未来需要初始化默认工作区，须按新签名调用。
  5. **npm 升级操作陷阱（环境层，非 dsh 本身）**：Windows 上 npm 替换全局 bin shim 遇文件占用时不报错但只写半成品——本次留下 `.dsh.cmd-<hash>`/`.dsh.ps1-<hash>`/`.dsh-<hash>` 三个临时名文件、标准名 `dsh`/`dsh.cmd`/`dsh.ps1` 消失，`dsh` 命令一度不可用；修复＝把哈希名文件改回标准名（内容即完整 shim）。另：npm 残留副本 `.dsh-EBhnoWNL` 本次是 rc.2 自身的解包中转目录（非历史版本），**升级前若需全树基线须先自行复制整包**（rc.1 的 robocopy 快照做法）。
  6. **既有观察项延续**：`dsh-tool-jobs` 的 `maxConsecutiveWakes` 无默认值（P0-1 `agentBusy` 守卫窗口）；`sessionQuery.snapshotEvents`/`eventAt`/`ownEvents` 仍标 `@deprecated` 未移除；SSH 远端工作区仍为未覆盖场景（影子仓库假定本机文件系统）。

## 四、后续动作

1. ~~全局实装 0.1.7-rc.2 + 门禁复跑~~——已完成（§2.1）。
2. ~~归档评估 + compat-audit 头部核验段 + reference 镜像重拉 + dsh-contract / dshReleases / README 徽章同步~~——本轮完成。
3. **待办（需用户操作）**：重启 DSH / DSH-Console 进程加载新版宿主，并跑一次活体冒烟（发消息 → 改文件 → 撤回；重点确认附件回填（观察项 1 相邻链）与陈旧排队项清理）。
4. ~~环境清理~~——已完成（2026-09-24，用户指示）：评估用临时基线 `%TEMP%\dsh-rc1-baseline`（26 包 rc.1 基线，8.3 MB）、`%TEMP%\dsh-ref-rc2`（0.1 MB）与本次评估脚本/中间产物（合计 8.5 MB）全部删除；全局 npm 残留解包目录 `@deepseek-ai/.dsh-EBhnoWNL`（601.6 MB）删除后复核 `dsh --version` 仍为 `0.1.7-rc.2`、`@deepseek-ai` 下只剩 `dsh`。
