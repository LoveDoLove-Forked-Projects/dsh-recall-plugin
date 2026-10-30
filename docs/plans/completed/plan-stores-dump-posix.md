# POSIX dump 脚本的两处行边界缺陷（issue #30）

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：**已完成（2026-10-30；门禁 typecheck + 551 例 + 129 例 + probe 58 例 + verify:host 全绿，回归测试在新旧代码上 6/6 反差验证；活体冒烟三条链路通过，见第 5 节）**
> 背景：[issue #30](https://github.com/limbo947/dsh-recall-plugin/issues/30)（Linux + dsh 0.2.1-rc.5 + 插件 2.5.2/2.5.3）报告「空快照仓缺 `index.json` 时 dump 脚本退出 1，快照管理/批量删除/gc-all 全不可用」。

## 1 问题：报告只诊断了一半

issue 给的是 `set -e` + 裸 `cat` 的组合，这条成立（记作 D1），但**修完它用户仍然看不到树**——还有一条它没发现的 D2 覆盖全部 linux/darwin 仓，不只空仓。

| 缺陷 | 位置 | 机理 |
| --- | --- | --- |
| D1 | `storesDumpScript`（POSIX）两处 `cat "$d/index.json" / lineage.json 2>/dev/null` | 这两个文件是可选的（建仓后还没拍过快照就没有），`2>/dev/null` 只吞报错文本不改退出码，`set -e` 让整条 dump 在第一个空仓处终止 |
| D2 | 同上，段尾 `echo INDEXEND` / `echo LINEAGEEND` | `writeTextViaShell` 在 POSIX 就是 `cat > file`，落盘内容**没有尾换行**；`cat` 之后紧跟 `echo` 会把标记接到内容行尾（`[{...}]INDEXEND`），而 `parseStoresDump` 用 `line === 'INDEXEND'` 整行匹配 ⇒ 永远收不到段尾，每个仓都解析成 `entries = null` |
| D3 | `excludeDumpScript`（POSIX）`base64 … \| tr -d '\n'` 后紧跟 `echo 'EXCLEND'` | 同一类行边界问题。payload 字节数为 3 的倍数时 base64 无 `=` padding，粘在尾部的 `EXCLEND` 会被一起解码成垃圾字节——设置页 exclude 编辑器回显它、用户一保存就写回 `exclude.txt` |

实测证据（本机 Git Bash 5.2.37 + 修复前 `lib/` 产物）：

- D1：空 store → 输出停在 `INDEXBEGIN` 后、`exit=1`；填入 `[]` 两端文件 → `exit=0`。同 fixture 走 pwsh 模板 → `exit=0`（`Test-Path` 分支），**故仅 linux/darwin 受影响**。
- D2：健康 store（index 1 条、lineage 1 条）→ 行为 `[{...}]INDEXEND`，`parseStoresDump` 得 `entries=null, lineage=null`；同 fixture 走 pwsh 解析正确。这解释了为什么报告者「补齐文件 + 加 `|| true`」后退出码正常、树依然是空的。
- D3：内容 `abc`（3 字节）→ 行内容 `YWJjEXCLEND` → 解码出 8 字节 `abc\x11p\x8b\x10\xd0`。

## 2 方案

**修法**：两处 `cat` 补 `|| true`（缺席与「读失败」都收成成功），并在每段内容之后显式 `printf "\n"`，保证段尾标记独占一行。`excludeDumpScript` 同理在 `tr -d '\n'` 之后补换行。

改动只落在 POSIX 模板，**dump 输出格式与 `src/types/scripts.ts` 契约不变**，pwsh 侧本来就正确（`Write-Output` 自带行尾 + `Test-Path` 分支），无需改动。存量数据也无需迁移：磁盘上的 `index.json` / `lineage.json` 保持原样即可正确读出。

**为什么不用 base64 重做 storesDump**（PF-8 对 exclude 用的是这条路）：换格式要同时动两平台模板 + 解析器 + 既有测试，收益只是「免疫标记碰撞」——而 `index.json` 由 `JSON.stringify` 落成单行，出现整行等于 `INDEXEND` 的情形不存在。低风险对齐现有形态更划算。

**不采纳 issue 的建议「warmup 建仓时就把 index.json 落成 `[]`」**：

1. `resolveStore` 在**每次进程启动**（`state.stores` 缓存为空）都会跑，无条件写 `[]` 会把已有索引清空；
2. 改成「仅缺失时写」需要一个新脚本模板，而这是一条 fire-and-forget 原子写，可能与 `saveIndex` 竞态、覆盖刚落盘的索引（`persistRootHint` 敢 fire-and-forget 是因为 `root.txt` 内容幂等，`[]` 不是）；
3. 更麻烦的是它会让「index 缺失 = 待复查隔离现场」这条安全判据（`maintenance.ts` 的 `reapEmptyStores`）失效，隔离现场反而会被当空仓删掉。

**不采纳 issue 的建议「脚本保持 fail-fast」**：dump 的语义本就是逐 store 隔离（解析层早已做到「单个 store 的 JSON 损坏只丢它自己」），可选文件缺席与该语义同级，不该升级为整体致命失败。

## 3 防回归：从「字符串断言」升级为「真跑一遍」

现有 545 例单测全绿却漏掉这两个缺陷，因为 `stores-dump.test.js` / `scripts-contract.test.js` 只断言脚本文本与解析器行为，**从不执行生成的脚本**；CI 虽在 ubuntu 却从没真跑过一次 bash。

新增 `tests/unit/stores-dump-script.test.js`：探测可用 POSIX shell（非 win32 直接认 `bash`；win32 只认 Git Bash 一类方言，WSL 的 Linux 报头无法使用本测试的 Windows 风格 fixture 路径，故不认；都找不到就整组 skip——CI 在 ubuntu 必然执行），在 bash 里跑生成的脚本并喂给解析器，覆盖 6 个用例：

- 健康 store（无尾换行的 index/lineage）→ 两段都能解出；
- 空仓（两文件全缺）→ 退出 0、两段 `null`；
- index 损坏 → 只丢该 store，同容器其余 store 照常解析；
- `index.json` 为显式 `[]` → `entries` 是 `[]` 而非 `null`（gc 空仓回收判据靠这个区分）；
- 内容自带尾换行 / 多行 pretty JSON → 补的换行不制造空段；
- exclude 内容字节数为 3 的倍数（无 padding）→ 不被 `EXCLEND` 尾巴污染，普通带 padding 内容原样解回。

**敏感度验证**：把 `scripts.posix.ts` 临时 `git stash` 回修复前，该文件 6 例**全红**；恢复后 6 例全绿。

## 4 门禁

`npm run typecheck` 零错误；`npm test` **44 文件 551 例全绿**（新增本文件 6 例）；`npm run test:client` 129 例；`npm run build` 产物与提交内容一致；`npm run verify:host` 通过。

## 5 活体冒烟（2026-10-30，2.6.0 批次）

记录全文见 [smoke-checklist-records.md](smoke-checklist-records.md) 同日批次，要点：

- **POSIX dump 真实数据**：对 `~/.dsh/dsh-recall-snapshots` 的 11 个真实 store 跑修复前后模板——修复后 exit=0、11/11 解析条数与磁盘一致；修复前 exit=1、仅 1 个 store 有输出且 `entries=null`、9 个没输出。
- **headless 真实消息**：新 store + `snap-*` tag + `index.json` 一条 + 心跳正常，树内文件正确；同工作区第二条消息后 tags=2、索引 2 条（无死锁）。
- **web 宿主 API**：`manage list` 55 条 / 6 工作区（dump→parse 无回归）；跨 root 并发 preview 双双成功；`preview → execute(both)` 把改动的 `src/app.txt` 还原；`manage gc` 走 `enqueueMany` 29.3s 收敛未死锁。
- **未覆盖**：同进程内两个工作区同时拍快照的并发编排（需 UI 双会话驱动），该语义目前由 `queues.test.js` 与并发 preview 间接覆盖。

## 6 遗留（不在本轮）

- **dump 失败对用户不可见**：`dumpStores` 失败只 `console.error`，`manage list` 仍返 `ok:true` + 空数组，界面只见空树、无任何提示——下次同类故障用户依然只能靠翻日志发现。做成错误码 + toast 需要动端点返回契约与 client，另开。
- **从未拍过快照的空仓无法被回收**：这类 store 的 `entries` 为 `null`，永远不满足 `reapEmptyStores` 的回收条件，会一直挂在磁盘（报告者 7 个）。要回收得让 dump 区分「文件缺失」与「文件损坏」，属契约扩展，另开。
