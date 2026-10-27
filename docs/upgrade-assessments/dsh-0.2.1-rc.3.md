# dsh v0.2.1-rc.3 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3)（prerelease + immutable，2026-10-23 发布，merge commit `1f81c04`，6 commits / 300 files / 3 contributors）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.1-rc.2`，本轮是**单版增量**（rc.2 → rc.3，无中间版本，首次出现相邻两版直评）。对照源：[dsh-0.2.1-rc.2.md](./dsh-0.2.1-rc.2.md)
> 评估方式：release notes 筛查 + **compare API commit/文件清单**（`dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3`）+ **两棵实装树逐文件 SHA256 对比**（rc.2 目录改名为基线、rc.3 新装，304 → 305 包，排除 `package.json`/README/yaml 后 20 包 `lib`/`dist` 漂移）+ 关键包 `lib/` 逐行 diff + **rc.3 实装门禁实跑** + 镜像第十次重拉
> 总结论：**零破坏、零改码、无需发版**。rc.3 只有 6 个 commit：插件系统侧是「Views/侧栏 More 菜单」纯加法（新增 1 个 root scope list 槽），会话侧是「新会话找回未发送草稿」的 blank 复用修复，模型侧是 API Key 路由改跟官方 `/models` 列表；`sessions.fork`、slot 定义方、输入区写入链、设置面、兼容门禁全部逐字节零变更。

## 一、更新日志梳理与初步判断

**版本链路**：`0.2.1-rc.2`(10-17) → `rc.3`(10-23)，中间无其他版本。release notes 只有 3 条（2 条 IMPROVEMENTS + 1 条 CHORES），**无 BREAKING CHANGES 章节、无迁移说明、无弃用提示**；compare API 实测 `ahead_by=6`，与 notes 规模自洽（不存在「notes 漏写大改动」）。

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **左/右侧栏与会话视图新增「更多 / More」菜单，用于浏览与创建插件** | 新增（notes） | **中相关**——插件系统 UI 面，可能新增 slot 或改变 slot 目录 | **零破坏 + 纯加法**——实为新增客户端包 `dsh-client-ui-entry-customization`（304 → 305 包），只声明并注册三个 root scope list 槽：`sidebar.panellist.actions` / `conversation.session.header.views.actions` / `sidebar.right.tab.guide.actions`；插件四个注册 key（`conversation.chat.node` / `conversation.chat.assistant-actions` / `settings.plugin.item` / `plugins.bundle.config`）无一被占位或改签名（§2.3） |
| **修复切换会话后点「新会话」找不回未发送草稿** | 修复（notes） | **高相关**——直击草稿链，而撤回回填（`fillDraft`）与编辑重发都写草稿 | **零影响**——改动全部在 `ui-workspace.startSession` / `connectBlank` / `createInWorkspace`（新会话改为复用 blank，跳过 preset 不匹配的 blank）；并给 `DraftInitializationOptions` 新增可选 `whenDraftExists: 'replace' \| 'append' \| 'keep'`。插件走的是 `conversation.input.shell().actions.setDraft` + `createDrafts`/`addAttachments`，**从不调用 `startSession`/`initializeDraft`**；且 `whenDraftExists` 缺省语义与旧 `clearPreviousDraft` 完全等价（旧行为 = 新默认），是兼容超集（§2.3） |
| **DeepSeek API Key 适配器的模型列表更新方式与账号登录模式一致** | 变更（CHORES） | 低相关——编辑卡有模型菜单，读 `ctx.modelDirectories` | 零影响——commit `c48f852` 只改 Host 侧 `dsh-llm-deepseek` / `-account` / `-api-key` 的目录构建（API Key 路由改为跟随官方 `/models` 列表，`-account` 的 `catalog`/`listing`/`resolve-catalog` 三份类型下线并合并）；客户侧目录契约包 `dsh-client-ui-model-selection` **逐字节零漂移**，插件读的 `groups[].models[]` 形状不变，仅「可选模型列表」内容随时间动态化（§2.3） |

**初步判断即成立**：三条里唯一需要深挖的是第 2 条（草稿），第 1 条需确认 slot 目录未被动过，第 3 条只是数据来源变化。三者核查后均**不触及插件消费面**。

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-rc.3 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run test:probe` | **58/58 全绿**（api-surface 56 + stdin-write 2）——`conversation.chat.node` props、`conversation.chat.user.content` / `conversation.user.text` Factory、`sessions.fork`、输入区写入链（`setDraft` / `addAttachments` / `submit` / `snapshot` / `createDrafts`）等字段假设在 rc.3 下全部成立；其中输入区 4 条为本轮补（§2.5 #3），版本核验当时的基线是 54/54 |
| `npm run verify:host` | **装配断言全部通过**（inject=shell,sessions,agents，端点 13 项，agents 桩访问 1 次）；stderr 的 `ensureGit: 未检测到 git CLI` 是桩环境既有告警 |
| `npm run check:dsh` | 六条 `@deepseek-ai/dsh-*` peer 对 `0.2.1-rc.3` **全部在范围内**（同 tuple `0.2.1` 的 prerelease 门槛天然放行）；cordis `4.0.5`、schemastery `3.18.4` 在窗口内；台账两项（镜像 / 契约文档版本字段）按流程漂移报红后已同步，复跑全绿 |
| 单测 / client / typecheck | **未重跑**——本轮零源码改动，沿用 2.5.0 发版结果 |
| `lib/` 重建 | **未重建**——零源码改动，`lib/` 与已提交产物一致 |
| 宿主启停冒烟 / 浏览器活体 | **未做**——版本适配核验，非发版前全链冒烟 |

升级副作用：`npm install -g` 两次直接失败，报 `[safe-delete] ... trash operation`（旧 rc.2 目录无法被 npm 垃圾箱回收）；把旧目录手工改名让开后安装成功（`added 614 packages in 1m`）。rc.2 那轮是「留下 `.dsh-*` 暂存」，本轮是「回收旧目录失败」，同属 npm 清理环节的 Windows 侧抖动——**不是 dsh 包问题**，处置后无其他残留。

### 2.2 包集合与漂移面

**包集合 304 → 305**：无移除，**仅新增 `dsh-client-ui-entry-customization`**（More 菜单宿主）；`@deepseek-ai/dsh*` lockstep `0.2.1-rc.2 → 0.2.1-rc.3`，第三方依赖（cordis / schemastery / pi-ai）零变化。前端产物 `dsh-web-frontend/dist` 仅换哈希指纹（`index-BxpfOGf3.css` / `index-CN7NIWNw.js` 退场）。

**`lib`/`dist` 漂移 20 包**（排除 `package.json` 版本号与 README）——按对插件的影响分类：

- **有内容变更、插件不消费**：`dsh-client-ui-conversation`（新 slot + 草稿初始化可选项 + View 固定/更多菜单 + analytics）、`dsh-client-ui-workspace`（新会话 blank 复用）、`dsh-client-ui-plugin-manager`（`openList()`）、`dsh-client-ui-sidebar` / `-sidebar-right`（More 菜单槽）、`dsh-client-ui-agent-preset`（预设选取结算语义改为返回 kind，附分析事件）、`dsh-llm-deepseek` / `-account` / `-api-key`（模型目录来源）、`dsh-web-app/cordis.patch.yml`（+5 行挂 `entry-customization`）。
- **小幅行为/字面量**：`dsh-client-ui-settings-general`（「通用」页开发者工具开关改为先读设置再写；版本展示字面量）、`dsh-client-ui-settings-account`（版本字面量）——两者都不经插件消费面（插件设置卡片挂 `settings.plugin.item` / `plugins.bundle.config`）。
- **仅数据/教学/指纹**：`dsh-client-modules`（commit 字面量 `332895e` → `be72761`）、`dsh-cordis-client-runner`（slot 教学目录：新增 `conversation.session.header.views.actions` 条目、`startSession`/`connectWorkspace`/`DraftInitializationOptions` 描述与行号）、`dsh-tool-cordis/lib/types/api-catalog.js`（API 目录新增 `AnalyticsPreset` 与 `send_button_click` 两字段）、`dsh-agent-preset/skills/**`（合成参考文档）、`dsh-api-remotes/lib/client.js`（分析事件 zod schema 加 `is_new_session` / `agent_preset`）、`dsh-client-product-analytics`（事件契约）、`dsh-web-frontend/dist`（构建指纹）。

**逐字节零漂移（插件消费面，重点）**：`dsh-session`（`sessions.fork` + 事件表）、`dsh-session-query`、`dsh-session-persistence`、`dsh-settings`、`dsh-shell`、`dsh-workspace`（`archiveSession`）、`dsh-api-session-controller`（**运行时 JS**；仅客户端 `service.d.ts` 一行注释改写）、`dsh-api-gateway`、`dsh-host-webserver`、`dsh-cordis-host-runner`（host 插件加载器）、`dsh-host-plugin-inventory`、`dsh-host-frontend-static`、`dsh-app-boot`（兼容门禁）、`dsh-plugin-manager`、`dsh-hmr`、`dsh-base`、`dsh-agent`、`dsh-attachment`、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-ui-chat`（slot 定义方）、`dsh-client-ui-attachment`、`dsh-client-ui-renderer`、`dsh-client-ui-slots`、`dsh-client-ui-settings-plugins`、`dsh-client-ui-secret-mask`、`dsh-client-ui-model-selection`（`ctx.modelDirectories` 契约）。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-rc.3 实装结论 | 出处 |
|---|---|---|
| 撤回按钮槽位（`conversation.chat.node`） | slot **定义方 `dsh-client-ui-chat` 整包逐字节零变更**；`ui-conversation` 的 `slots.d.ts` 只新增 `conversation.session.header.views.actions`（list / root）与配套 `ConversationViewActionEntry` / `ConversationViewActionsOwnerProps`，未改动既有槽 | 两树哈希 + `slots.d.ts` diff |
| 新增槽冲突面 | 新槽在**会话头 View 标签行的 More 菜单**里，与撤回按钮所在 `conversation.chat.node` 无 key / priority 竞争；`entry-customization` 只 inject 三个 `*.actions` 槽（`sidebar.panellist.actions` / `conversation.session.header.views.actions` / `sidebar.right.tab.guide.actions`），与插件四个注册 key 零交集 | 新包 `lib/client.js` + 目录探针 |
| fork / 队列（`sessions.fork`、`updateQueue`） | `dsh-session`、`dsh-session-query`、`dsh-api-session-controller`（运行时）**整包逐字节零变更**；`updateQueue` 未动 | 两树哈希 |
| 归档 / 导航（`archiveSession` / `openSession` / `unarchiveSession`） | `dsh-workspace` 零变更；`ui-workspace` 的 diff 全部落在 `startSession` / `connectBlank` / `createInWorkspace`，**`openSession` / `unarchiveSession` 一行未动**（版本翻页器与撤回后的打开链不受影响） | `ui-workspace/lib/client.js` diff（+21/−20 全在新建会话路径） |
| 回填链（`fillDraft`） | `setDraft` 实现只是把「清空 root + 逐行追加段落」抽成 `$appendParagraphs` 供 `appendDraft` 复用，**行为等价**；`createDrafts` / `releaseDraftAttachments` / `addAttachments` / `submit` / `snapshot.draft` 未动。新增的 `whenDraftExists` 作用于 `DraftInitializationOptions`（`startSession` / 新任务请求入口），插件不调用；缺省值 `clearPreviousDraft === true ? 'replace' : 'keep'` 与 rc.2 分支等价，`append` 才走新 `DraftEditorRuntime.appendDraft` | `ui-conversation/lib/client.js` + `contract/input.d.ts` diff |
| 用户消息内容 / 图片渲染（`renderFactorySlot` / `loadImage`） | `ui-chat` / `ui-conversation` 的 `chat.user.content` / `user.text` Factory 契约、`ui-renderer`、`ui-attachment` 零变更；未引入第三个内容渲染入口 | 两树哈希 + probe 绿 |
| 密钥脱敏与回填 | `ui-secret-mask` 零漂移且仍只作用于渲染层，回填 draft 取会话原文 | 两树哈希 |
| 设置卡片与配置 | `dsh-settings`、`dsh-client-ui-settings-plugins` 零变更；`settings.plugin.item` / `plugins.bundle.config` 双面仍在；`dsh-client-ui-settings-general`（通用页开发者工具开关改为先读后写）与 `-account`（版本字面量）的漂移都在官方自己的设置页，与插件卡片无关 | 两树哈希 |
| shell 执行接缝 | `dsh-shell` 零变更 | 两树哈希 |
| 插件宿主 / client 加载（`__ModuleLoader__` / react 供给） | `dsh-cordis-host-runner`、`dsh-host-plugin-inventory` 零变更；`dsh-cordis-client-runner` 仅教学目录数据；`dsh-client-modules` 仅 release commit 指纹（ReleaseChangeGate 行为不变） | `client-modules/lib/index.js` diff |
| 事件触发与 cutSeq | `user/message` / `turn/end` 链条零相关改动（`dsh-session` 整包逐字节相同 ⇒ 事件集 62 种不变） | 两树哈希 |
| 编辑卡模型菜单 | `dsh-client-ui-model-selection` 零变更（`directoryFor` / `load` / `select` 面不变）；`llm-deepseek*` 只换目录**数据来源**，插件按能力探测读取，菜单内容随官方列表刷新 | 两树哈希 + commit `c48f852` |

### 2.4 兼容性门禁与 peer 判定

`dsh-app-boot` 的 `unmetRequirements`（`engines.dsh` 优先 + 未声明回落 peer）在 rc.3 **逐字节零变更**。本插件 `engines` 仅 `{node:">=20"}`（无 `dsh` 键）→ 走 peer 路径；六条 `@deepseek-ai/dsh-*` peer（当前线 `>=0.2.1-alpha.1 <0.3.0`）对 `0.2.1-rc.3` 全部满足（`check:dsh` 实测）。**策略结论不变：维持不声明 `engines.dsh`**（多段逐线窗口无法用单段等价表达，声明即短路 peer 判定并放行未验证版本，见 I43）。

### 2.5 观察项与处理结果

| # | 观察项 | 处理 |
|---|---|---|
| 1 | npm `latest` dist-tag 停在 rc.2（rc 线发在 `next` 上），`check:dsh` 会把「已发布」误显示成「无新版本」 | **已修（工具）**——`check-dsh-version.mjs` 改读 `dist-tags`，取 `latest` / `next` 中较新者作判定基准，并在该行注明依据：`✓ npm 最新 dsh: 0.2.1-rc.3（无新版本）（dist-tags: latest 0.2.1-rc.2 / next 0.2.1-rc.3，按较新者判定）`。dist-tag 本身仍滞后，但不再影响判定；新增 5 条单测（含「两标签相同时不输出说明」的噪音守卫） |
| 2 | 新槽 `conversation.session.header.views.actions` / `sidebar.panellist.actions` 可作插件入口停靠位 | **评估后不采用**——这两处是「浏览/创建插件」的 More 菜单行，撤回入口的语义落点是「这条消息」旁边（`conversation.chat.node`）；搬到视图头/侧栏会让撤回脱离消息上下文。保留为未来常驻入口（如快照管理）的备选接缝 |
| 3 | 官方把「已有草稿怎么处理」显式化（`whenDraftExists`），插件依赖 `setDraft` 的覆盖语义 | **已补护栏（测试）**——核对发现此前 `tests/probe` 对输入区写入链**零覆盖**，原判断「probe 会先红」不成立。已新增 4 条探针：`InputActions` 三件套（`setDraft(text: string)` / `addAttachments` / `submit()`）、`InputState.draft`、`SessionInputShell.actions` + `get snapshot()`、`createDrafts` / `releaseDraftAttachments`。官方重排这一面（改名、把 `setDraft` 并入策略模型、删 `snapshot`）即红 |
| 4 | 本轮未做活体冒烟 | **已补宿主启停冒烟**——`dsh --profile web --no-open --port 3099`（web profile 以 `link:` 指向本仓库，跑的就是提交在案的 `lib/`）：端口正常监听、页面 `HTTP 200`（41 KB，含插件客户端脚本）、stderr 仅 `recall shell dialect probe: pwsh`（**零 compat / skip / error**）、停止后端口释放。浏览器内撤回全链仍未跑（版本适配核验不需要，发版前按清单补） |
| 5 | 既有观察项延续 | 维持：远程非 owner 403、`fork.onCreated` 未用、旧面 `renderMessageImages` 分支保留至 ≤0.2.1-alpha.2 线退出窗口、`conversation.chat.user.content` 为内容级 Factory |

## 三、结论

* **影响程度：零破坏、零改码、无需发版。** rc.3 六条 commit 中，插件系统侧是新增包 + 三个 root scope list 槽的纯加法，会话侧是新会话 blank 复用的内部修复，模型侧是目录数据来源切换；`sessions.fork`、slot 定义方、输入区写入链（`setDraft` / `createDrafts` / `addAttachments` / `submit`）、归档与打开、设置面、shell 接缝、兼容门禁全部逐字节零变更。
* **方向：正向（间接）。** ① 新会话不再丢未发送草稿——撤回/编辑回填后切走再点「新会话」能找回草稿，回填链的落地体验更有保障；② 会话视图与侧栏的「更多」菜单让插件入口有了官方停靠位（本轮未用）；③ API Key 路由的模型列表与账号模式统一，编辑卡模型菜单内容更贴近官方实际可用列表。
* **风险点（已被护栏覆盖）：** 唯一需要「盯」的是官方把草稿策略显式化（`whenDraftExists`）——插件回填依赖 `setDraft` 的覆盖语义。此前只有运行时能力探测兜底（探针零覆盖），本轮补上输入区写入链的 4 条探针后，官方改名、删 `snapshot` 或把 `setDraft` 并入策略模型都会先红。
* **版本策略：无需追加 peer 段。** `0.2.1-rc.3` 与既有 `>=0.2.1-alpha.1 <0.3.0` 同 tuple；cordis / schemastery 未动。
* **台账动作（本轮已完成）：** ① `dshReleases` 补 `0.2.1-rc.3`；② `docs/reference/` 第十次重拉（13 源**逐字节相同**，仅更新头部两字段）；③ `docs/dsh-contract.md` 对应版本与沿革 ⑪；④ `docs/compat-audit.md` rc.3 核验段；⑤ README 双语徽章 / 范围；⑥ CHANGELOG 兼容条目；⑦ 观察项处理带来的工具与测试加强——`check:dsh` 改读两 dist-tag（+4 单测）、`test:probe` 补输入区写入链 4 条（54 → 58）、宿主启停冒烟复跑。`src/` 零改动、`lib/` 未重建，仍**无需发版**。
