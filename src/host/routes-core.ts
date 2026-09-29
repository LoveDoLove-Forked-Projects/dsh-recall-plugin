/**
 * dsh-recall-plugin — 核心路由域（R2 从 index.js 拆出）
 *
 * init / snapshot-info / preview / execute / status / lineage-record 六个核心
 * 端点。依赖经 deps 注入（rt/snaps/state/cfg/enqueue/agentBusy/rescueRollback
 * 等），无模块级可变状态（HMR 假设）。preview/execute 内部跑 git add -A，
 * 经 enqueue 排进与快照/gc 同一条串行队列，避免 index.lock 竞态。
 */

import { ENV_HINTS } from './diagnostics.js'
import { parseTreeId } from './snapshots.js'
import { buildArtifactRootSegment, buildRootNotice } from './exclude-patterns.js'
import type { Runtime, SharedState, ErrorRecord, StoreInfo } from '../types/state.js'
import type { ResolvedConfig } from '../types/config.js'
import type { SnapshotsApi } from './snapshots.js'
            import type { IntentJournal } from './intent-journal.js'
import type { EnvErrorKind } from './diagnostics.js'
import type { InitArgs, InitResponse, InitNotice, SnapshotInfoArgs, SnapshotInfoResponse, PreviewArgs, PreviewResponse, ExecuteArgs, ExecuteResponse, RecallScope, StatusArgs, StatusResponse, LineageRecordArgs, LineageRecordResponse, ErrBody } from '../types/api.js'

// 端点依赖注入面（index.ts 装配时逐项提供；ctx 不解构的 A4 纪律见工厂注释）
export interface RoutesCoreDeps {
  rt: Runtime
  snaps: SnapshotsApi
  // A2 操作意图 journal（init 端点是 recover 的第二挂载点；execute 三针写记录）
  intentJournal: IntentJournal
  state: SharedState
  cfg: ResolvedConfig
  supported: boolean
  enqueue<T>(task: () => Promise<T>): Promise<T>
  agentBusy(sessionId: string | null, root: string | null): boolean
  rescueRollback: typeof import('./snapshots.js').rescueRollback
  E: typeof import('./errors.js')
}

export function createRoutesCore(deps: RoutesCoreDeps) {
  // ctx 不解构（A4）：本域所有服务访问都已由 rt/snaps 封装，直接摸 ctx 会
  // 绕过工厂分层——留空位只会诱导未来代码破坏依赖注入约定
  const { rt, snaps, state, cfg, supported, enqueue, agentBusy, rescueRollback, intentJournal, E } = deps

  return {
    'init': async (args: InitArgs): Promise<InitResponse> => {
      if (!supported) {
        return { ok: false, root: null, notice: { unsupported: true } }
      }
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      const root = await rt.resolveRoot(sessionId)
      let notice: InitNotice | null = null
      if (root) {
        let store: StoreInfo | null = await rt.resolveStore(root)
        store = await rt.tryUpgradeToHome(root)
        // 非空断言：resolveStore 恒在 state.stores 写入并返回 store（含降级兜底，
        // 不返 null），tryUpgradeToHome 只在该 store 存在时返回它——null 不可达。
        // 保持迁移前控制流：不做守卫跳过（守卫会把「ensureGit 抛错中断 init」的
        // 旧语义改成静默继续 loadIndex）
        await rt.ensureGit(root, store!)
        await snaps.loadIndex(root, sessionId)
        await snaps.rebuildOrphans(root, sessionId)
        // A2：中断回退续做（预热有 shellReady 放弃分支，init 是每会话必经
        // 通道——两路幂等，journal 内部按 store 去重）。A3 拒写态下跳过
        if (store && await snaps.guardStoreFormat(store)) await intentJournal.recover(store)
        rt.cleanupLegacy(root)
        // 降级状态随 init 下发，Client 弹一次性提示（每次页面加载各弹一次）：
        // gitMissing=未检测到 git CLI（撤回按钮不出现）；homeFallback=home
        // 不可写，快照降级存进项目内 .dsh-recall-snapshots。
        notice = {
          gitMissing: state.gitExe === '',
          homeFallback: store ? !store.home : false
        }
        // issue #18：root 自身是构建产物目录时快照被停用（captureSnapshot 早退），
        // 会话级说明一次——否则用户只会看到「撤回按钮不出现」而无从判断原因。
        // A4：段名（artifactSeg）与拼好的中文文案（buildRootNotice）一并下发——
        // client 优先按段名本地取词，中文字段保留一个版本周期
        const artifactSeg = buildArtifactRootSegment(root, cfg.baseExcludes, rt.isWin)
        if (artifactSeg) {
          notice.buildRootArtifactSeg = artifactSeg
          notice.buildRootNotice = buildRootNotice(artifactSeg)
        }
      }
      // 顺带下发客户端行为开关（fillDraft 等）：Client 无须为读配置单开请求，
      // init 是每会话必经的预热通道；A4 追加 locale（界面语言偏好）
      return { ok: Boolean(root), root: root || null, notice, config: { refillDraft: cfg.refillDraft, archiveOriginal: cfg.archiveOriginal, locale: cfg.locale } }
    },

    'snapshot-info': async (args: SnapshotInfoArgs): Promise<SnapshotInfoResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const snap = state.snapshots.get(id)
      // 失败/跳过/熔断反馈（issue #7 失败可见性）：客户端轮询到 failed 即
      // 终止轮询并 toast，不再空等 20 次；has 时附带 skipped 让用户知道
      // fail-open 跳过了哪些路径
      const feedback = await snaps.feedbackFor(args ? args.sessionId : null, id)
      // issue #18：构建产物工作区根不会有快照（captureSnapshot 早退），客户端轮询
      // 到 has:false 且无 failed 会静默放弃——补一条说明性 notice 让「按钮不出现」
      // 有原因可查。root 解析走 state.roots 缓存，重复轮询不额外付费用。
      const sroot = await rt.resolveRoot(args && args.sessionId ? String(args.sessionId) : null)
      const artifactSeg = sroot ? buildArtifactRootSegment(sroot, cfg.baseExcludes, rt.isWin) : null
      return {
        has: Boolean(snap), time: snap ? snap.time : null, id, ...feedback,
        // A4：段名与中文 notice 并存下发（client 优先段名本地取词，见 init 同处注释）
        notice: artifactSeg ? buildRootNotice(artifactSeg) : undefined,
        artifactSeg: artifactSeg || undefined
      }
    },

    'preview': async (args: PreviewArgs): Promise<PreviewResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      // P0-1：目标工作区 agent 运行中直接拒绝预览（避免用户确认时文件被
      // agent 改动，预览清单与实际回退内容脱节）。同会话优先命中（最常见
      // 场景），快照存在时叠加跨会话同工作区检查。
      const snap = state.snapshots.get(id)
      if (agentBusy(sessionId, snap ? snap.root : null)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
      const result = await enqueue(() => snaps.diffFor(id))
      if (result === null) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
      const snap2 = state.snapshots.get(id)
      const cutSeq = await snaps.resolveCutSeq(sessionId, id)
      // PF-1：treeId 是 preview 时 add -A 后的 index 树指纹，Client 确认时
      // 透传回 execute——Host 与安全快照指纹比对即可判定「预览后文件是否
      // 变化」，省掉 execute 侧整条重复 diff。旧版 Client 不认识该字段，
      // 无值时 execute 退回 previewTotal 校验（向后兼容）。
      return { ok: true, changes: result.changes, total: result.total, truncated: result.truncated, treeId: result.treeId || null, time: snap2 ? snap2.time : null, root: snap2 ? snap2.root : null, cutSeq }
    },

    'execute': async (args: ExecuteArgs): Promise<ExecuteResponse> => {
      const id = args && args.messageId ? String(args.messageId) : ''
      const sessionId = args && args.sessionId ? String(args.sessionId) : null
      // scope 解析：缺省/非法值一律回落 both——老 Client 不发、直调 API 乱发都
      // 落回现状链路，Host/Client 同包发布无需能力协商。session-only 走独立
      // 短路径：不进串行队列（队列是为 git 锁互斥而设，本路径零 git 写操作，
      // 入队只添延迟）、跳过 STALE 校验/安全快照/rollbackFor/rescue 全链——
      // 无文件覆盖即无不可逆操作，无需救援锚点。保留 NO_SNAPSHOT（快照存在性
      // 仍是消息归属的判定依据，且防御直调 API）与 agentBusy 拦截（fork +
      // 归档会把运行中的 agent 留在被归档的原会话里继续写日志）；检查在队列外
      // 进行：无文件变更，P0-1「检查后紧接执行、窗口为零」的动机不成立，检查
      // 退化为护栏而非不变量。
      const scope: RecallScope = args && args.scope === 'session-only' ? 'session-only' : 'both'
      if (scope === 'session-only') {
        const snap = state.snapshots.get(id)
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
        const cutSeq = await snaps.resolveCutSeq(sessionId, id)
        // fork 仍会把切点窗口内的入队事件 seed 进子会话（与模式无关），清理链
        // 照常走（both 分支下方的注释有完整说明）
        const staleQueueItemIds = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq)
        // count 语义 = 回退文件数：session-only 恒为 0（done 面板本就不展示 count）
        return { ok: true, count: 0, cutSeq, staleQueueItemIds }
      }
      const result = await enqueue(async (): Promise<{ ok: true; count: number } | ErrBody> => {
        const snap = state.snapshots.get(id)
        if (!snap) return { ok: false, code: E.RECALL_NO_SNAPSHOT, message: '该消息没有可用的项目快照' }
        const store = state.stores.get(snap.root)
        if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: '快照存储不可用' }
        // A3：格式守卫（fail-closed）——安全快照打 tag 与工作区 reset 都是写
        // 操作，高版本/损坏 store 拒执行；预览/列表等读路径不受影响
        if (!(await snaps.guardStoreFormat(store))) {
          return { ok: false, code: E.RECALL_FORMAT_BLOCKED, message: '磁盘格式不受支持，已停止写入；详见「最近错误」' }
        }
        // P0-1：队列内第一步——执行前再查一次 agent 状态。检查放在互斥
        // 队列内，检查后紧接执行，中间不可能插进别的操作，窗口为零。
        if (agentBusy(sessionId, snap.root)) return { ok: false, code: E.RECALL_AGENT_BUSY, message: 'Agent 正在运行中，请先停止后再撤回' }
        // P0-3 / PF-1：preview→execute 失效校验，两代并存——
        // - 新版 Client 透传 previewTreeId（preview 时 add -A 后的 index 树
        //   指纹）：与下方安全快照输出的指纹比对，内容级一致判定，且免掉
        //   一整条重复 diff 进程（一次撤回 4 条重进程 → 3 条）。
        // - 旧版 Client 只带 previewTotal：退回条目总数校验（多付一次 diff，
        //   同数不同文件的边缘情形由安全快照兜底）。
        // - 都不带（直调 API）：不校验，与 P0-3 同款可选语义。
        const previewTreeId = args && typeof args.previewTreeId === 'string' && args.previewTreeId ? args.previewTreeId : null
        if (!previewTreeId && args && typeof args.previewTotal === 'number') {
          const fresh = await snaps.diffFor(id)
          if (!fresh || fresh.total !== args.previewTotal) {
            return { ok: false, code: E.RECALL_STALE, message: '预览后项目文件发生了变化，请重新预览确认' }
          }
        }
        // 回退前自动打安全快照：回退覆盖工作区且不回写 index（旧的
        // 「当前状态」从此无任何快照可找回），用消息 ID 打 tag 会与该消息
        // 的既有快照碰撞，故用独立前缀的时间戳 tag——不进 index.json
        // （列表不展示），但孤儿重建/手动 git tag 仍能找到它，误回退后
        // 用户可让插件从该 tag 恢复，堵住唯一的不可逆操作缺口。
        // 失败时 safetyOk 置 false：后续回退若也失败将无救援点（H1），
        // 行为退化为现状（fail-loud），不更差。
        // PF-1：安全快照输出的树指纹就是「执行时刻的工作区状态」——与
        // previewTreeId 不一致 → STALE（此时安全快照已打下，isSafetySnapshotId
        // 让它不进索引，反而是额外的救援点）。安全快照失败时无指纹可比对，
        // 跳过指纹校验继续回退（不阻断主流程的既有语义）。
        const safetyId = 'pre-rollback-' + Date.now()
        let safetyOk = false
        let safetyTreeId = null
        try {
          const out = await rt.runShell(rt.scripts.snapshotScript(snap.root, store, state.gitExe || '', safetyId, cfg.baseExcludes), { timeoutMs: 600000, stdoutMaxBytes: 65536 })
          safetyOk = true
          safetyTreeId = parseTreeId(out)
        } catch (error) {
          // 安全快照失败不阻断回退本身：用户已确认覆盖，记录后照原计划执行
          rt.recordError('recall safety snapshot failed: ' + String(error))
        }
        if (previewTreeId && safetyTreeId && safetyTreeId !== previewTreeId) {
          return { ok: false, code: E.RECALL_STALE, message: '预览后项目文件发生了变化，请重新预览确认' }
        }
        // A2 针 1：安全快照后、动磁盘前落意图（回退中途断电时启动/init 的
        // recover 据此续做；写失败只告警不阻断主流程——U4 纪律）
        await intentJournal.begin(store, snap.root, { messageId: id, safetyId, safetyOk })
        const rolled = await snaps.rollbackFor(id)
        if (rolled.ok) {
          // A2 针 2：回退成功清记录（残留会被下次启动误判为中断，见 recover）
          await intentJournal.clear(store)
          return rolled
        }
        // A2 针 3：救援也会写工作区（reset 到安全快照），先推进 phase 再执行；
        // rescue 后无论成败都 clear——失败虽留下现场，但手动命令逃生门已在
        // 结果面板给出：留着记录会让下次启动的自动 reset 覆盖用户按手动命令
        // 恢复后的新改动（记录内容由下方提示的路径可查）。
        // 回退失败（rollbackFor 返回 partial，工作区可能半回退）：用安全快照
        // 救援（H1）。rescueRollback 是 snapshots.js 模块级纯逻辑，副作用经
        // deps 注入，三分支（无救援点/救援成功/救援失败）单测直接钉。
        await intentJournal.advance(store, 'rescue')
        const rescueResult = await rescueRollback(
          { runShell: rt.runShell, scripts: rt.scripts, gitExe: state.gitExe || '', recordError: rt.recordError },
          { root: snap.root, store, safetyId, safetyOk, rollbackError: rolled.error }
        )
        await intentJournal.clear(store)
        // U4 留痕：提示附意图文件路径（中断点记录位置，用户可精确知道恢复
        // 到了哪一步、现场在哪）
        if (rescueResult && rescueResult.message) rescueResult.message += '（中断点记录：' + intentJournal.file(store) + '）'
        return rescueResult
      })
      if (!result.ok) return result
      // 文件回退后再解析切点：切点只依赖会话日志，与快照是否删除无关（命中缓存，瞬时）
      const cutSeq = await snaps.resolveCutSeq(sessionId, id)
      // 顺带解析 fork 会带进子会话的残留排队项 id（见 snapshots.ts
      // scanStaleQueueItemIds 的窗口说明）：Client 在 fork 出子会话后按 id 直删，
      // 否则输入框上方会凭空多出一条被撤回消息的「排队消息」。
      const staleQueueItemIds = await snaps.resolveStaleQueueItemIds(sessionId, cutSeq)
      return { ok: true, count: result.count, cutSeq, staleQueueItemIds }
    },

    // 设置页排障：最近错误（Host 侧 console.error 的页面可见副本）。
    // M1-D3/D5：条目自带 count/kind（recordError 富集）——count 在服务端
    // 拼成「（×N）」展示文本，设置页按 message 渲染即显示重复计数，零
    // Client 改动；hint 是分类后的可行动提示（API 自描述，本次无客户端
    // 消费，设置页未来展示零成本）。storeBase（M2-D3）暴露快照存储根，
    // 供设置页未来展示「快照存在哪里」，失败为 null。
    'status': async (args: StatusArgs): Promise<StatusResponse> => {
      const storeBase = await rt.resolveHomeContainer()
      if (args && args.op === 'clear') {
        state.errors.length = 0
        return { ok: true, errors: [], storeBase }
      }
      const errors = state.errors.slice(-20).reverse().map((e: ErrorRecord) => ({
        ...e,
        message: e.message + (e.count > 1 ? '（×' + e.count + '）' : ''),
        hint: e.kind ? ENV_HINTS[e.kind] : null
      }))
      return { ok: true, errors, storeBase }
    },

    // F1：client fork 成功后上报撤回链（childId ↔ parentId），Host 持久化到
    // lineage.json 供快照管理树聚族展示「版本家族」。root 优先按 fork 源
    // parentId 解析（fork 时它仍是 live 会话；归档只隐藏列表、对象在内存），
    // 失败回退 childId。
    'lineage-record': async (args: LineageRecordArgs): Promise<LineageRecordResponse> => {
      const childId = args && args.childId ? String(args.childId) : ''
      const parentId = args && args.parentId ? String(args.parentId) : ''
      if (!childId || !parentId) return { ok: false, code: E.RECALL_BAD_TYPE, message: '缺少会话 ID' }
      const root = (await rt.resolveRoot(parentId)) || (await rt.resolveRoot(childId))
      if (!root) return { ok: false, code: E.RECALL_NO_ROOT, message: '无法解析工作区' }
      let store: StoreInfo | null = state.stores.get(root) || null
      if (!store) {
        // 现场解析失败按无 store：下行 NO_STORE 响应
        try { store = await rt.resolveStore(root) } catch (error) { store = null }
      }
      if (!store) return { ok: false, code: E.RECALL_NO_STORE, message: '快照存储不可用' }
      await snaps.recordLineage(root, childId, parentId)
      return { ok: true }
    }
  }
}
