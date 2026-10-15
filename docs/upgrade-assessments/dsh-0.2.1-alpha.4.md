# dsh v0.2.1-alpha.4 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-alpha.4](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.4)（prerelease，2026-10-15 发布，commit `86a4022`；`npm view @deepseek-ai/dsh version` 实测仍为 0.2.0-rc.2，本版需精确版本号安装）
> 本地基线：全局实装 `@deepseek-ai/dsh@0.2.1-alpha.4`（`npm ls -g` / `dsh --version` 实测；升级前基线（alpha.3）由 npm registry tarball 重建，对照源：[dsh-0.2.1-alpha.3.md](./dsh-0.2.1-alpha.3.md)）
> 评估方式：release notes 逐条筛查 + **双 lockfile 包清单精确对比**（alpha.3 / alpha.4 各在独立临时目录 `npm install --package-lock-only` 生成——同布局、同平台策略，消除「实装树 vs lockfile」的平台包噪声）+ **32 个关键包 `lib/` 目录逐字节 diff**（alpha.3 tarball 从 registry 下载解压 vs 本机 alpha.4 实装；只 diff `lib/`，排除实装树包内嵌套 `node_modules` 的 12 万行假差异）+ **门禁实跑（含宿主启停冒烟）** + 全树字面量检索（slot 名 / `engines.dsh` / `dshReleases` / 消费符号正向统计）
> 总结论：**零破坏、零改码、无需发版**。本版对插件作者的唯一直接影响（`engines.dsh` 优先判定）不作用于本插件——未声明 `engines.dsh` → 沿用 peer 判定（与 alpha.3 逐字节同逻辑），六条 `@deepseek-ai/dsh-*` peer 全满足；输入链「命令芯片」重构不改变 `setDraft`/`createDrafts` 等消费面；客户端三基础包内联化对插件透明（bundle 仅 require react）；`dshReleases` 经全树检索确认**无 dsh 本地消费方**（纯台账字段）。

## 一、更新日志梳理与初步判断

release notes 共 8 条（新增 2 / 修复 5 / 其他 1）。下表逐条筛查与插件系统 / 消息处理 / API 接口相关的条目及核查结果：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **第三方插件兼容性优先按 `engines.dsh` 判断；未声明时沿用原有规则**（提示插件作者检查声明覆盖范围） | 其他 | **高相关**——插件加载门禁 | **零影响**——判定实现重写于 `dsh-app-boot`（`unmetRequirements`）：声明 `engines.dsh` 则只查它并短路 peer；**未声明走 peer 判定（逐字节同 alpha.3）**。本插件 `engines` 仅 `{node:">=20"}`（无 `dsh` 键）→ 走 peer 路径 → 六条范围对 0.2.1-alpha.4 全满足（§2.4） |
| **自定义插件索引源**：可从自定义源发现 / 安装插件（Discover 页） | 新增 | **高相关**——插件分发生态 | 零交集（可选机会）——新增实验链路 `dsh-plugin-market`（服务端）＋ `dsh-plugin-market-index`（索引格式 format 1 校验库）＋ `dsh-client-ui-plugin-market`（Discover 页）＋ `dsh-experimental-plugin-market-bundle`；市场侧对索引条目用同一 `evaluatePluginCompatibility` 评估兼容性。现有 npm / DSH-Store 安装方式不变，插件无必须整改项（观察项 ③） |
| **修复命令与参数交界处输入异常**（命令可整体选中 / 删除，撤销或刷新后恢复） | 修复 | **高相关**——输入链触及插件草稿回填 | **零破坏**——落地为「命令芯片（CommandChip）」重构：`ui-conversation`（17 文件 / client.js 480 行）＋ `ui-input-trigger` ＋ `ui-commands`（均为编辑器内部机制）。插件消费面不变：`setDraft(DraftInput)` 签名未变（`DraftInput = string \| DraftSnapshot`，传 string 仍合法）、`createDrafts` / `releaseDraftAttachments` / `addAttachments` 未动；文本开头命令 token 仍由 Enter 裁决（同 alpha.3 行为）。**正向**：命令文本的编辑体验改善惠及插件回填（§2.3） |
| 自定义模型 API 支持在 UI 中配置各模型推理等级 | 新增 | 低相关 | 零交集——落点模型设置面，插件不消费 |
| 改进 Office 文件交付（不再引用已删除预览图等） | 修复 | 低相关 | 零交集——落点 skill-office / 交付面 |
| 修复开发者工具启用后需刷新页面才能打开面板 | 修复 | 低相关 | 零交集——落点开发者工具面板 |
| 减少 Linux 启动命令前的重复检查（启动开销 / 旧 systemd 兼容） | 修复 | 低相关 | 零交集——落点平台启动面（win32 不受影响） |
| 修复命令执行失败时未呈现有效状态信息 | 修复 | 低相关 | 零交集——落点工具执行状态展示面 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-alpha.4 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run test:probe` | **53/53 全绿**（双面契约断言：旧面 `renderMessageImages` / 新面 `renderFactorySlot` + `loadImage` + 文本投影 `conversation.user.text` 条件钉全部成立——图片与文本两代入口在 alpha.4 下均未漂移） |
| `npm test` / `npm run test:client` | **499/499**（39 文件）、**93/93**（6 文件） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run typecheck` | `tsc --noEmit` 零错误 |
| `npm run check:dsh` | **全绿**（台账同步后：镜像 / 契约文档版本字段同步至 0.2.1-alpha.4、六条 peer 全满足、cordis 4.0.5-alpha.2 在窗口内；同 tuple，peer 窗口无需追加） |
| `npm run check:upgrade` | **三层门禁全绿**（verify:host 装配断言 + 版本巡检 + 单一事实源一致性） |
| 宿主启停冒烟（web profile，alpha.4） | **通过**——`dsh web --no-open --port 3099` 启动零 compat/skip（stderr 仅插件自身 `recall shell dialect probe: pwsh` 与第三方 `dsh-better-sidebar` 的既有 pending）、端口正常监听、进程已停；插件 **2.4.11 实装**（`dependencies` 与 `node_modules` 双确认）且无版本豁免记录（未被兼容门禁拦截） |
| `lib/` 重建 | **未重建**——本轮零源码改动，`lib/` 与已提交产物一致（无代码变更即无新鲜度问题） |

### 2.2 差异比对方法与包集合

**方法**：alpha.3 / alpha.4 各在独立临时目录用 `npm install --package-lock-only @deepseek-ai/dsh@<ver>` 生成完整依赖树 lockfile（两树条目 615 / 617），按包名 + 版本集合精确对比——同布局、同平台策略，消除平台包噪声；再对 32 个关键包从 registry 下载 alpha.3 tarball 解压，与本机 alpha.4 实装做 `git diff --no-index <a3>/lib <a4>/lib` 逐字节比对（**只 diff `lib/`**：实装树包内带嵌套 `node_modules`（a4 侧 758 文件 vs a3 侧 40 文件），全目录 diff 会产生 12 万行假差异）。

**包集合**：
- **第三方依赖零变化**（cordis 保持 4.0.5-alpha.2、schemastery 等全部未动）。
- **移除 3**：`dsh-client-store`、`dsh-client-ui-primitives`、`dsh-client-ui-slots`——**从运行时依赖树消失**（构建期内联进消费方 bundle；alpha.4 中仍以 devDependencies 形式被 `ui-conversation` 等引用、不再作为独立包安装）。
- **新增 5**：`dsh-plugin-market`、`dsh-plugin-market-index`、`dsh-client-ui-plugin-market`、`dsh-experimental-plugin-market-bundle`（如上）+ `minisearch@7.2.0`（市场搜索）。
- 版本线：`@deepseek-ai/dsh*` lockstep `0.2.1-alpha.3 → 0.2.1-alpha.4`（289 项）。

**32 个包 `lib/` 逐字节 diff 结果**——有变更 10 个：`ui-conversation`（1244 行）、`ui-plugin-manager`（1024）、`api-remotes`（828）、`client-modules`（501）、`plugin-manager`（385）、`app-boot`（205）、`cordis-client-runner`（132）、`ui-input-trigger`（87）、`ui-commands`（58）、`api-session-controller`（13）；**零变更 22 个**：`dsh-session`、`dsh-settings`、`dsh-shell`、`dsh-session-query`、`dsh-session-persistence`、`dsh-host-webserver`、`dsh-workspace`、`dsh-host-plugin-inventory`、`dsh-cordis-host-runner`（**host 插件加载器**）、`dsh-client-connection`、`dsh-api-gateway`、`dsh-host-frontend-static`、`dsh-client-locale`、`dsh-client-ui-chat`（**slot 定义方**）、`dsh-client-ui-attachment`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-settings-plugins`、`dsh-sandbox-policy`、`dsh-pwsh-local`、`dsh-package-manifest`。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-alpha.4 实装结论 | 出处 |
|---|---|---|
| 图片渲染入口（I2，双面契约） | `renderFactorySlot`（5 处）、`loadImage`（6 处）在 `ui-conversation` 中仍在，且该包 diff 对这两符号 **0 命中**（未动）；slot 名 `conversation.chat.user.content` / `conversation.chat.user.images` / `conversation.chat.message.images` 全树检索有效（`ui-chat` 与 `cordis-client-runner` 承载）；**`ui-chat`、`ui-attachment`、`ui-renderer` lib 逐字节零变更** | 符号正向统计 + lib diff |
| 撤回按钮槽位（I1/I3/I4/I5） | `conversation.chat.node` slot 名全树在位（ui-chat 零变更即定义未动）；`ui-chat` 作为节点渲染方整包 lib 零变更 | 全树检索 + lib diff |
| fork / 队列（I6/I33/I35、G1） | `dsh-session`（`sessions.fork` 所在）**lib 逐字节零变更**；`updateQueue` 相关实现未动 | lib diff |
| 归档 / 导航（I7/I37） | `dsh-workspace` **lib 零变更**；归档（含 `stopActivity`）与 `openSession` 面未动 | lib diff |
| 回填链（I34 + `refillDraft`） | 结构重构但**用法不变**：`setDraft(text: DraftInput)` 签名未变（`DraftInput = string \| DraftSnapshot`，插件传 string 仍合法）；`createDrafts` / `releaseDraftAttachments` / `addAttachments` 未动；变更全部在编辑器内部（`DraftSnapshot` 增可选 `command?: {token}`、`InputEvent` 载荷 `draft: string` → `command: CommandClaim \| undefined`、新增 `resolveClaim` / `matchClaim` 恢复链）；文本开头命令 token 仍由 Enter 裁决 | 类型 diff + 符号统计 |
| shell 执行接缝（I36/I38） | `dsh-shell`、`dsh-sandbox-policy`、`dsh-pwsh-local` **lib 零变更** | lib diff |
| 设置卡片与配置（I12/I39） | `dsh-settings`、`dsh-client-ui-settings-plugins` **lib 零变更**；`plugins.bundle.config` slot 名全树在位（`ui-plugin-manager` 定义方承载）；新增 `plugins.tab` 扩展点（市场 Discover 用，纯加法、无 key 冲突） | lib diff + 全树检索 |
| connection / API 路由（I32） | `dsh-client-connection`、`dsh-api-gateway`、`dsh-host-frontend-static`、`dsh-client-resources` **lib 零变更** | lib diff |
| 会话 API（fork / 消息） | `dsh-api-session-controller` 唯一变更 = `RemoteErrorDetailsMap` 新增 `plugin-market/*` 错误码声明（**纯加法**，会话方法面零变化） | 逐行 diff |
| 插件宿主加载（host 侧） | `dsh-cordis-host-runner`、`dsh-host-plugin-inventory` **lib 零变更**——插件生命周期 / apply 流程未动 | lib diff |
| 插件 client 加载（I13） | `dsh-cordis-client-runner` 132 行**全部是 slot 契约教学数据**（source 行号 + 新增 `plugins.tab` 文档条目），加载逻辑零变更；`__ModuleLoader__`/react 供给未动 | 逐行 diff |
| 事件触发与 cutSeq | alpha.3 轮已核的 `user/message` / `turn/end` 链零相关改动（`dsh-session` lib 零变更即含事件类型表） | lib diff |

**「内联化」的透明性**：插件 client bundle 仍只 `require("react")`（构建脚本断言钉住），经 `ctx.slots` 等服务消费官方能力，**从不直接 import** 被内联的三个包——`dsh-client-store` / `ui-primitives` / `ui-slots` 退出运行时树对插件零影响。

### 2.4 兼容性门禁变更（`engines.dsh` 优先）详述

**变更内容**（`dsh-app-boot/lib/types/plugin-compatibility.js` 逐行 diff，alpha.3 → alpha.4）：

```text
alpha.3：evaluatePluginCompatibility 只查 peerDependencies 的 @deepseek-ai/dsh[-*] 条目
alpha.4：新增 unmetRequirements() ——
  ① manifest 声明了 engines.dsh → 只查它（peerDependencies 被忽略，短路）；
  ② 未声明 → 沿用 peer 判定（逐字节同 alpha.3 逻辑）；
  ③ 空 / 非法范围（含 workspace: 形式的 engines.dsh）一律判为未满足；
  判定式：semver.satisfies(runtime, range, { includePrerelease: true })
```

判定结果字段 `peers` → `requirements` 改名，贯穿 `dsh-plugin-manager` 的 API schema、版本豁免机制与插件管理页文案（`reasonIncompatibleVersion` 占位符 `{peers}` → `{requirements}`）；`dsh-plugin-market` 对市场索引条目（`version.engines.dsh`）用同一判定函数做兼容性评估。

**对本插件的判定路径与结果**：
- 本插件 `package.json` 的 `engines` 仅有 `{node:">=20"}`（**无 `dsh` 键**）→ `Object.hasOwn(engines, "dsh")` 为假 → **走 peer 路径（原规则）**；
- 六条 `@deepseek-ai/dsh-*` peer（当前线 `>=0.2.1-alpha.1 <0.3.0`）对 runtime `0.2.1-alpha.4` **全部满足** → 门禁通过，加载 / 激活不受影响；cordis / schemastery 不参与判定（非 `dsh[-*]` 前缀）；
- `npm run check:dsh` 与 `test:probe` 均实证此结论。

**策略结论：维持不声明 `engines.dsh`。** 本插件的兼容窗口是多段逐线验证的精确范围（`0.1.2-alpha.1` ~ `0.2.1` 线，覆盖六条 peer 段），单段 `engines.dsh` 无法等价表达、且会**放宽未验证版本**（如把 `0.1.8-*` / 未验证的 `0.2.0` 正式版也标为兼容）；且一旦声明即短路 peer 判定，多段窗口的精确性全部丢失。若未来官方 / 商店明确要求声明，可用 `>=0.1.2-alpha.1 <0.3.0`，但需接受上述放宽。

### 2.5 观察项（非阻塞）

1. **`dsh.compatibility.dshReleases` 无 dsh 本地消费方（本轮全树检索确认）**：350+ 包全树搜 `dshReleases` 零命中——它是 DSH-Store / 台账元数据，**不参与启动门禁**（门禁只看 `engines.dsh` 或 peerDependencies）。补 `0.2.1-alpha.4: compatible` 是台账一致性动作，不影响插件在 alpha.4 的加载。
2. **ReleaseChangeGate（`dsh-client-modules` 新增）**：页面 boot release ≠ host release 时暂停模块图应用 / 插件更新，直到刷新页面；配套新提示条 `HostReleasePrompt`（`settings.general` slot，id `host-release-change`）。升级 dsh 后旧页面不再加载新 release 的模块——对插件更新 / HMR 场景是**正向加固**（防跨 release 混用模块），不影响运行时功能。
3. **插件市场（Discover + 自定义索引源）为实验链路、默认未启用**：索引格式 format 1（JSON 校验、相对 icon 解析、engines 元数据），新增 `plugins.tab` 页签扩展点。**实测本机 desktop / headless / web 三 profile 的 bundles 清单均未含 `dsh-experimental-plugin-market-bundle`**（需显式启用才有 Discover 页）。生态机会（未来可选上架索引，条目可携带 engines / metadata / icon），非必须动作。
4. **声明 `engines.dsh` 将短路 peer 判定（新知识，供 compat-audit 参考）**：这是一个「声明即替换判定源」的机制——比 peer 判定更强的耦合；建议在 compat-audit 增记一条观察（如 I42），钉住「本插件不声明 engines.dsh」的决策与理由。
5. **内联化趋势的延续观察**：本版三个 client 基础包（store / primitives / slots）退出运行时树——若未来官方进一步内联 `ui-conversation` / `ui-chat` 等**插件实际依赖的 slot 承载包**，需重新评估（当前插件不直接 import 它们，风险面为官方 ModuleLoader 模块表变化，暂未见）。
6. **既有观察项延续**：`fork.onCreated` 未用、`appendPluginRecord` 有 verify gate、`sessionQuery` 三 API 仍 `@deprecated`、旧面 `renderMessageImages` 分支保留至 ≤0.2.1-alpha.2 线退出窗口、`conversation.chat.user.content` 为内容级 Factory（若官方要求 chat.node 贡献者不得直接渲染需随 I2 复查动作重适配）。
7. **未做活体冒烟**：本轮零代码改动 + `test:probe` 53/53 已实证契约面，未做真宿主活体冒烟（alpha.3 轮的操作链冒烟记录见 [smoke-checklist-records.md](../plans/completed/smoke-checklist-records.md) 2026-10-15 节，可作最近一次全链实弹基线）。

## 三、结论

* **影响程度：零破坏、零改码、无需发版。** 本版为插件生态与输入体验版本，插件全部消费面（图片 / 文本投影双链、撤回按钮槽位、fork / 队列 / 归档、回填链、设置卡片、shell 接缝、host / client 插件加载器）经 32 包 `lib/` 逐字节 diff 与门禁实跑证实**无一破坏**；`engines.dsh` 优先判定不作用于本插件（未声明 → 沿用 peer 判定，六条全满足）。
* **具体表现：** 插件 2.4.11 可直接运行在 dsh 0.2.1-alpha.4 上，行为与 alpha.3 完全一致；纯正向收益——命令参数输入修复（整体选中 / 删除、撤销 / 刷新恢复）改善回填命令消息的编辑体验；ReleaseChangeGate 加固升级场景的模块一致性。
* **版本策略：无需追加 peer 段。** `0.2.1-alpha.4` 与既有 `>=0.2.1-alpha.1 <0.3.0` 同 tuple，prerelease 门槛天然放行；cordis 4.0.5-alpha.2、schemastery 均未动。**维持不声明 `engines.dsh`**（理由见 §2.4）。
* **台账动作（待办，需用户确认后执行）：** ① `package.json` 的 `dsh.compatibility.dshReleases` 补 `0.2.1-alpha.4: compatible`；② 重拉 `docs/reference/` 镜像（`check:dsh` 当前报漂移）×并更新 `docs/reference/README.md` 归档版本字段；③ `docs/dsh-contract.md` 对应版本字段更新（按第七节重核——本轮已按 lib 逐字节 diff 完成重核，结论零破坏）；④ compat-audit 头部核验段可补记本版，新增观察项「声明 engines.dsh 短路 peer 判定」（§2.5④）。
