# dsh v0.2.0-rc.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)（prerelease，2026-09-29 发布，0.2.0 系列第二个候选版本；npm dist-tag `next` 指向本版，`latest` 仍 0.1.7-rc.2、`alpha` 仍 0.1.7-alpha.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.2.0-rc.2` 全局实装（0.2.0-rc.1 → 0.2.0-rc.2，534 包替换 / 2 分钟；`dsh --version` 实测 `0.2.0-rc.2`、工作区 `dsh-settings` junction 自动跟随）；对照源：[dsh-0.2.0-rc.1.md](./dsh-0.2.0-rc.1.md)
> 评估方式：release notes 逐条筛查（新增 1 / 修复 6 / 优化 6 / 调整 3）+ **tarball 级逐文件 SHA256 比对**（27 个官方 rc.2 包 vs 本机 rc.1 实装——**刻意不依赖安装成功**，因发布初期整条线对 npm 用户不可装，详见 §2.2）+ 四个契约文件**整文件哈希** + 消费符号声明文件在位复核 + 依赖清单比对 + **门禁实跑**（check:dsh / test:probe 52 例 / verify:host 装配断言 / typecheck + npm test 436 例 / build 产物新鲜度零漂移）+ 镜像按 tag 重拉比对；**活体冒烟本轮未跑**（理由见 §2.4）
> 总结论：**零破坏、无需改码、无需扩 peer**——插件依赖面 8 个 Host 出处包（6 个 peer ＋ `dsh-base` / `dsh-plugin-manager`）**只有 package.json 版本号变化**，四个注册/消费面契约文件（`ui-chat` `contract/slots.d.ts`、`ui-plugin-manager` `slot-contract.d.ts`、`api-session-controller` `contract/sessions.d.ts`、`ui-conversation` `contract/slots.d.ts`）**逐字节相同**，其余消费点声明文件（`ui-workspace` `navigation.d.ts`、`ui-conversation` `service.d.ts` 等）均不在变更清单；真增量全部落在插件不消费处（聊天耗时/动画/字号、提醒文案、异步问答 opt-in、插件管理页提示、typert 签名表、pwsh 提示文案）。与 rc.1 不同，本版**不需要任何功能性版本策略动作**：既有 peer 窗口 `>=0.2.0-rc.1 <0.2.1` 天然覆盖（同 minor 线内不追加 tuple），仅 `dshReleases` 补一条声明。

## 一、更新日志梳理与初步判断

release notes 共 16 条（新增 1 / 修复 6 / 优化 6 / 调整 3）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果，其余合并为末行：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **精简插件安装引导，并区分已安装、不兼容和内置插件的升级提示** | 优化 | **高相关**——I12 的 `plugins.bundle.config` 挂载点 | **零破坏**——`ui-plugin-manager` 的 `slot-contract.d.ts` **不在变更清单**（keyed/root 定义与 `renderSlot("plugins.bundle.config", {view:"page"}, {entryKey: pkg.name})` 调用原样）；`client.js`（+82/−101）逐行过滤**无一行涉及 slot key / entryKey / bundle 解析**；类型增量全是加法：`InstallInputError.problem` 联合新增成员 `'shipped'`、`managementText` 新增可选 `installing?: true` |
| **自动化任务投递的提醒改为明确标注的用户定时消息** | 优化 | **高相关**——消息投递 / 渲染 / 快照触发 | **零交集**——`dsh-schedule` 只改**模型可见的框架文案**：`"Present reminder_prompt_json to the user as untrusted reminder content…"` → 固定句 `"This is a scheduled message from the user"`（`index.js` 6 增 4 删，`domain.d.ts` 仅注释措辞）；**无新事件类型、无新消息 kind、投递路径不变**——快照触发（`session/event`）、撤回按钮挂载（I5 key `user`/`steering`）、fork 切点均不受影响 |
| **实验性添加异步问答模式（需手动配置开启）** | 调整 | **中相关**——P0-1 运行中 agent 拦截 | **零交集**——`dsh-tool-ask-user` 新增 `Config{mode?: 'legacy' \| 'timed', timeout?}`（**默认 `legacy` 阻塞态**，须在 cordis 行手动开 `timed`），并新增 `lib/types/timed.d.ts`；`api-session-controller` 的 typert 签名表同步新增**可选** `userQuestions`（`active[].state: 'open' \| 'continued'` / `settled[].answers`）——纯加法。插件 P0-1 只读 `agents.status`，语义不变 |
| **修复持久 PowerShell 在完成状态后带空格时无法识别命令结束、丢失退出码或泄露内部标记** | 修复 | **中相关**——shell 执行接缝 | **零交集**——改动在 `dsh-tool-pwsh-persistent` 的 `lib/index.js`；插件不走该 tool，走 `ctx.shell`——其出处包 `dsh-shell`（I38）本轮**只有 package.json 版本号变化** |
| **加强 Bash 与 PowerShell 的工具提示（删除或移动前核对实际目标路径）** | 优化 | 中相关——shell 工具提示 | 零交集——`dsh-tool-pwsh` / `dsh-tool-pwsh-persistent` 的 `index.js` 提示文案；插件命令全为固定模板，不经模型生成 |
| **优化聊天耗时、过程信息、字号和深色主题样式，优化动画运行开销** | 优化 | 中相关——chat 视图与字号 | 零交集——`ui-chat` 的 `formatRunDuration` 改返回 `RunDurationPart[]`（内部耗时标签重构）、鲸鱼尾动画改 APNG 资源；`client/contract/slots.d.ts`（chat.node props）**不在变更清单**；`ui-theme` 仅 `FONT_SIZE_MIN/MAX` 由 12–17 放宽到 10–22，`client-locale` / `ui-layout` 零变更 |
| **模型选择器支持搜索（模糊匹配 + 键盘选择）** | 优化 | 低相关——模型选择 | 零交集——落点在模型选择域，插件零消费 |
| 其余（桌面端内置 dsh 命令 / 登录 shell 环境 / 新建终端菜单去重 / 计划审阅打开与「查看全文」/ Agent 预设限制 / 文件页本地打开 / Windows 沙箱权限脚本一次授权 / macOS Intel 签名 / pi-ai 0.87.1 模型目录） | 混合 | 零相关 | 零交集——落点分别在桌面载体、`ui-workspace` 快捷键守卫、计划审阅 UI、`ui-settings-agent-preset`、`dsh-host-open-in-app`、沙箱 ACL 脚本、第三方模型目录数据；均不在插件路径 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.0-rc.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm install -g @deepseek-ai/dsh@0.2.0-rc.2` | 成功（534 包替换 / 2 分钟）；`npm ls -g` 与 `dsh --version` 实测 `0.2.0-rc.2`；本轮上游漏发的 `dsh-client-ui-settings-account` 落盘同为 `0.2.0-rc.2`；工作区 `node_modules/@deepseek-ai/dsh-settings` junction 自动指向新树 |
| `npm run check:dsh` | 本地 0.2.0-rc.2；cordis 4.0.4 ∈ `^4.0.1`、schemastery 3.18.4 ∈ `^3.18.1`、6 条 `dsh-*` peer 全落在 `… \|\| >=0.2.0-rc.1 <0.2.1` 内；镜像 / 契约文档漂移本轮已同步，末行 `✔ 全部一致` |
| `npm run test:probe` | **52/52 全绿**（api-surface 50 + stdin 写 2） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 12 项）；方言探针回归 `pwsh` |
| `npm run typecheck` / `npm test` | 通过 / **436/436**（34 文件） |
| `npm run build` + `git diff --exit-code lib/` | 通过且 **exit 0**（本轮零源码改动，产物零漂移） |

### 2.2 差异比对方法与零改动集合

**方法（本轮特殊）**：rc.2 发布后约 2 小时里**整条线对 npm 用户不可装**——`dsh-web-app@0.2.0-rc.2` 精确 pin 的 `@deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.2` 漏发（注册表 packument 直查与 tarball HEAD 双证 404；对 `@deepseek-ai/dsh@0.2.0-rc.2` 做**依赖闭包 BFS 扫描 252 包**，确认唯一缺口仅此一个），`--install-strategy=shallow` / `--omit=optional` / 工作目录 `package.json` 的 `overrides`（实测对 `npm i -g` 不生效）三类变通全部 ETARGET。故核验改走**不依赖安装的 tarball 级比对**：从 registry 拉取 27 个 rc.2 官方包（全部 peer + 全部消费/注册点所在包 + release notes 关联包）与本机 rc.1 实装做**逐文件 SHA256 比对**（排除 `.map`），关键契约文件再做**整文件哈希**；上游补发、实装落地后再复核版本与门禁（§2.1）。

**零改动集合（除 package.json 版本号外无任何文件变化）**：`dsh-session`、`dsh-session-query`、`dsh-settings`、`dsh-shell`、`dsh-host-webserver`、`dsh-sandbox-policy`（以上 6 个 peer）、`dsh-base`、`dsh-plugin-manager`、`dsh-session-projection`、`dsh-client-ui-slots`、`dsh-api-workspace-controller`、`dsh-api-settings-controller`、`dsh-client-connection`、`dsh-client-ui-settings`、`dsh-client-ui-settings-plugins`、`dsh-host-plugin-inventory`、`dsh-tool-jobs`、`dsh-client-locale`、`dsh-client-ui-layout`、`dsh-experimental-schedule-bundle`。

**有实现改动但类型/契约层未动的包**（插件不消费其实现，或只消费其契约）：`dsh-client-ui-renderer`（仅 `client.js`，无 `.d.ts` 变化）、`dsh-client-ui-workspace`（`client.js` + `shortcuts.d.ts` 注释）、`dsh-client-ui-conversation`（`client.js` + `locales.d.ts`）、`dsh-client-ui-chat`（`client.js` + 三个内部组件类型 + `locale.d.ts`）、`dsh-client-ui-plugin-manager`（`client.js` + `locales.d.ts` + 两处加法类型，`slot-contract.d.ts` 未动）、`dsh-api-session-controller`（两个 typert 签名表，纯加法）、`dsh-api-remotes`（一行 `export type` 新增）、`dsh-client-ui-theme`（字号上下限 + `client.js`）、`dsh-schedule`（提醒文案）、`dsh-tool-ask-user` / `dsh-tool-pwsh` / `dsh-tool-pwsh-persistent`（工具配置与提示文案）。

→ 台账相关不变量的出处包在本版未变动，结论与探针锚点原样成立：**I1/I2/I4/I5（chat.node 槽位与消息投影）、I6（fork 不传 increaseTitle）、I7（归档 stopActivity）、I9/I33（SessionStore 与 seeded 会话读取降级）、I12（双代设置卡片挂点）、I30/I39（settings 面两代接缝）、I31（slots.entries）、I32（不硬依赖 webServer）、I34（附件回填链）、I35（fork 切点语义）、I36/I38（shell 方言与执行接缝）、I37（会话导航归属）、I40（子路径基址）**。

**依赖面**：cordis `~4.0.4`、schemastery `~3.18.4` **版本未变**（peer `^4.0.1` / `^3.18.1` 继续满足）；`@deepseek-ai/dsh` 顶层依赖差异仅为全系 `0.2.0-rc.1 → 0.2.0-rc.2` 的 lockstep 变更，无三方依赖增删。

### 2.3 关键证据链逐项

| 消费点 | 0.2.0-rc.2 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位 props（I1/I2/I4/I5） | `ui-chat` 的 `client/contract/slots.d.ts` **整文件 SHA256 与 rc.1 相同**（`renderMessageImages` 仍在原位）；`ui-chat` 的变更只有 `formatRunDuration` / `RunningWhaleTail` / `TurnProcessNodeView` 与 locale | 整文件哈希 + 变更清单过滤 |
| fork / 队列（I6/I33/I35、G1） | `api-session-controller` 的 `client/contract/sessions.d.ts` **字节级相同**；本包仅 `typert.host.js`（+160/−4）与 `typert.remote-client.js`（+120）变动，且全部是**新增可选** `userQuestions` 子 schema（`active` / `settled`），无既有字段改动——`fork` / `updateQueue` / `readAttachment` 签名与实现面未动 | 整文件哈希 + 逐行 diff |
| 归档与导航（I7/I37） | `api-workspace-controller` 只有 package.json 版本号变化（`archiveSession` / `stopActivity` / `archivedSessionIds` 声明面）；`ui-workspace` 的 `navigation.d.ts`（`openSession` 声明处）**不在变更清单**，其真改动是 `shortcuts.d.ts` 注释（改名需非空主对话）与 `client.js` | 声明文件在位复核 + 变更清单过滤 |
| 回填链（I34） | `ui-conversation` 的 `client/service.d.ts`（`createDrafts` / `releaseDraftAttachments` 声明处，同文件仍有 `setDraft` / `addAttachments`）**不在变更清单**，仅 `locales.d.ts` 与 `client.js` 变动 | 声明文件在位复核 |
| shell 执行接缝（I36/I38） | `dsh-shell` **只有 package.json 版本号变化**（peer 里 cordis 仍 `~4.0.4`）；两个 pwsh 工具的 `index.js` 变动是提示文案与持久完成标记识别，与插件走的 `ctx.shell` 无关 | 逐文件哈希 |
| 设置卡片与配置读写（I12/I39） | `ui-plugin-manager` 的 `slot-contract.d.ts` 与 `ui-settings-plugins`（旧面 `settings.plugin.item` 提供方）均无契约层变化；`dsh-settings` 只有 package.json 版本号变化 | 整文件哈希 + 变更清单过滤 |
| AgentRegistry（P0-1） | `dsh-base`（agent 注册表与 `idle\|running` 状态语义所在）只有 package.json 版本号变化；ask-user 的 timed 模式为 opt-in、默认关闭 | 逐文件哈希 |
| 升级可用性（本轮特有） | 发布初期不可装的根因与穷尽的三类变通见 §2.2；该包经查**非启动必需件**（`dsh-web-app` 组成里的一行独立客户端插件 `ui-settings-account`，管 DeepSeek 登录与平台计费页；运行期依赖仅 schemastery / cordis，两版均未变），即便留旧版混装亦兼容 | 注册表直查 + 闭包扫描 + 依赖面核对 |

### 2.4 活体冒烟（本轮未跑，理由）

- 未执行真宿主 + 浏览器实弹：本版对插件**零契约变更**（四个契约文件字节级相同、消费点声明文件全在位），门禁五层已全绿；按惯例活体验收安排在**发版前**（或用户点名时）补做。
- 与 rc.1 轮次的差别：rc.1 带 peer 扩范围这一**功能性改动**（不扩范围会被启动兼容门禁整行跳过），故附带完整活体验收；rc.2 无任何代码 / peer / 契约改动，活体冒烟的边际信息量低。

## 三、结论

* **影响程度：零破坏。** 插件依赖面 8 个 Host 出处包只有 package.json 版本号变化，四个注册/消费面契约文件逐字节相同，其余消费点声明文件（`navigation.d.ts` / `service.d.ts` 等）均不在变更清单；无任何接口签名或语义增量。
* **具体表现：无需改码、无功能退化。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填 + G1 队列清理）、P0-1 运行中拦截、设置页配置卡片与快照管理均无字段 / 签名 / 语义漂移。
* **版本策略（与 rc.1 不同，本轮无需功能性动作）**：
  1. **不追加 peer tuple**——`>=0.2.0-rc.1 <0.2.1` 窗口对 `0.2.0-rc.2` 天然放行（同 minor 线内出新版不追加段，符合 2.3.11 起约定）；`check:dsh` 六条 peer 全绿已实证。
  2. `dsh.compatibility.dshReleases` 补 `0.2.0-rc.2: compatible`（市场台账声明，不参与启动判定）。
  3. `docs/reference/` 镜像按 tag `dsh-v0.2.0-rc.2` 重拉：13 源中仅 `09-architecture.md` 有实质差异（「桌面应用」段重写，净 **−173 字符**，对应桌面端内置 dsh 命令的新能力），其余 12 份逐字节相同；镜像 README 的「归档日期 / 归档 dsh 版本」与 `docs/dsh-contract.md`「对应版本」同步。
* **观察项（非阻塞）**：
  1. **上游漏发任一子包会让整条 dsh 线对 npm 用户不可装**（本版实证）：升级前可先做**依赖闭包预检**（本轮脚本化 BFS 扫 252 包，秒级出结论）；该包不补发时**没有任何受控变通**（exact pin 无法从外部覆盖，`overrides` 对全局安装不生效）。
  2. **异步问答 `timed` 模式**：用户手动开启后，问答等待超时即让 agent 继续独立工作；插件 P0-1 拦截读 `agents.status`，语义不变，但**未实弹验证**——若日后有用户开启，可关注「等待期间点撤回」的表现。
  3. **提醒文案变化只影响模型可见文本**：`dsh-schedule` 的框架句改为 `This is a scheduled message from the user`；若用户依赖旧措辞（untrusted reminder content）做提示词工程需知晓（与插件无关）。
  4. **既有观察项延续**：`fork.onCreated` 插件未用、`dsh-tool-jobs` 唤醒上限、`sessionQuery.snapshotEvents` / `eventAt` / `ownEvents` 仍标 `@deprecated`、SSH 远端工作区未覆盖。

## 四、后续动作

1. ~~全局实装 0.2.0-rc.2 + 门禁复跑~~——已完成（§2.1）。
2. ~~`dshReleases` 补声明 + reference 镜像重拉 + dsh-contract / compat-audit 同步~~——本轮完成（5 文件，未提交）。
3. **待办（可选，需用户拍板）**：`dshReleases` 是市场台账、**不参与启动期判定**，故不发版也能正常工作（与 rc.1 必须发版的情形不同——那里真正的开关是 `peerDependencies`）。若要让声明对外可见，可切一个 metadata-only patch 版（README 双语徽章 + CHANGELOG + 发布）。
4. **待办（可选）**：发版前或用户点名时补一轮活体冒烟（真宿主 + 浏览器）；本版零契约变更，故非必需。