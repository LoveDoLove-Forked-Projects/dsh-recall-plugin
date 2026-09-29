# 磁盘格式（快照存储 spec）

> **漂移即 bug**：本文描述快照存储的磁盘格式。代码（`src/host/` 的读写实现）是更深一层的事实源——本文与代码漂移时按代码修正本文；改动任何磁盘格式必须在同一次改动里更新本文。

## 摘要

快照存储的每个文件、每个 tag 的命名与格式语义都记在这里：排障时判断「这个文件是什么、能不能删」，兼容判断时确认「旧版本读到新格式会怎样」，演进格式时知道哪些字段受读取侧可选化纪律保护。全部内容可对照磁盘直接核对——文中每个形状都有源码位置与钉住它的单测。最重要的一条边界：索引损坏会被显式隔离并告警，而撤回链与意图记录损坏按「无」处理，两者语义差是有意设计。

## 目录

- [存储布局](#存储布局)
- [tag 命名](#tag-命名)
- [index.json](#indexjson)
- [lineage.json](#lineagejson)
- [其余文件](#其余文件)
- [格式版本与兼容纪律](#格式版本与兼容纪律)
- [开发者细节](#开发者细节)

## 存储布局

每个工作区一份独立的 store 目录，目录名是工作区绝对路径的单向 SHA256（反解不了，`root.txt` 保存映射）。两种形态：

- **home 态**：`<DSH_HOME 或 ~/.dsh>/dsh-recall-snapshots/<工作区路径SHA256>/`——排除表 `exclude.txt` 放在容器根，所有工作区共享一份。
- **降级态**（home 不可写）：整体落到 `<项目>/.dsh-recall-snapshots/`，排除表移入 store 目录内部。设置页按 store 分卡片列出。

```
<store>/
├── git/                       # 影子仓库工作目录（空目录，仅持有 .git）
│   └── .git/                  # 真实 git-dir（config / info / objects …）
│       ├── info/attributes    # 固化字节保真语义（内容见「其余文件」）
│       ├── gc.stamp           # 上次 gc 时间戳（跨重启节流凭据）
│       └── attrs-v1.stamp     # 存量索引 renormalize 一次性迁移标记
├── index.json                 # 快照索引（见下；原子写；损坏隔离）
├── lineage.json               # fork 撤回链（见下；损坏按无处理）
├── format                     # 磁盘格式版本 marker（见「格式版本与兼容纪律」）
├── recall-intent.json         # 操作意图 journal（见「其余文件」；仅执行中在场）
├── root.txt                   # 工作区绝对路径（展示映射，best-effort）
└── heartbeat                  # 双实例清扫让路依据（内容见「其余文件」）
```

影子里的一切 git 操作都以 `--git-dir=<store>/git/.git` 寻址，`--work-tree` 指向工作区——项目目录内不落任何插件文件（降级态除外，见上）。

## tag 命名

tag 是快照的**真相源**：`index.json` 丢失后，`rebuildOrphans` 依 tag 名反推重建（时间从 tag 恢复）。

| tag | 打点 | 语义 |
|---|---|---|
| `snap-<消息ID>` | 每条用户消息一次（agent 动文件之前） | 该消息发送前的工作区状态；消息 ID 即快照主键 |
| `snap-pre-rollback-<ts>` | 每次 `both` 撤回执行前 | 回退前的安全快照（H1 救援锚点）；**不进 `index.json`**、不出现在管理列表、不占条数配额 |

两者都是轻量 tag（`git tag -f`，指到 `commit-tree` 造的孤儿提交，无分支引用）；tag 时间用 `%(creatordate:unix)` 读取。安全 tag 不进索引是刻意的：进了就会被 `retention` / 条数上限当「最旧」清掉，救援点会随重度使用消失。

## index.json

快照索引，`IndexEntry[]` JSON 数组；空数组是合法状态（表示「无快照」）。写入是 tmp + rename 原子替换（`<file>.tmp` 写完再改名），并发写者互撞时 rename 的 ENOENT 视同成功。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 消息 ID，与 tag 后缀一致 |
| `time` | number | 快照时间（毫秒）；`time=0` 表示重建时拿不到时间的孤儿条目，清理时按最旧优先 |
| `root` | string | 工作区绝对路径（跨工作区展示的映射来源） |
| `sessionId` | string | 所属会话；孤儿为空串 |
| `feedback` | 可选 | 仅「需要解释」的消息写入，两种形状互斥：`{ failed: true, error?, kind? }`（快照失败，`kind` 为环境错误分类）与 `{ skipped: string[] }`（fail-open 跳过的路径清单） |

读取与损坏处理：

- **读取上限 4MB**（stdout 截断判定）：截断不是损坏——不隔离、按空索引继续、本次不写回（防残缺内存覆盖好文件），并记一条告警。
- **损坏 fail-loud**：JSON 解析失败或整体非数组时，坏文件改名 `index.json.corrupt-<ts>` 保留现场并记错误，之后按空索引继续（tag 是真相源，孤儿重建兜底）。逐条字段非法的条目单独过滤并计数告警，整体不判死。

## lineage.json

fork 撤回链，`{ childId, parentId, time? }[]`；快照管理按它把撤回产生的会话聚成「版本家族」。原子写（同 tmp + rename）。

与 `index.json` 的语义差是**有意设计**：lineage 损坏或不可读时按「无 lineage」继续（不隔离、不告警），快照树退化为普通分组，不影响任何快照数据；而索引损坏会改变「有哪些快照」的事实，必须显式暴露。

## 其余文件

| 文件 | 格式 | 语义与容错 |
|---|---|---|
| `root.txt` | 工作区绝对路径原文 | store 目录名哈希的反查映射（管理列表跨工作区展示用）；best-effort 写，失败不阻断主链，下次 `resolveStore` 自愈重写 |
| `heartbeat` | 单行 `<宿主PID> <epoch秒>` | 失败清扫的让路依据（双实例并发治理 M3）：TTL 900s，清扫前检查心跳有效且进程存活即让路 |
| `git/gc.stamp` | 单行 epoch 秒 | 上次 `git gc` 时间戳；启动时回读种子化节流，重启不重置周期 |
| `git/attrs-v1.stamp` | 内容 `1` | 存量索引 renormalize 一次性迁移标记；存在即跳过重跑 |
| `git/info/attributes` | `* -text -filter -ident -export-ignore -export-subst -working-tree-encoding` | 固化字节保真语义（issue #12）：影子仓库的最高优先级属性源，对全部路径一票否决项目的 `.gitattributes` |
| `exclude.txt` | 一行一条 gitignore 风格 pattern，`#` 为注释 | 用户自定义排除；home 态放容器根（全局共享），降级态在 store 目录内 |
| `format` | 单个正整数（当前为 `1`） | 磁盘格式版本 marker（A3）；缺席视为 1，高版本或损坏时拒写放行读——见下节 |
| `recall-intent.json` | `RecallIntent` JSON（见下），正常结束写空串清空 | 操作意图 journal（A2）：`both` 撤回执行期间在场，崩溃后由启动预热 / init 的恢复流程续做 |

`RecallIntent` 形状（`v` 是记录自身的版本号）：`{ v: 1, op: 'execute', messageId, root, safetyId, safetyOk, phase: 'rollback' | 'rescue', time }`。空串、损坏 JSON 或字段形状不符都按「无记录」处理。更长的叙事（为什么先落意图、残留记录怎么判定）见 `src/host/intent-journal.ts` 头注释。

## 格式版本与兼容纪律

三条纪律共同构成双向兼容：

1. **旧读新——读取侧字段全部可选化**：新增字段只追加、不改既有字段的含义；旧版本读新文件忽略未知字段（`index.json` / `lineage.json` 的 `root`、`feedback` 等字段都按此演进）。
2. **新读旧——缺省视为合法**：`format` 缺席视为 1（历史 store 从未写过该文件）；`recall-intent.json` 缺席或已清空视为「无中断」。
3. **旧读到更新的格式——fail-closed 拒写**：`format` 值高于当前插件支持（或内容非法、读不到）时，快照、撤回、删除、清理等写操作全部短路并告警，列表等只读路径不受影响。宁停勿混——旧代码把新格式文件当旧格式重写即数据破坏。修正方式：升级插件，或确认无新版本数据后删除该 marker 文件。

## 开发者细节

<details>
<summary>源码映射与单测归属</summary>

| 内容 | 实现 | 钉住它的单测 |
|---|---|---|
| tag 打点与命名 | `scripts.pwsh.ts` / `scripts.posix.ts` 的 `snapshotScript`、`rescueScript` | `scripts-contract.test.js`（cross-function tag 名契约） |
| index 读写 | `snapshots.ts` 的 `saveIndex` / `loadIndex` / `quarantineCorruptIndex` | `snapshots-persist.test.js`、`index-load.test.js` |
| lineage | `snapshots.ts` 的 `loadLineage` / `recordLineage` | `snapshots-persist.test.js` |
| format marker | `snapshots.ts` 的 `judgeStoreFormat` / `guardStoreFormat` / `stampStoreFormat` | `store-format.test.js`（五分支矩阵） |
| recall-intent | `intent-journal.ts` | `intent-journal.test.js`（三针往返 + recover 判定矩阵） |
| heartbeat / gc.stamp / attrs-v1.stamp | `scripts.*.ts` 的 `heartbeatBlock` / `ensureGitScript` / `attrsMigrateBlock` | `scripts-contract.test.js` |
| 原子写与并发容忍 | `store.ts` 的 `writeTextViaShell` / `renameTmpQuietly` | `store-write.test.js` |
| 磁盘枚举与空仓回收 | `dump-parse.ts`、`maintenance.ts` | `stores-dump.test.js`、`maintenance-*.test.js` |

格式改动的最小验证集：上表对应单测 + `npm run typecheck` + `npm run build`（产物新鲜度）+ 涉及双平台模板时两平台实弹。

</details>