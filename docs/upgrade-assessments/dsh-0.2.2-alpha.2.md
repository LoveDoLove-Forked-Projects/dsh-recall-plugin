# dsh v0.2.2-alpha.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)（prerelease，2026-10-28 发布）
> 本地基线：升级前全局实装 `@deepseek-ai/dsh@0.2.1-rc.3`；本轮跨 `rc.4`（仅发 npm、未落 dist-tag，本机未装）/ `0.2.2-alpha.1` / `alpha.2` 三个版本。对照源：[dsh-0.2.1-rc.3.md](./dsh-0.2.1-rc.3.md)
> 评估方式：release notes 筛查 + **两棵实装树逐文件 SHA256**（旧实装目录改名作基线、新装对比，305 → 329 包）+ 消费点 `lib/`、`.d.ts` 逐行 diff + 门禁实跑 + web 宿主冒烟
> 总结论：**一处真实破坏（图片附件回填，已修）+ 四条契约演进（不破坏）**。主链（影子快照、fork 切点、归档/打开、槽位、设置与 volatile 热更、宿主 `/api/recall/*`、队列清理）零破坏；`readAttachment` 入参换代让撤回回填与编辑重发的图片静默消失，改用「完整引用 → 裸 id」探测回退后新旧版本皆通。

## 一、更新日志梳理与初步判断

release notes 的「插件系统」条目较多（异步会话投影句柄、`tools.resolve` / `executable`、PTC birpc 与 SSH 协议 2→3、`agent/request` 不得改路由、Node ≥ 24.9），但按插件实际消费面筛，只有四条需要深挖：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **Session API 拆出独立接口；普通会话分支独立运行，不再被误识别为子智能体** | Breaking（notes） | **高相关**——`sessions.fork` 是撤回主链 | **语义更正、零破坏**——`fork({sessionId, atSeq, allowMigration})` 签名与 `{sessionId}` 返回不变；唯一变化是子会话 header 不再写 `parentSession`，普通分支改由 `origin` 判定。插件只读 `header.origin === 'subagent'` 跳过快照、血缘自存 `lineage.json`，故不受影响且分类更准（§2.3） |
| **Cordis Fiber 统一原始/候选/生效配置；Timer 同步上游** | Breaking（notes） | **中相关**——设置面 volatile 热更依赖 loader 派发 | **链路未变**——loader 只把 ref 来源 `volatileEntries(fiber.config)` 改成 `fiber.effectiveConfig`、候选解析收口为 `fiber.resolveConfig`；`updateVolatile(ref, source)` + `loader/volatile-update` 派发 + `Context.filter` 逐字未变。插件不调 `ctx.setTimeout`，Timer 返回值变化不适用（§2.3） |
| **输入框重做：宿主确认接收后才显示并清空草稿、发送期间只读；图片进入即上传** | 变更（notes） | **高相关**——回填链与编辑重发都写输入态 | **正向为主**——提交状态机新增 `sending` 相位、`commit-draft` 改在宿主 accept 后、失败保留草稿/引用/附件；`createDrafts` 增第三参 `uploadImages`（旧版忽略）。插件 `submit()` 仍无参、`snapshot.draft` 仍可读（§2.3、§2.4） |
| **附件读取接口调整（notes 未单列，diff 发现）** | 隐性 Breaking | **高相关**——`readAttachment` 是附件回填唯一通道 | **真实破坏**——入参由 `attachmentId` 字符串换成完整 `ImageAttachmentRef`，宿主不再回会话日志反查授权，裸 id 直接 `INVALID_ATTACHMENT_REF`；插件逐项 `try/catch` 吞错 → 图片静默丢失（§2.4） |

其余条目（工具按步骤条件启用、PTC、SSH、Web Fetch 内网、存储兼容、模型路由固定）与插件零交集，未展开。

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.2-alpha.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test`（unit） | **529/529** |
| `npm run test:client` | **129/129**（新增 `tests/client/draft-fill.test.ts` 8 条；`attachmentRefsFromBlocks` 形状并入既有 unit 用例） |
| `npm run test:probe` | **58/58**（loader 探针按 `fiber.effectiveConfig` 同步；新增「附件回读链（B1）」1 条） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项） |
| `npm run check:dsh` | 六条 `@deepseek-ai/dsh-*` peer 全满足（新增 `>=0.2.2-alpha.1 <0.3.0` 段）、cordis `4.0.6-alpha.1` 与 schemastery `3.18.6-alpha.1` 各自新段、镜像与契约文档版本字段同步后全绿 |
| 宿主冒烟 | `node <dsh>/lib/bin.js --profile web --no-open --port 3099`：页面 200、日志无 compat/denied、`POST /api/recall/init` 返回 200 `{"ok":true,...}` |

> `check:dsh` 用 npm 语义（不自带 `includePrerelease`），`0.2.2-alpha.2` 不落在 `>=0.2.1-alpha.1 <0.3.0` 段——**运行时门禁（`dsh-app-boot` 用 `includePrerelease: true`）并不拦**，冒烟实证插件照常加载；两处结论必须分开读。

### 2.2 包集合与漂移面

**305 → 329 包**：新增 24（`dsh-client-ui-action-cards`、`dsh-client-ui-message-quotes`、`dsh-client-ui-file-drag`、`dsh-official-bundles`、`dsh-tool-executor-native` / `-ptc`、一批 `experimental-*` 等），移除 `dsh-client-ui-deepseek-model-label-1017`。第三方依赖：cordis `4.0.5 → 4.0.6-alpha.1`、schemastery `3.18.4 → 3.18.6-alpha.1`、pi-ai `1.3.0`。

**逐字节零漂移的消费面**：`dsh-shell`、`dsh-session-query`、`dsh-client-ui-slots`（槽框架本体）、`dsh-workspace`（仅 locale）、`dsh-client-connection`（仅 d.ts 注释）；`dsh-session` 事件集 62 种不变，`turn/end` / `user/message` 链条未动。

### 2.3 关键包逐行 diff（插件消费点）

- **`dsh-session`**（+49/−31）：`announce` 改状态机（`pending → dispatching → complete/failed`）、`liveEntryFor` 容忍未进入实例、`fork` 不再写 `parentSession`。插件读的 `sessions.list/get`、`session.header.cwd`、`session.events` 未变。
- **`cordis-plugin-loader`**（+77/−9）：`fiber.config` → `fiber.effectiveConfig`、`fiber.resolveConfig(raw)`，另加 ESM `resolve.mjs` 辅助。volatile 提交与派发逐字未变。
- **`dsh-api-session-controller`**：`readAttachment(attachment)`（见 2.4）；`createDrafts(sessionId, files, uploadImages)`；`sendSession(..., accept?)`；新增 history/state/web 控制器与 Submission 接受语义。`fork` / `updateQueue` / `archiveSession` 客户端面未变。
- **`dsh-client-ui-conversation`**（+154 KB）：提交状态机加 `sending`、宿主 accept 后 `commit-draft`、草稿快照带 `quotes`、`setDraft` 清整段（引用/引用块一并移除）、新增 `conversation.chat.text-interaction` 档与 `actions.insertQuote`。`InputActions` 三件套与 `shell.snapshot` 形状不变。
- **`dsh-client-ui-chat`**：新增 `conversation.chat.text-interaction`、`conversation.chat.user.before` 两个纯加法槽；`conversation.chat.node` / `assistant-actions` 定义与 props 未变；inbox 行 `claimedHuman` → `firstClaimedHuman`（插件不读）。
- **`dsh-settings`**：仅 `plainConfig(entry.fiber.config)` → `fiber.effectiveConfig` 一行。
- **`dsh-host-webserver`**：新增「resource」路由（Fetch `Request` → `Response`）与静态资源 304；connection exact 路由注册面未变。

### 2.4 破坏点复盘（B1：附件回填）

```ts
// ≤0.2.1（旧）：id + 宿主回会话日志反查完整引用并做引用授权
async readAttachment(attachmentId) { remote.session.attachment({ sessionId, attachmentId }) }
async attachment(req) { const ref = referencedImage(source.events, String(req.attachmentId)); … readImage(ref) }
// ≥0.2.2-alpha.1（新）：完整引用，宿主只按 mediaType/bytes/width/height 自证
async readAttachment(attachment) { remote.session.attachment({ sessionId, attachment }) }
async attachment(req) { this.ctx.attachments.readImage(req.attachment) }
```

`dsh-attachment-local.readImageFile` 的 `ensureReference(ref)` 读 `ref.attachmentId`——传字符串时 `String(undefined)` 不匹配 `sha256:<64hex>`，抛 `INVALID_ATTACHMENT_REF`；即使绕过首检，后续 `mediaType`/`bytes`/尺寸比对也会判 `ATTACHMENT_CORRUPT`。插件原实现在 `draft-fill.ts` 传裸 id，两处调用（撤回回填、编辑重发）都受影响，且失败被逐项 `try/catch` 与 `result.ok` 检查吞掉，无任何报错。

**修复**（保持旧版兼容）：

1. `DraftAttachmentRef` 增加 `attachment?: unknown`，由 `attachmentRefsFromBlocks` 原样带上消息块里的 durable 引用；
2. `readAttachment` 按「完整引用 → 裸 id」探测，失败换另一代口径，命中代缓存在 `buildDraftFill` 闭包（同一次撤回多张图不重复撞错）；两代返回形状一致（`{ attachment, data }`），调用方无感；
3. `createDrafts(sessionId, files, uploadImages)`：旧版忽略第三参；新版按场景分流——撤回回填（只填不发）传 `true` 保留「进入即上传」，编辑重发（自动发送）传 `false` 让字节随 prompt 内联（原因见 §2.5）；三参形态若抛错（上传服务缺席等）自动退回两参，不让整批附件丢失；
4. 探针新增「附件回读链（B1）」钉住单参形状与返回值；loader 探针按 `fiber.effectiveConfig` 改名同步。

验证：单测覆盖「只认对象」「只认字符串」「命中代缓存」「双失败降级」「仅裸 id 的旧调用方形状」与 `createDrafts` 两种第三参；`attachmentRefsFromBlocks` 用例钉住原始引用不被丢弃。

### 2.5 活体浏览器回归（2026-10-28，真机 Chromium）

环境：`node <dsh>/lib/bin.js --profile web --no-open --port 3099` + `agent-browser`（真实 Chromium），工作区 `D:\tmp\recall-h0`，测试图为 240×80 的自制 PNG（放 `%TEMP%`，不污染工作区）。

| 步骤 | 结果 |
|---|---|
| 新会话 → 发首条文本 → 停止回合 | 通过（建立 `turn/end`，使第二条消息有 cutSeq） |
| 发带图消息（隐藏 `input[type=file]` 上传 + 文本） | 通过，`snapshot-info` 直查 `{has:true}` |
| 点「撤回」→ 面板 | 首条消息时面板提示「无法回退对话，仅回退文件」；第二条起出现 both / session-only 二选一 |
| 确认回退 → fork → 打开子会话 | 通过；子会话输入框得到原文本 + 图片缩略图（`alt=recall-regress.png`，`naturalWidth=240` 真实解码，证明 `readAttachment(fullRef)` 取回了字节） |
| 手动回车重发 | 通过：输入框清空、对话里出现 240×80 图片、agent 正常起回合 |
| 编辑并重发（带图） | **首次失败**：编辑卡关闭、草稿写了文本 + 图片，但消息不发（`running=false`，控制台无错）；同场景**纯文本编辑重发一次成功** → 锁定为「图片 + 自动发送」组合 |
| 修复后重跑（图片编辑重发） | 通过：输入框清空、新文本与 240×80 图片进入对话、agent 起回合 |
| 修复后重跑（撤回回填） | 通过：文本 + 图片缩略图回填到输入框 |

**根因**：`createDrafts` 第三参 `uploadImages=true` 会为图片启动后台上传，而官方 `sendSession` 发送前会 **等该上传结算**；刚 fork 的子会话上这次上传未结算，于是 prompt 永远发不出去、草稿原样留在输入框（无报错）。纯文本没有上传环节，故不受影响。

**修复**：按场景分流 `uploadImages`——撤回回填（只填不发）`true`；编辑重发（自动发送）`false`，图片字节随 prompt 内联。这是自动化测试覆盖不到的一类问题（jsdom 里没有真实上传链路），已记入 §2.4 第 3 条与 CHANGELOG。

## 三、影响面结论

| 模块 | 影响 |
|---|---|
| 影子快照 / gc / 护栏 / 串行队列 / 宿主端点 | 无（依赖包逐字节相同；`/api/recall/init` 冒烟 200） |
| 撤回 execute（preview → 安全快照 → reset → fork → 归档 → 打开） | 无（fork 签名与 `cutSeq` 语义不变；子会话不再带 `parentSession` 属更正） |
| 撤回回填文本 | 无（`setDraft` 语义不变，且会清掉旧引用芯片） |
| **撤回回填 / 编辑重发：图片附件** | **修复前：静默丢失；修复后：两代皆通** |
| 编辑卡（文本 / 权限 / 模型 / 附件 chip / 缩略图） | 轻微（缩略图走官方 `loadImage`，不受影响；`createDrafts` 补第三参） |
| 版本翻页器 / 快照管理 / 设置卡片 / 队列清理 | 无 |

**方向与程度**：中性偏负，一处功能级回归（非阻断），修复成本 1 个文件 + 7 条测试；正向面是 fork 分支不再被误判为子代理、发送失败保留草稿附件。

## 四、台账同步

- `package.json`：六条 `@deepseek-ai/dsh-*` peer 追加 `>=0.2.2-alpha.1 <0.3.0`；cordis 追加 `>=4.0.6-alpha.1 <4.0.7`；schemastery 追加 `>=3.18.6-alpha.1 <3.18.7`；`dsh.compatibility.dshReleases` 补 `0.2.2-alpha.2`。
- `docs/reference/`：十一次重拉（`dsh-v0.2.2-alpha.2`），13 源中 3 份有实质差异（08 事件示例删 `agent/request`、09 组装/投影/fork 配方、13 钩子清单），均不落插件消费面。
- `docs/dsh-contract.md`：对应版本 → 0.2.2-alpha.2；新增 §1.2「输入区写入链与附件回读（I34 / B1）」；沿革补 ⑫。
- `docs/compat-audit.md`：新增 0.2.2-alpha.2 核验段。
- `README.md` / `README.en.md`：DSH 徽章与支持范围 → `0.2.2-alpha.2`，peer 开窗块补 0.2.2 段并说明新增理由。
- `CHANGELOG.md`：`[Unreleased]` 记录本次修复与台账同步。
