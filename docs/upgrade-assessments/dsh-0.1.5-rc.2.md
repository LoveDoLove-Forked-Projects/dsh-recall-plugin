# dsh v0.1.5-rc.2 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.1.5-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)（commit `fb2c4b9`，2026-09-10 发布；npm dist-tag `next` 指向本版、`latest` 仍为 rc.1；本机 `npm install -g @deepseek-ai/dsh@0.1.5-rc.2` 全局实装，DSH Desktop 0.1.5-rc.2 与桌面端 profile 亦为本版）
> 本地基线：dsh 0.1.5-rc.2（本次全局实装）；对照源：[dsh-0.1.5-rc.1.md](./dsh-0.1.5-rc.1.md)
> 评估方式：release notes 筛查（仅两项 UI 体验优化）+ **tag 对比筛选**（rc.1→rc.2 共 4 commits / 300 文件，绝大多数是 monorepo 全包 package.json 版本 bump；插件消费面包唯一源码命中为 ui-chat 的 `TurnTailNodeView.module.css` +3 行，零类型源改动）+ **三层门禁实跑**（test:probe 31/31 + verify:host 装配断言全过 + npm test 307/307）+ **官方文档镜像按 rc.2 tag 重拉比对**（13 源：12 内容相同、11 号仅 CRLF 噪声）
> 总结论：**接口层面零破坏、行为层面无回归——无需任何代码修改。** 本版是 rc.1 之后的体验打磨（反馈提交改弹窗确认、交付文件卡片排版/图标刷新），与撤回链路零交集。

## 一、更新日志梳理与初步判断

release notes 相比 rc.1 仅两项（`Full Changelog: v0.1.5-rc.1...v0.1.5-rc.2`）：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **反馈提交体验**：点赞/点踩改为弹窗确认后提交，失败保留已填内容 | 优化 | 无关 | 无关——插件不注册反馈入口、不消费反馈事件（`feedback/message-put` 在 0.1.5-alpha.1 已归入备忘面） |
| **交付文件卡片排版/图标刷新**、对话间距紧凑化 | 优化 | 低疑点——触及 chat 域渲染（撤回按钮所在的 conversation 树） | **无影响**——改动落在 ui-chat `TurnTailNodeView.module.css`（+3 行轮次尾部间距）与 ui-deliverables 卡片样式/图标；插件注册的 `conversation.chat.node` 槽位声明（`slots.d.ts`）与节点 props 形状零改动 |

## 二、实证核验

### 2.1 消费面改动筛选（rc.1 → rc.2）

`gh api .../compare/dsh-v0.1.5-rc.1...dsh-v0.1.5-rc.2`：4 commits、300 文件。按插件消费面包（12 包）路径 + 类型源/源码过滤后**唯一命中**：

| 文件 | 命中判定 |
|---|---|
| `packages/client/ui-chat/src/client/chat/TurnTailNodeView.module.css`（+3 -0） | 纯 CSS 间距，类型面无关 |

其余文件为 `.agents/notes/` 实施记录、官方文档、e2e 测试、图标资源与 monorepo 全包 `package.json` 版本 bump。`dsh-session` / `dsh-api-session-controller`（`sessions.d.ts`）/ `dsh-client-ui-settings-plugins`（`slot-contract.d.ts`）/ `dsh-client-ui-conversation` / `dsh-client-ui-chat`（`slots.d.ts`）/ `dsh-settings` / `dsh-shell` / `dsh-session-query` / `dsh-host-webserver` / `dsh-sandbox-policy` 的类型源与实现零改动。

### 2.2 官方文档镜像重拉比对（rc.2 tag）

按 `docs/reference/README.md` 更新方式表从 `dsh-v0.1.5-rc.2` 重拉 13 源逐文件比对：12 源内容相同；`11-cookbook-conversation-node.md` 仅 CRLF/LF 噪声（逐行完全相同，`git diff --ignore-cr-at-eol` 为空）。未覆盖任何镜像文件，仅同步 README 头部「归档日期 / 归档 dsh 版本」字段。

### 2.3 三层门禁实跑（本机 rc.2 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm run test:probe` | 31/31 通过（api-surface 29 + stdin-write 2） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,webServer,agents，端点 12 项，agents 桩访问 1 次） |
| `npm test` | 307/307 通过（25 文件） |
| `npm run check:dsh` | 8 个 peer 全部在范围内（cordis 4.0.2 / schemastery 3.18.2 / dsh-* 0.1.5-rc.2）；镜像与契约字段随本次同步至 rc.2 |

## 三、版本策略与结论

- **影响程度：无破坏性影响**——rc.2 相对 rc.1 是体验打磨版，插件消费面类型源零 diff；
- **版本策略**：peer 范围沿用按 minor 线开窗（`>=0.1.5-alpha.1 <0.1.6`），npm semver 的 prerelease 门槛天然放行同 tuple 的 rc.2，无需改 peer 串；`dsh.compatibility.dshReleases` 补 `0.1.5-rc.2: compatible`；
- **安装兼容顺带修复**：同版发布（2.3.12）修复 DSH Desktop 安装校验对历史包 peer 的解析失败（根因与三处修改见 CHANGELOG 2.3.12）。

## 四、后续动作

1. ~~全局实装 + 三层门禁复跑~~——已完成（见 §2.3）。
2. ~~镜像 / 契约 / 台账同步~~——已完成：`reference/README.md` 归档字段、`dsh-contract.md`「对应版本」、`compat-audit.md` 核验段。
3. 冒烟（人工）：DSH Desktop 0.1.5-rc.2 插件管理安装 `dsh-recall-plugin@2.3.12`（安装成功 / 可启用 / 重启后撤回按钮正常）；npm 版 web profile 已升级 2.3.12，重启后验证原有功能不受影响。
4. alpha.1 遗留观察项（旧 V2 会话撤回切割实弹、带文件附件消息重绘、本地 POSIX 路径图片重绘）仍待人工冒烟；0.1.5 正式版发布后重跑 `npm run check:upgrade`。

## 附：实证命令与结果

| 结论 | 证据 |
|---|---|
| 消费面零类型改动 | `gh api .../compare/dsh-v0.1.5-rc.1...dsh-v0.1.5-rc.2` 过滤消费面包源码/类型源 → 唯一命中 ui-chat CSS（+3 行） |
| 镜像零内容变化 | rc.2 tag 重拉 13 源，12 SAME；11 号逐行相同（CRLF 噪声） |
| 三层门禁实跑 | test:probe 31/31、verify:host 全过、npm test 307/307 |
| peer 全解析 | check:dsh：8 个 peer 本地 0.1.5-rc.2 均在范围内 |
| npm 发布实况 | `npm view @deepseek-ai/dsh dist-tags`：`next` → 0.1.5-rc.2，`latest` → 0.1.5-rc.1 |
| tag commit | `gh api repos/deepseek-ai/deepseek-harness/git/ref/tags/dsh-v0.1.5-rc.2` → `fb2c4b9` |
