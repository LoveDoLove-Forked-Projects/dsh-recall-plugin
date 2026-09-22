# 构建产物工作区根的快照护栏与残骸回收（issue #18）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-09-22，M1 + M2 + M3 全部实施：M1 双平台实弹 6/6、M3 实弹 4/4、门禁全绿）**
> 背景：[issue #18](https://github.com/limbo947/dsh-recall-plugin/issues/18)：会话的 workspace root 本身就是构建产物目录（`…/src-tauri/target/debug`、`dist`）时，插件照旧为它建影子仓库并全量快照——排除项是以 root 为基准的路径模式，root 的 basename 没有任何模式可匹配，单个会话就留下 1.2 GB 残留；且这类残留（refs 空 + `.git/index` 有 7068 条）连 `git gc --prune=now` 都回收不了（index 让 blob 伪可达），没有任何用户可见提示。
> 范围：M1（残骸仓库可被 gc 回收，纯脚本层）／M2（构建产物 root 不再产生新快照 + 可见性）／M3（存量残骸与空仓库清理，按需）。M1 与 M2 为首批，M3 视实弹结果决定是否同批。

## 复现验证（2026-09-22，本机实测）

环境：Windows 11 + PowerShell 7.6.6（`git version 2.53.0.windows.2`）；脚本模板取自 `npm run build` 后的 `lib/`（即 `src/` 的转译产物），`baseExcludes` 默认表从 [src/host/config.ts](../../../src/host/config.ts) 源码扣出——跑的就是插件会发出的命令，不是手抄的等价命令。造数：7000 个 16 KB 随机内容产物（109.4 MB）+ 2 个源文件。

| # | 观测项 | 实测结果 |
|---|---|---|
| 1 | root = `proj/src-tauri/target/debug` 快照 | index **5000** 条：root 下 `build/` 子树 2000 条被相对模式排除，**root 自身 0 条被排除**；快照耗时 23.3 s |
| 2 | root = `…/target/debug/deps`（内部无同名子目录） | index **1000/1000**，排除表命中 0——对 root 自身零作用的最干净证据 |
| 3 | 对照：root = 项目根 | index 仅 `Cargo.toml` + `src/main.rs`，整棵 `target/` 被排除（同一份排除表） |
| 4 | 删 tag 后 | refs 1→0，index 5000 条仍在 |
| 5 | `git gc --prune=now` 后 | 对象 5007 → 5006（**只少 1 个孤儿 commit**），in-pack 恒为 **78.4 MB**；`fsck --unreachable` 输出 **0 行**（仅 `notice: No default references`） |
| 6 | 拟议修复（`read-tree --empty` + gc） | in-pack **78.4 MB → 0.0 MB**，残留 1 个对象（空树 `4b825dc…`） |
| 7 | 对照：有 tag 的 store 跑 gc | refs / index 原样（清理条件不成立，正常库零影响） |
| 8 | POSIX（Git for Windows bash + `lib/scripts.posix.js`） | 300 条快照 → 删 tag → gc 后 in-pack 301 / 2.4 MB 不变 → 拟议片段后 **0.0 MB**（残留 1 个对象） |

与 issue 描述的差异（实施时按实测口径写文档）：

- issue 写「`baseExcludes` 对它们整体失效」——更精确的说法是**对 root 自身失效**，对 root 内部的同名子目录仍生效（第 1 行的 5000/7000 就是这条差异）。这决定了修法必须是「不建快照」而非「再多写几条排除」。
- issue 最坏形态的 workspace 是 `target/debug`，basename 为 `debug`、并不在默认表里——**只比对 root basename 的修法会漏掉它**，判定必须看路径段。
- 实测补充一条 issue 没写的：gc 会回收孤儿 commit（5007→5006），但 blob/tree 因 index 伪可达被全数留住，量级不变——「gc 是空操作」的直觉是对的，但差额是 1 个对象而非 0。

### 最小复现（不依赖插件，POSIX 语法；win32 换成等价 pwsh 命令）

```sh
mkdir -p /tmp/repro/proj/src-tauri/target/debug && cd /tmp/repro
# 1) 造 N 个 16KB 文件到 proj/src-tauri/target/debug 下（略）
# 2) 影子仓库形态与插件一致（store.git = <store>/git/.git）
git init /tmp/repro/store/git
printf '\n.git\nnode_modules/\n.dsh-recall-snapshots/\ndsh-recall-snapshots/\ntarget/\ndist/\n' > /tmp/repro/store/git/.git/info/exclude
git --git-dir=/tmp/repro/store/git/.git --work-tree=/tmp/repro/proj/src-tauri/target/debug add -A
t=$(git --git-dir=/tmp/repro/store/git/.git write-tree)
c=$(git --git-dir=/tmp/repro/store/git/.git -c user.name=x -c user.email=x@y commit-tree "$t" -m snapshot-1)
git --git-dir=/tmp/repro/store/git/.git tag -f snap-1 "$c"
# 3) 主张 1：排除表里明明有 target/，index 条目仍 ≈ 全部文件数
git --git-dir=/tmp/repro/store/git/.git ls-files | wc -l
# 4) 主张 2：删 tag 后 gc 回收不了
git --git-dir=/tmp/repro/store/git/.git tag -d snap-1
git --git-dir=/tmp/repro/store/git/.git count-objects -v | grep size-pack
git --git-dir=/tmp/repro/store/git/.git gc --prune=now
git --git-dir=/tmp/repro/store/git/.git count-objects -v | grep size-pack   # 不变
git --git-dir=/tmp/repro/store/git/.git fsck --unreachable --no-progress    # 0 个不可达
# 5) 回收路径
git --git-dir=/tmp/repro/store/git/.git read-tree --empty
git --git-dir=/tmp/repro/store/git/.git gc --prune=now
git --git-dir=/tmp/repro/store/git/.git count-objects -v | grep size-pack   # 0
```

## 关键设计决策

| 决策 | 理由 |
|---|---|
| 判定放「不建新快照」，而不是「把 root 加进它自己的 exclude」 | 用排除造出来的快照是**空树**；一旦用户后来放宽排除表，对新状态回退到那个空树快照会删掉目录下全部文件——回退删除侧按「当前有、目标无」清理（[src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L441-448）。停用快照是唯一安全语义。 |
| 判定看「任一路径段」而非 basename | issue 最坏形态 basename 是 `debug`，只看 basename 会漏（见上）。 |
| 判据复用 `baseExcludes`，不新增配置项 | 该表语义本来就是「这些目录不属于要快照的源码」，且已是设置页可编辑字段——删掉 `target/` 即恢复，逃生口零新增配置面。代价：这份表的语义从「文件级排除」扩展到「工作区级停用」，需在设置页 hint / README 写明。注意 `createConfig` 对空数组回落内置表（[src/host/config.ts](../../../src/host/config.ts) L85-87），「清空」不等于关闭，只能逐条删。 |
| M1 的 index 清理写在脚本模板内，不在 JS 侧前置一条命令 | 已在 gc 的同一进程、同一 git-dir，与快照共用串行队列天然互斥；JS 侧前置要多一次进程并维护两处一致性。 |
| 清理条件锁定「refs 空 **且** index 非空」 | 有 tag 就代表有可回退快照，此时 index 是合法「当前清单」（diff/rollback 依赖它），绝不能清。 |
| M2 只拦 `captureSnapshot`，不拦 init / 启动预热的 store 创建 | 拦截点选在唯一「新增 blob」的入口即可根治 GB 级问题；砍掉 init/预热链路会让存量快照不再进内存（旧消息撤回按钮凭空消失），而收益只是几个 KB 的空仓库。存量残骸交 M3。 |
| 可见性走 init 一次性 notice + `snapshot-info` 即时字段，不写逐消息 feedback | feedback 会随 `saveIndex` 落进 index.json（[src/host/snapshots.ts](../../../src/host/snapshots.ts) 反馈持久化），为每条消息写一条固定文案会让索引线性膨胀。 |
| 不加新错误码、不加新端点、不加新 Config 字段 | 三个门禁面（`errors.test.js` 的 code 全等、`verify-host` 的端点全等、`config.test.js` 的 DEFAULTS 全等）全部零改动，显著缩小改动面。 |

## M1 残骸仓库可被 gc 回收（P0）

### M1-D1 两套 `gcScript` 前置「清陈旧 index」

落点：[src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L510-520、[src/host/scripts.posix.ts](../../../src/host/scripts.posix.ts) L458-467，在 `git gc` **之前**插入：

```powershell
# pwsh：refs 空 + index 非空 = 没有可回退快照的残骸仓库。index 让 blob 伪可达，
# gc/prune 都按「可达」保留（实测 78.4MB 一根毛都回收不掉），必须先清 index。
$gcRefs = & $git --git-dir=$g for-each-ref --count=1 refs
$gcFiles = & $git --git-dir=$g ls-files
if (-not $gcRefs -and $gcFiles) { & $git --git-dir=$g read-tree --empty }
& $git --git-dir=$g gc --quiet --prune=now
```

```sh
# posix 同语义（set -e 下两条查询命令空结果都退出 0，实测）
if [ -z "$("$git" --git-dir="$g" for-each-ref --count=1 refs)" ] && [ -n "$("$git" --git-dir="$g" ls-files)" ]; then
  "$git" --git-dir="$g" read-tree --empty
fi
"$git" --git-dir="$g" gc --quiet --prune=now
```

选择 `read-tree --empty` 而不是 `rm -r --cached .`：前者只重写 index 元数据（不遍历工作区、不需 worktree），后者要逐条走路径——两者实测都能让 gc 归零，取成本更低者。

### M1-D2 语义安全论证（实施前逐条自查）

1. index 是可重建缓存：`diffScript` / `rollbackScript` / `snapshotScript` 三处**开头都先 `add -A`**（[scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L315/L360/L416，POSIX 侧共用 `collectListsBlock`），少了它反而会拿旧 index 比对。
2. 条件保证「有 tag 的库」永不进入清理分支（实测第 7 行：refs=1 时 refs/index 原样）。
3. gc 与快照/回退共用串行队列（`enqueue`），不存在「gc 清 index 的同时有快照在写」的竞态。
4. 唯一代价：清 index 后的下一条快照要把全部文件重新 stat/哈希一遍——只发生在「0 ref 残骸库」，那种库本就没有可回退快照。

### M1-D3 契约单测

[tests/unit/scripts-contract.test.js](../../../tests/unit/scripts-contract.test.js) L307-316 的 gc 段补断言（两套模板各一组）：含 `for-each-ref --count=1 refs`、含 `read-tree --empty`、且 `read-tree` 出现在 `gc --quiet` 之前；pwsh 侧保留既有 `$LASTEXITCODE` 检查及其「位于 gc 之后、写 `gc.stamp` 之前」的顺序断言。

### M1-D4 文档

CHANGELOG `[Unreleased]` 修复段一条：说明「无快照的残骸仓库现在能被 gc 回收」+ 为什么之前回收不了（index 伪可达）。

## M2 构建产物 root 不再产生新快照（P0）

### M2-D1 新增纯函数模块 `src/host/exclude-patterns.ts`

导出（模块级纯函数，无 ctx 依赖，仿 [src/host/diagnostics.ts](../../../src/host/diagnostics.ts) 的分层）：

- `dirNamePatterns(base: string[]): string[]`——筛出「目录形态」项：去尾 `/`、无通配符（`*?[]`）、无内部斜杠、非 `!` 反选。判据与脚本侧 oversize 目录跳过**逐字同源**（[scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L92-123 的 `$oversizeSkip` 构造），两处需在注释里互相指认。
- `isBuildArtifactRoot(root: string, base: string[], isWin: boolean): boolean`——把 root 拆成路径段（win32 去掉盘符与根、POSIX 去掉根），任一**非首段**命中 `dirNamePatterns` 即真；win32 大小写不敏感、POSIX 敏感（与 git 在两种文件系统上的语义对齐）。返回命中段名（如 `target`）供文案使用。

新文件必须同步接入：[scripts/build-host.mjs](../../../scripts/build-host.mjs) L16-20 的 `HOST_ENTRIES`（否则产物缺文件、运行时 import 失败）；[AGENTS.md](../../../AGENTS.md) 文件地图表格；`package-layout.test.js` 的白名单是「必须存在」断言、不受影响。

单测 `tests/unit/exclude-patterns.test.js`：`…/target/debug` 命中（段名 `target`）、`…/target/debug/deps` 命中、`node_modules/` 命中、普通项目路径不命中、`*.exe` 等通配项不参与、`D:\` 段不误判、POSIX 大小写敏感 vs win32 不敏感。

### M2-D2 `captureSnapshot` 早退

落点：[src/host/snapshots.ts](../../../src/host/snapshots.ts) L546-553，在 `resolveRoot` 之后、快照熔断判定之后、`resolveStore` **之前**：

```ts
// 构建产物目录（root 自身命中基础排除表的目录形态项）：整棵目录没有回退价值，
// 而代价是 GB 级对象库。必须在 resolveStore 之前返回——连空仓库都不建。
const seg = isBuildArtifactRoot(root, BASE(), rt.isWin)
if (seg) return
```

不写 feedback、不进熔断：这是设计行为而非失败（`snapshot-info` 的 `has:false` 已足够让按钮不出现，原因由 M2-D3 的 notice 承载）。

### M2-D3 可见性：init notice + `snapshot-info` notice + client toast

- [src/types/api.ts](../../../src/types/api.ts) L26-30：`InitNotice` 增 `buildRootSkip?: string`（命中段名，未命中为 undefined）；L45-50 `SnapshotInfoResponse` 增 `notice?: string`。
- [src/host/routes-core.ts](../../../src/host/routes-core.ts) L37-66（init）：解析到 root 且命中时下发 `notice.buildRootSkip`（**不改** store 链路，见决策）；L68-76（snapshot-info）：按会话解析到的 root 即时计算 `notice`（整句文案，服务端拼好；不落盘、不写 feedback）。
- client：[src/client/util.ts](../../../src/client/util.ts) L219-234 `ensureInit` 的 notice 分支加一条（会话内一次性说明）；[src/client/recall-node.ts](../../../src/client/recall-node.ts) L458-475 轮询分支在 `has:false` 且 `recent` 时 `showThrottledToast(res.notice)`（10 min 文本节流，不刷屏）。
- 文案草案（沿用 diagnostics 的纪律：≤140 字符、不嵌长路径、只嵌命中段名）：`当前工作区位于构建产物目录（路径段 target），已跳过项目快照；如需在此目录使用撤回，请在插件设置里从「基础排除表」移除该项。`
- client 改动意味着 `npm run build` 必须重跑（CI 有产物新鲜度门禁）。

### M2-D4 门禁与类型契约

`tests/types/api-contracts.test.ts` 的 endpoint↔response 对偶断言会随 `SnapshotInfoResponse` 字段漂移自然生效；无新端点、无新错误码、无新 Config 字段（见决策表末行）。

### M2-D5 文档

- README 双语：`baseExcludes` 语义补一句「目录形态的项同时决定**哪些工作区根不启用快照**」；默认表说明处给逃生口。
- [AGENTS.md](../../../AGENTS.md) 核心机制段（快照触发 + 排除表语义）+ 文件地图表格（新增模块）。
- CHANGELOG `[Unreleased]` 变更段：行为变更（构建产物 root 不再产生快照 + 可见提示）。

## M3 存量残骸与空仓库清理（P1，按需）——2026-09-22 已实施，见文末实施记录

M1 只能回收「内存里注册过的 store」——[src/host/maintenance.ts](../../../src/host/maintenance.ts) L270-272 `runGcAll` 走 `state.stores.values()`，即启动预热与历次操作认识过的工作区；**会话已删的残骸库永远不会被 gc 覆盖**。M3 两项按需实施：

- **M3-1 gc 覆盖磁盘枚举的 store**：`runGcAll` 用已有的 `dumpStores()`（[src/host/index.ts](../../../src/host/index.ts) L274-286）补齐磁盘全集，包装用现成的「按已枚举目录包装 store」先例（`storeFromDir`），**不要**走 `resolveStore(root)`（会给未知 root 建目录，[src/host/routes-manage.ts](../../../src/host/routes-manage.ts) 已有避免该副作用的先例）。只在「设置页立即 gc」这类显式触发下做（dump 有成本）。
- **M3-2 整仓删除条件化**：对「`for-each-ref` 为空 **且** index.json 为空数组/不存在」的 store 目录整体删除——复用 `legacyRmScript`（[scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L668 / [scripts.posix.ts](../../../src/host/scripts.posix.ts) L571 附近），这才是把 issue 那 1.2 GB **目录**真正清掉的动作（M1 只清对象库，目录与 `root.txt` 仍在）。两个前提都满足才删；仍走串行队列；删除后从 `state.stores` 摘除。
- **M3-3 可观测性（按需）**：设置页快照管理已有 `usage` 统计，可顺带展示 store 体积/refs，让「残骸占了多少盘」可见。

## 改动落点汇总

| 文件 | 改动 | 备注 |
|---|---|---|
| [src/host/scripts.pwsh.ts](../../../src/host/scripts.pwsh.ts) L510-520 | `gcScript` 前置清 index 条件块 | M1 单点 |
| [src/host/scripts.posix.ts](../../../src/host/scripts.posix.ts) L458-467 | 同上（同语义） | 两套模板必须同步 |
| `src/host/exclude-patterns.ts` | **新增**纯函数模块 | 接入 `build-host.mjs` HOST_ENTRIES |
| [src/host/snapshots.ts](../../../src/host/snapshots.ts) L546-553 | `captureSnapshot` 早退 | M2 单点 |
| [src/host/routes-core.ts](../../../src/host/routes-core.ts) L37-76 | init / snapshot-info 下发 notice | 不改 store 链路 |
| [src/types/api.ts](../../../src/types/api.ts) L26-50 | `InitNotice` / `SnapshotInfoResponse` 增字段 | 类型契约 |
| [src/client/util.ts](../../../src/client/util.ts) L219-234、[src/client/recall-node.ts](../../../src/client/recall-node.ts) L458-475 | notice 文案 + toast | 需 `npm run build` |
| [src/host/maintenance.ts](../../../src/host/maintenance.ts) L266-360 | M3：`runGcAll` 取「内存 ∪ 磁盘」store 全集 + 空仓目录回收；新增 `MaintenanceDeps.dumpStores` 注入面 | 立即 gc 路径 |
| [src/host/index.ts](../../../src/host/index.ts) L58 | 装配把 `dumpStores` 注入 maintenance | 函数声明提升可见 |
| [tests/unit/scripts-contract.test.js](../../../tests/unit/scripts-contract.test.js) L307-316 | gc 段补断言 | 两平台各一组 |
| `tests/unit/build-root-guard.test.js` | **新增**判定 + 早退 + 端点 notice 单测（9 例） | 含边界样本 |
| `tests/unit/maintenance-reap.test.js` | **新增** M3 单测（9 例：磁盘覆盖 4 + 空仓回收判定 5） | 三条全中才删 |
| [README.md](../../../README.md) / [README.en.md](../../../README.en.md) / [AGENTS.md](../../../AGENTS.md) / [CHANGELOG.md](../../../CHANGELOG.md) | 语义与行为变更说明 | 双语同步 |

修改前有效代码行数基线（棘轮规则，本次实测）：`scripts.pwsh.ts` 474、`scripts.posix.ts` 392、`snapshots.ts` 504、`routes-core.ts` 138、`client/util.ts` 209、`client/recall-node.ts` 529（均 < 700，新增逻辑仍按「优先放新文件」处理，`exclude-patterns.ts` 即为新文件）。

## 验收标准

门禁：`npm test`、`npm run typecheck`、`npm run build`（`git diff --exit-code lib/` 必须为空）、`npm run verify:host` 全绿。

实弹（四项，记录进 `docs/plans/completed/smoke-checklist-records.md`）：

1. **构建产物 root 不再快照**：在真实 Rust/C++ 项目构建目录（`target/debug`）起会话 → 发一条消息 → 该 root 的 `count-objects` 计数不增长、无 `snap-*` tag、撤回按钮不出现、toast/notice 出现且文案写明命中段名。
2. **逃生口有效**：设置页从「基础排除表」删掉 `target/` → 同一目录再发消息 → 快照恢复（有 tag、按钮出现）；改回后立即失效（排除表热更新语义不变）。
3. **残骸可回收**：按上文最小复现造 0-ref 残骸库 → 设置页「立即 gc」→ `size-pack` 归 0、目录体积下降，且 `for-each-ref` 仍为空（没有误造出 tag）。
4. **正常库零影响**：项目根工作区的快照/预览/回退/救援全链不变；有 tag 的 store gc 后 tag 与 index 原样。

## 风险与回退

| 风险 | 缓解 / 回退 |
|---|---|
| 路径段误判（如 `D:\build\repos\app` 被当成构建产物根）导致正常项目停用快照 | 提示文案写明命中段名；逃生口＝删除 `baseExcludes` 对应项（即时生效）；判定函数是单点，必要时切备选方案（见下） |
| 有人把 root 自身写进 exclude 以「省事」 | 已明确否决并给出破坏性理由（空树快照 + 后续回退删全目录） |
| gc 清 index 误伤正常库 | 条件（refs 空 && index 非空）+ 串行队列 + 契约单测三重约束；回退＝删掉条件块（M1-D1 单点） |
| 清 index 后下一条快照全量重哈希 | 只发生在 0-ref 残骸库（本无可回退快照），且只影响那一条消息 |
| 两平台模板语义漂移 | 同批同语义修改 + 契约单测 + 双平台实测（本次已在 Git for Windows bash 上验过拟议片段） |

## 备选方案（本次不实施，记录取舍）

- **B1 只匹配最后两段路径**：少误伤 `D:\build\repos\app`，但漏 `target/debug/<子目录>` 形态；判定函数单点，可后切。
- **B2 新增显式 Config 开关**（默认停用构建产物 root）：逃生口更明确，代价是配置面 +1（schema/DEFAULTS/types/设置卡片/`config.test.js` DEFAULTS 全等断言/README 表）。
- **B3 把 root 加入自身 exclude**：否决，见决策 1。
- **B4 gc 时顺带删空仓库目录**：与 M3-2 重合；M1 保持「只清对象库」的最小形态。

## 实施顺序

M1-D1 → M1-D3 → M2-D1 → M2-D2 → M2-D3 → M2-D4（`npm run build`）→ 双平台实弹（验收 1/3/4）→ 逃生口实弹（验收 2）→ M1-D4 / M2-D5 文档 → 视实弹结果决定 M3 是否同批。

## 实施记录（2026-09-22）

M1、M2 按上述顺序落地；M3 由用户追加要求在同日实施（见本节末三段）。

**改动**：`src/host/scripts.{pwsh,posix}.ts` 的 `gcScript` 前置清 index 条件块（`for-each-ref --count=1 refs` 空 && `ls-files` 非空 → `read-tree --empty`）；新增 `src/host/exclude-patterns.ts`（判定 + 文案）并接入 `scripts/build-host.mjs` 的 `HOST_ENTRIES`；`src/host/snapshots.ts` 的 `captureSnapshot` 在 `resolveStore` 之前早退；`src/host/routes-core.ts` 的 init / snapshot-info 下发 notice；`src/types/api.ts` 的 `InitNotice` / `SnapshotInfoResponse` 增字段；client `util.ts`（会话级 notice）与 `recall-node.ts`（轮询分支节流 toast）。

**与计划的两处偏差（均为实施期定稿，优于原方案）**：

1. 端点字段定名 `InitNotice.buildRootNotice?: string`（原计划 `buildRootSkip?: string`）——它的值是**已拼好的一句话**，不是机器码；文案唯一来源 `exclude-patterns.buildRootNotice`，Host 两处下发同一句，client 只展示不做拼接（避免中英文案在两端各存一份）。
2. 判定函数定名 `buildArtifactRootSegment(root, base, isWin): string | null`（原计划 `isBuildArtifactRoot(): boolean`）——直接返回命中段名，布尔语义由真值性表达，省掉调用侧「再算一次段名」的二遍逻辑。
3. 单测合并为一个文件 `tests/unit/build-root-guard.test.js`（原计划拆 `exclude-patterns.test.js` + 守卫测试）：判定、早退、端点 notice 是同一特性的三层，放一起改判据时不会漏改断言。

**门禁**：`npm run typecheck` 零错误；`npm test` 31 文件 382 例全绿（新增 9 例：判定边界 5 + captureSnapshot 早退/回归 2 + 端点 notice 2；`scripts-contract` 增「gc 前置清陈旧 index」1 例）；`npm run build` 后 `lib/` 新增 `exclude-patterns.js`、其余产物更新；`npm run verify:host` 通过（inject=shell,sessions,agents，端点 12 项）。

**M1 双平台实弹（6/6，脚本由修复后的 `lib/` 模板产出）**：

| 形态 | pwsh | posix（Git for Windows bash） |
|---|---|---|
| A 残骸库（refs=0 / index=300 条） | 对象 302 → **1**（in-pack 1、size-pack 0），index 条目 300 → 0，`GC_OK` | 同左（302 → 1、size-pack 0） |
| B 正常库（有 tag） | refs=1、index 300→300、`snap-mB^{tree}` 仍可解析 | 同左 |
| C 空库（refs=0 且 index=0） | 清理分支不成立，`GC_OK` 照常 | 同左 |

（残留的 1 个对象是 git 的空树常量 `4b825dc…`，与修复前的单测观察一致。）

**M2 实弹范围说明**：判定 / 早退 / notice 三层由单测覆盖（9 例，含「未命中时照常走快照链」的反向回归钉），并核对了 `lib/` 产物确实包含护栏与 notice 接线（`snapshots.js` / `routes-core.js` / `client.js` / `exclude-patterns.js`）。**验收标准 1、2 的 DSH 会话级实弹（在真实 `target/debug` 里开会话看「无新快照 + 提示」、以及改设置页排除表看「恢复快照」）尚未执行**——需要活体 DSH 会话，留待发布前的人工冒烟批次，记录进 `docs/plans/completed/smoke-checklist-records.md`。

**M3 追加实施（同日，用户追加要求）**：`runGcAll` 改为取「内存缓存 ∪ 磁盘枚举」的 store 全集（新增 `MaintenanceDeps.dumpStores` 注入面，由 [index.ts](../../../src/host/index.ts) 装配时传入已有的 `dumpStores`），按 `store.git` 去重后逐仓 gc；逐仓 gc 之后追加空仓目录回收。M3-3（可观测性）未做——设置页 `usage` 统计已覆盖容器体积与 home/降级仓库数量，够回答「占了多少盘」。

回收判定与计划原文的差异（**收紧**，安全优先）：计划写的是「`for-each-ref` 空 且 index.json 为空数组/不存在」，实现改为**只认「index.json 明确解析出的空数组」**——`entries === null`（索引缺失、或损坏后被隔离改名）一律不删，因为那可能是待复查的隔离现场。代价是「从未写过索引的 store」不在此列，但它的对象库已由 M3-1 的 gc（含 M1 的条件清理）回收，目录本身只有 KB 级。判定三条全中才删：`entries` 明确为空数组 + `listTagsScript` 返回空 + 内存无该目录/该 root 的快照；删除走 `legacyRmScript`，删前 `console.error` 留痕（不可逆操作可追溯，同 `purgeSession` 纪律），删除后同步摘除 `state.stores` / `gcLastAt` / `gcCount` / `indexLoaded`。

**M3 门禁与实弹**：`npm test` 32 文件 **391 例**全绿（新增 `tests/unit/maintenance-reap.test.js` 9 例：磁盘覆盖 4 + 空仓回收判定 5，含「旧调用形态退化为内存缓存」「dump 抛错不阻断」「先 gc 后删目录」的顺序断言）；`typecheck` 零错误。实弹（真实 store 目录、win32 pwsh，4/4）：`storesDumpScript` + `parseStoresDump` 对残骸库返回 `entries: []`、对正常库返回 1 条；`listTagsScript` 分别返回空 / `snap-mA`；残骸库经 gc 后对象 202 → 1，`legacyRmScript` 整目录删除成功；有 tag 的仓库目录与 tag 原样。

**仍未做**：验收标准 1、2 的 DSH 会话级实弹（真实 `target/debug` 开会话看「无新快照 + 提示」、改设置页排除表看「恢复快照」）与 M3 在设置页「立即 gc」上的活体验收——需要活体 DSH 会话，留待发布前的人工冒烟批次，记录进 `docs/plans/completed/smoke-checklist-records.md`。
