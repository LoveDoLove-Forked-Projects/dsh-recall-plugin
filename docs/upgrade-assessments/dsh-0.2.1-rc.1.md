# dsh v0.2.1-rc.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)（prerelease，2026-10-17 发布，commit `1600d8a`，0.2.1 线首个候选版，22 位贡献者；Full Changelog `dsh-v0.2.0-rc.2...dsh-v0.2.1-rc.1`）
> 本地基线：插件上一核验版本 `0.2.1-alpha.4`，按 **alpha.4 → alpha.5 → rc.1** 评估；本机未单独实装 rc.1（升级路径为 alpha.4 → rc.2，见 [dsh-0.2.1-rc.2.md](./dsh-0.2.1-rc.2.md)），rc.1 结论由双 lockfile + 双侧 tarball diff 静态核验，并与 rc.2 实装门禁互证
> 评估方式：release notes 逐条筛查 + **双 lockfile 包清单精确对比**（alpha.4 / rc.1）+ **36 个关键包 `lib/` 双侧 tarball 逐字节哈希/diff**（两版均从 registry 下载，排除实装树污染）+ **rc.1 ↔ rc.2 同清单对比**（判断 rc.2 门禁结果可否外推）
> 总结论：**零破坏、零改码、无需发版**。rc.1 的 release notes 是**汇总性**的（覆盖 v0.2.0-rc.2 以来的 alpha.1~alpha.5 全部内容），其中 15 条破坏性/需迁移条目逐条排除——插件未注册 stats、不用 `invariant` / 工具展示 `both` / Agent Team、不读凭据、走 bundle patch 与 peer 判定路径；36 个关键包仅 3 处非功能漂移，`sessions.fork` / slot 定义方 / 设置面 / 门禁全部逐字节零变更。

## 一、更新日志梳理与初步判断

**先厘清版本关系**：rc.1 不是「alpha.5 + 一个小版本」，而是 0.2.1 的首个候选版——release notes 把自 `v0.2.0-rc.2` 以来的变更全部汇总重述（新增 20 / 优化 21 / 修复 38 / 其他变更 20，其中 15 条标注为破坏性或需迁移），**大多数在 alpha.1~alpha.5 已落地**。因此对 rc.1 的评估等价于「alpha.4 以来累计变更」的复核，不能把汇总条目当作 rc.1 单版新增。

表格只列与插件系统 / 会话 API / 消息处理相关的条目（其余为模型、终端、桌面、语音、Office 等无交集面）：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| 输入区统计扩展拆为 `activity` / `usage`（旧 `stats` 整行需改注册 ID） | 破坏（slot） | 中相关 | **零影响**——插件从未注册 `conversation.input.stats`；注册面只有 `conversation.chat.node` / `settings.plugin.item` / `plugins.bundle.config` |
| 新增扩展位：用户消息、文本与图片展示、新会话页、模型选择器 | 新增（slot） | 中相关 | 零破坏——相关 slot 在 alpha.4 已在位（`ui-chat` / `ui-conversation` / `ui-session` 零漂移）；rc.1 仅目录新增 `conversation.input.model.label`（模型选择器内部，occupants 为空） |
| 移除运行时 `invariant` 插件与各包 `./invariant` 导出 | 破坏 | 低相关 | 零交集——插件未使用 |
| 移除工具展示 `both` 混合模式（仅 `native` / `ptc`） | 破坏 | 低相关 | 零交集——插件不注册工具 |
| 子路径插件不再读取独立 `package.json`（文本/图标改子路径导出） | 破坏 | 中相关 | **零影响**——本插件是 bundle patch 形态、顶层 manifest 带 `name` / `icon`；`dsh-app-boot` / `dsh-host-plugin-inventory` 零漂移 |
| 第三方插件兼容性优先按 `engines.dsh` 判定 | 破坏 | 高相关（加载门禁） | **零影响**——`dsh-app-boot` 零漂移；插件未声明 `engines.dsh` → 走 peer 路径，六条 peer 覆盖 rc.1（`>=0.2.1-alpha.1 <0.3.0`） |
| Agent Team 消息改为直接投递目标 Inbox（移除 outbox / 自动重试 / 去重） | 破坏 | 低相关 | 零交集——插件不用 Agent Team |
| 默认 SDK profile 从固定编程 Agent 改为通用 AI Agent 身份 | 破坏 | 低相关 | 零交集——插件不依赖 profile 身份 |
| `--from-default-profile` 重建配置会替换该配置及其插件与设置 | 破坏 | 低相关 | 零交集——插件不调用该命令 |
| API Key 读取优先级变更（headless 不读已保存密钥） | 破坏 | 低相关 | 零交集——插件不读凭据 |
| Python PTC 接入 Session 文件沙箱策略（需 `sandbox` / `sandboxPolicy` 服务） | 破坏 | 低相关 | 零交集——插件只用 shell 执行接缝，`dsh-shell` / `dsh-sandbox-policy` 零漂移 |
| 自动化任务改为 Web 内置能力（提醒工具按模式提供） | 破坏 | 低相关 | 零交集——插件不注册自动化工具 |
| 关闭计划审阅时直接结束当前轮次 | 破坏 | 低相关 | 零交集——不涉及 plan 审阅 |
| Azure 提供方名称统一为 `azure` | 破坏 | 低相关 | 零交集——插件不读 provider 配置 |
| 统一子代理执行与完成通知（工具立即返回 child ID） | 破坏 | 低相关 | 零交集——插件不派生子代理 |
| 新增 TS / Python SDK `resume`（沿用原 session ID 与工作目录） | 新增 | 低相关 | 零交集——插件走 Web client 的 `sessions.fork` |
| 新增实验性 Session 状态记录接口（插件可读写自己的会话记录） | 新增 | 低相关 | 纯加法、可选——插件持久化仍走影子 git + index.json / lineage.json |
| 已发送消息中的密钥 / 令牌默认识别并脱敏 | 新增 | 中相关（消息渲染） | **零威胁**——`dsh-client-ui-secret-mask` 挂 `conversation.user.text.node` 在渲染层打码、不回写 session；该包两版零漂移，回填 draft 仍为原文 |
| 新会话支持预填未发送提示；草稿恢复 / 切换工作区保留文件与会话引用 | 新增 | 中相关（回填链） | 正向——`setDraft` / 草稿附件面零漂移，预填与引用保留惠及撤回回填 |
| 修复命令与参数交界处输入异常（整体选中 / 删除、撤销或刷新恢复） | 修复 | 中相关（回填链） | 正向——编辑器内部重构，`setDraft(DraftInput)` 签名与行为不变 |
| 修复重启后部分会话无法继续 / 切 DeepSeek 历史兼容失败 | 修复 | 中相关（fork 后跳转） | 正向——`dsh-session` / `dsh-session-query` 零漂移，修复提升 fork 子会话可靠性 |
| 修复原预设被删除或调整后恢复空白会话、切换工作区失败 | 修复 | 中相关 | 正向——与 fork 后切会话相关 |
| 修复卸载会话存储插件时最后一条会话记录可能丢失 | 修复 | 低相关 | 零交集——插件不卸载 `dsh-session-persistence` |
| 修复启停插件时其他插件样式被移除 / `/` 菜单技能列表不更新 / 元信息不可读阻断请求 | 修复 | 中相关（插件生态） | 正向——插件 CSS 手写注入、设置卡片依赖包元信息，三项修复均改善插件运行环境 |
| Fork / 子代理目录浏览新增迁移提示 | 优化 | 低相关 | 零交集——官方侧栏 fork UI 的引导提示，与插件 `sessions.fork` 调用路径无关 |

## 二、实证核验

### 2.1 包集合对比（alpha.4 ↔ rc.1）

**方法**：两版各在独立临时目录 `npm install --package-lock-only @deepseek-ai/dsh@<ver>` 生成完整依赖树 lockfile（617 条目 / 617 条目），按包名 + 版本集合精确对比。

- **`@deepseek-ai/*` 包集合完全相同：311 / 311**，无新增、无移除；
- **第三方依赖零变化**（cordis `4.0.5`、schemastery `3.18.5`、pi-ai `1.3.0` 与 alpha.4 一致）；
- 版本线：`@deepseek-ai/dsh*` lockstep `0.2.1-alpha.4 → 0.2.1-rc.1`。

与 rc.2 的对照：rc.2 比 rc.1 多 2 个包（`dsh-client-ui-deepseek-model-label-1017`、`dsh-web-deepseek-api`），rc.1 本身没有这两项。

### 2.2 36 个关键包 `lib/` 逐字节 diff

**方法**：两版均从 registry 下载 tarball 解压（本机实装已升级到 rc.2，故不用实装树），按「相对路径 + SHA256 清单」比对，只对漂移文件 `git diff --no-index`；只 diff `lib/`。

**有变更 3 个，均非功能**：

| 包 | 漂移 | 实质 |
|---|---|---|
| `dsh-client-modules` | 1 行 | `commit` 字面量 `cc6a8f5` → `ed75efe`（release 指纹） |
| `dsh-cordis-client-runner` | +38 行 | slot 教学目录新增 `conversation.input.model.label`（`occupants: []`、`replaceRisk: "none"`，纯文档数据） |
| `dsh-api-remotes` | +14/−22 | 仅账号 bonus 的 zod schema（新增 `title`、字段放宽为 `json`） |

**零变更 33 个**：`dsh-session`（`sessions.fork`）、`dsh-session-query`、`dsh-session-persistence`、`dsh-session-projection`、`dsh-settings`、`dsh-shell`、`dsh-host-webserver`、`dsh-workspace`、`dsh-api-gateway`、`dsh-api-session-controller`、`dsh-api-settings-controller`、`dsh-client-connection`、`dsh-client-locale`、`dsh-client-ui-chat`（slot 定义方）、`dsh-client-ui-conversation`、`dsh-client-ui-attachment`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-settings-plugins`、`dsh-client-ui-slots`、`dsh-client-ui-secret-mask`、`dsh-client-ui-commands`、`dsh-cordis-host-runner`（host 插件加载器）、`dsh-host-plugin-inventory`、`dsh-host-frontend-static`、`dsh-app-boot`（兼容门禁）、`dsh-plugin-manager`、`dsh-hmr`、`dsh-base`、`dsh-web-app`、`dsh-web-frontend`、`dsh-agent`、`dsh-attachment`。

### 2.3 rc.1 ↔ rc.2 同清单对比（门禁外推依据）

以本机 rc.2 实装树对比 rc.1 tarball（同一 36 包清单）：

- **32 个包逐字节相同**；
- 差异仅 2 个，且都是上述非功能项：`dsh-client-modules`（commit 指纹）、`dsh-cordis-client-runner`（`conversation.input.model.label` 的 `occupants` 由空变为 `client-ui-deepseek-model-label-1017 DeepSeekModelLabel`）；
- 另 2 个包（`dsh-client-ui-slots`、`dsh-web-frontend`）在本机 rc.2 安装树中未落盘（npm 树布局差异，lockfile 中存在），rc.1 / alpha.4 双侧 tarball 对比已确认零漂移。

结论：**rc.1 与 rc.2 在插件消费面上零功能差异**，因此 rc.2 实装门禁结果（`test:probe` 54/54、`verify:host` 装配断言全过、`check:upgrade` 三层全绿）可外推到 rc.1；rc.1 未单独实装不构成评估缺口。

### 2.4 关键证据链逐项

| 消费点 | rc.1 结论 | 出处 |
|---|---|---|
| 撤回按钮槽位（I1/I3/I4/I5） | `conversation.chat.node` 在目录中仍在；定义方 `ui-chat` 与渲染链 `ui-conversation` 零变更 | slot 目录 + lib diff |
| 新增 slot 冲突面 | 唯一新增 `conversation.input.model.label` 由 `conversation.input.model` 挂载、occupants 为空，与 `conversation.chat.node` 无 key / priority 竞争 | slot 目录 diff |
| fork / 队列（I6/I33/I35、G1） | `dsh-session`、`dsh-api-session-controller`、`dsh-session-query` 零变更；`updateQueue` 未动 | lib diff |
| 归档 / 导航（I7/I37） | `dsh-workspace` 零变更 | lib diff |
| 回填链（I34 + `refillDraft`） | `setDraft(DraftInput)` 与 `createDrafts` / `releaseDraftAttachments` / `addAttachments` 均未动 | lib diff |
| 用户消息内容 / 图片渲染（I2、issue #23） | `ui-chat` / `ui-conversation` / `ui-renderer` / `ui-attachment` 零变更；`renderFactorySlot` / `loadImage` 入口未动 | lib diff |
| 密钥脱敏与回填 | `ui-secret-mask` 零变更且只在渲染层打码；回填 draft 取 session 原文 | lib diff + slot 挂载 |
| 设置卡片与配置（I12/I39） | `dsh-settings`、`ui-settings-plugins` 零变更；两个设置类 slot 仍有效 | lib diff |
| shell 执行接缝（I36/I38） | `dsh-shell` 零变更 | lib diff |
| connection / API 路由（I32） | `dsh-client-connection`、`dsh-api-gateway`、`dsh-host-frontend-static` 零变更 | lib diff |
| 插件宿主 / client 加载（I13） | `dsh-cordis-host-runner`、`dsh-host-plugin-inventory` 零变更；`dsh-cordis-client-runner` 仅教学数据 | lib diff |
| 事件触发与 cutSeq | `dsh-session` 零变更即含事件类型表，事件集 62 种不变 | lib diff |

### 2.5 观察项（非阻塞）

1. **汇总性 release notes 是评估陷阱**：rc.1 的 notes 把 v0.2.0-rc.2 以来内容全部重述，若按「单版新增」理解会高估风险；实际多数条目在 alpha.1~alpha.5 已落地，插件在 alpha.4 已核验通过。
2. **rc.1 未单独实装**：本机升级路径是 alpha.4 → rc.2（用户指令），rc.1 未单独跑门禁；§2.3 的 32/36 逐字节相同 + 2 项非功能差异是外推依据。若后续需要 rc.1 的独立实证，可在该版本上重跑 `test:probe` / `verify:host`（预期与 rc.2 一致）。
3. **slot 目录是「rc.1 新增 vs rc.2 占位」的分界**：`conversation.input.model.label` 在 rc.1 已声明但 `occupants: []`，rc.2 由 `dsh-client-ui-deepseek-model-label-1017` 占据——这是两版在客户端可见装配上的唯一差异。
4. **rc.2 的两条新特性（模型适配、Search/Fetch API）在 rc.1 不存在**：rc.1 无 `dsh-web-deepseek-api`、无模型徽标包，对应功能面完全空白，与插件无交集。
5. **既有观察项延续**：远程非 owner 403、`fork.onCreated` 未用、旧面 `renderMessageImages` 分支保留至 ≤0.2.1-alpha.2 线退出窗口。

## 三、结论

* **影响程度：零破坏、零改码、无需发版。** rc.1 的 15 条破坏性 / 需迁移条目全部不作用于插件；36 个关键包仅 3 处非功能漂移，`sessions.fork`、slot 定义方、设置面、shell 接缝、兼容门禁全部逐字节零变更。
* **具体表现：** 插件 2.4.12 可直接运行在 dsh 0.2.1-rc.1 上；正向收益来自 rc.1 汇总的修复（命令芯片草稿恢复、会话恢复 / 切换失败、插件样式误删、插件元信息不可读阻断请求、`/` 菜单技能刷新）与新会话预填 / 草稿引用保留。
* **版本策略：无需追加 peer 段。** `0.2.1-rc.1` 与既有 `>=0.2.1-alpha.1 <0.3.0` 同 tuple；cordis / schemastery 未动；包集合与 alpha.4 完全相同（311/311）。
* **台账动作（已完成）：** `dshReleases` 已含 `0.2.1-rc.1`；rc.1 与 rc.2 的核验记录共用 [compat-audit.md](../compat-audit.md) 头部 0.2.1-rc.2 段（该段已声明覆盖 rc.1 汇总版 Breaking 逐条排除）。
