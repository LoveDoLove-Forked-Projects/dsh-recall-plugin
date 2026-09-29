/**
 * A3 磁盘格式版本守卫单测
 *
 * judgeStoreFormat 纯逻辑钉五分支矩阵（缺席 / 1 / 2 / garbage / 不可读）；
 * 工厂级钉挂载行为：拒写放行读、补戳只在缺席时发生、拒写不缓存（修正 marker
 * 后立即恢复）、确认缓存让稳态零额外进程。execute 端点回 FORMAT_BLOCKED
 * （撤回属写链：安全快照 + 工作区 reset）。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots, judgeStoreFormat } from '../../src/host/snapshots.js'
import { createRoutesCore } from '../../src/host/routes-core.js'
import * as E from '../../src/host/errors.js'

const ROOT = 'D:/ws'
const SID = 'session-1'
const SUPPORTED = 1

describe('judgeStoreFormat（五分支 × 读写放行矩阵）', () => {
  it('缺席（空串/空白/undefined）视为 v1 → 放行，reason=absent', () => {
    for (const raw of ['', '   ', '\r\n', undefined]) {
      const v = judgeStoreFormat(raw, SUPPORTED)
      expect(v.ok, JSON.stringify(raw)).toBe(true)
      expect(v.v).toBe(1)
      expect(v.reason).toBe('absent')
    }
  })

  it('合法版本号：等于支持版本放行（带空白/BOM 已由 stripBom+trim 归一）', () => {
    for (const raw of ['1', ' 1 ', '1\n']) {
      const v = judgeStoreFormat(raw, SUPPORTED)
      expect(v.ok, JSON.stringify(raw)).toBe(true)
      expect(v.v).toBe(1)
      expect(v.reason).toBe('ok')
    }
  })

  it('高版本（2 / 99）→ 拒写，v 原样回传（文案要报出读到几）', () => {
    expect(judgeStoreFormat('2', SUPPORTED)).toEqual({ ok: false, v: 2, reason: 'future' })
    expect(judgeStoreFormat('99', SUPPORTED)).toEqual({ ok: false, v: 99, reason: 'future' })
  })

  it('非整数内容（garbage / 0 / 负数 / 小数）→ 拒写，reason=corrupt', () => {
    for (const raw of ['abc', '1.5', '-1', '0', 'v1', '１２３']) {
      const v = judgeStoreFormat(raw, SUPPORTED)
      expect(v.ok, JSON.stringify(raw)).toBe(false)
      expect(v.reason).toBe('corrupt')
      expect(v.v).toBe(null)
    }
  })

  it('读取失败（raw 传 null）→ 拒写，reason=unreadable（与损坏区分，文案不同）', () => {
    expect(judgeStoreFormat(null, SUPPORTED)).toEqual({ ok: false, v: null, reason: 'unreadable' })
  })
})

function fakeState() {
  return {
    snapshots: new Map(),
    snapFeedback: new Map(),
    indexLoaded: new Set(),
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    stores: new Map(),
    cutSeqCache: new Map(),
    gcLastAt: new Map(),
    gcCount: new Map(),
  }
}

// 假 rt：marker 内容由 opts.marker 控制（可运行时改，验证「拒写不缓存」）；
// writes 捕获 writeTextViaShell（索引与 format 补戳）；reads 计 marker/快照
// 脚本的调用数（缓存与短路断言依赖它）。
function makeRt(state, opts = {}) {
  const writes = []
  const errors = []
  const reads = { marker: 0, snap: 0 }
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    fileReadCmd: (f) => 'FMT ' + f,
    indexReadCmd: (dir) => 'IDX ' + dir,
    snapshotScript: () => 'SNAP',
  }
  const rt = {
    state,
    isWin: false,
    scripts: S,
    writes,
    errors,
    reads,
    recordError: (m) => errors.push(String(m)),
    writeTextViaShell: async (file, text) => { writes.push({ file: String(file), text: String(text) }) },
    runShell: async (cmd) => {
      const c = String(cmd)
      if (c.startsWith('FMT ')) {
        reads.marker++
        if (opts.markerThrows) throw new Error('shell not ready')
        return opts.marker === undefined ? '' : String(opts.marker)
      }
      if (c === 'SNAP') { reads.snap++; return 'SNAP_OK' }
      if (c.startsWith('IDX ')) return opts.index === undefined ? '' : String(opts.index)
      return ''
    },
    runShellMeta: async (cmd) => ({ text: await rt.runShell(cmd), truncated: false }),
    resolveRoot: async () => ROOT,
    // 复刻生产语义：resolveStore 写缓存 → tryUpgradeToHome 从缓存读回
    resolveStore: async (root) => {
      const s = { dir: '/store', git: '/store/git/.git' }
      state.stores.set(root, s)
      return s
    },
    tryUpgradeToHome: async (root) => state.stores.get(root),
    ensureGit: async () => ({ ok: true }),
  }
  return rt
}

function storeWrites(rt) {
  return rt.writes.map((w) => w.file)
}

// 直调 saveIndex/loadIndex/recordLineage 的用例先播种 store 缓存（生产由
// resolveStore 播种；缺 store 时这些入口按既有语义直接早退，测不到守卫）
function withStore(state, root = ROOT) {
  state.stores.set(root, { dir: '/store', git: '/store/git/.git' })
}

describe('A3 工厂级：拒写放行读 + 补戳 + 缓存', () => {
  it('marker 缺席：saveIndex 放行、补戳写 format=1、索引照常落盘', async () => {
    const state = fakeState()
    const rt = makeRt(state)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)
    state.snapshots.set('m1', { root: ROOT, time: 1, sessionId: SID })

    await snaps.saveIndex(ROOT, SID)

    const files = storeWrites(rt)
    expect(files.some((f) => f.endsWith('format'))).toBe(true)
    expect(rt.writes.find((w) => w.file.endsWith('format')).text).toBe('1')
    expect(files.some((f) => f.endsWith('index.json'))).toBe(true)
  })

  it('marker=2：saveIndex 整体短路（不写 format 也不写 index）+ 节流告警', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: '2' })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)
    state.snapshots.set('m1', { root: ROOT, time: 1, sessionId: SID })

    await snaps.saveIndex(ROOT, SID)

    expect(rt.writes.length).toBe(0)
    expect(rt.errors.some((e) => e.indexOf('recall store format blocked') >= 0 && e.indexOf('v2') >= 0)).toBe(true)
    // 节流：第二次 saveIndex 不再重复告警（5min 窗口内一条）
    await snaps.saveIndex(ROOT, SID)
    expect(rt.errors.filter((e) => e.indexOf('blocked') >= 0).length).toBe(1)
  })

  it('读失败（marker 命令抛错）→ 拒写 + 「读不到」告警（措辞不得指认文件损坏）', async () => {
    const state = fakeState()
    const rt = makeRt(state, { markerThrows: true })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.saveIndex(ROOT, SID)

    expect(rt.writes.length).toBe(0)
    const msg = rt.errors.find((e) => e.indexOf('blocked') >= 0) || ''
    expect(msg).toContain('读不到')
    // 三分文案的判据：读失败多为宿主启动早期环境未就绪（实弹：headless 预热期
    // shell/subprocess 不可用），说成「标记内容非法」会把用户引向一个没问题的
    // 文件；因此这条必须与损坏文案（corrupt 分支）明确区分
    expect(msg).not.toContain('内容非法')
    expect(msg).toContain('自动重试')
  })

  it('marker 内容非法：saveIndex 拒写 + 「内容非法」告警（指认文件，可行动）', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: 'garbage' })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.saveIndex(ROOT, SID)

    expect(rt.writes.length).toBe(0)
    const msg = rt.errors.find((e) => e.indexOf('blocked') >= 0) || ''
    expect(msg).toContain('内容非法')
    expect(msg).toContain('format 文件')
  })

  it('拒写不缓存：marker 改回 1 后立即恢复（不等 TTL）', async () => {
    const state = fakeState()
    const opts = { marker: '2' }
    const rt = makeRt(state, opts)
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.saveIndex(ROOT, SID)
    expect(rt.writes.length).toBe(0)

    opts.marker = '1'
    await snaps.saveIndex(ROOT, SID)
    expect(rt.writes.some((w) => w.file.endsWith('index.json'))).toBe(true)
  })

  it('确认缓存：marker=1 连续两次 saveIndex 只读一次 marker（稳态零额外进程）', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: '1' })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.saveIndex(ROOT, SID)
    await snaps.saveIndex(ROOT, SID)

    expect(rt.reads.marker).toBe(1)
    // 已确认在场 → 不补戳
    expect(rt.writes.filter((w) => w.file.endsWith('format')).length).toBe(0)
  })

  it('captureSnapshot：marker=2 时不跑快照脚本、不写内存索引', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: '2' })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })

    await snaps.captureSnapshot(SID, 'm1', 1000)

    expect(rt.reads.snap).toBe(0)
    expect(state.snapshots.size).toBe(0)
    expect(rt.errors.some((e) => e.indexOf('blocked') >= 0)).toBe(true)
  })

  it('loadIndex：marker=2 时不载入（隔离改名是写操作也一并免掉）', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: '2', index: JSON.stringify([{ id: 'm1', time: 1 }]) })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.loadIndex(ROOT, SID)

    expect(state.snapshots.size).toBe(0)
    expect(state.indexLoaded.has(ROOT)).toBe(false)
  })

  it('recordLineage：marker=2 时不写 lineage.json（纯增量数据静默跳过）', async () => {
    const state = fakeState()
    const rt = makeRt(state, { marker: '2' })
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, { baseExcludes: [] })
    withStore(state)

    await snaps.recordLineage(ROOT, 'child', 'parent')

    expect(rt.writes.some((w) => w.file.endsWith('lineage.json'))).toBe(false)
  })

  it('execute：守卫拒写 → FORMAT_BLOCKED 响应，且不跑安全快照/回退', async () => {
    const state = {
      snapshots: new Map([['m1', { root: ROOT, time: 1, sessionId: 's1' }]]),
      stores: new Map([[ROOT, { dir: '/store', git: '/store/git/.git' }]]),
      gitExe: 'git-exe',
    }
    const calls = { snap: 0, rollback: 0 }
    const deps = {
      rt: {
        state,
        recordError: () => {},
        runShell: async () => { calls.snap++; return 'SNAP_OK' },
        scripts: { snapshotScript: () => 'SNAP' },
      },
      snaps: {
        guardStoreFormat: async () => false,
        diffFor: async () => ({ changes: [], total: 0, truncated: false, treeId: null }),
        rollbackFor: async () => { calls.rollback++; return { ok: true, count: 0 } },
        resolveCutSeq: async () => null,
        resolveStaleQueueItemIds: async () => [],
      },
      // A2：意图 journal 桩（本文件只关心格式守卫的拒绝时机）
      intentJournal: {
        begin: async () => {}, advance: async () => {}, clear: async () => {},
        read: async () => null, file: () => '/store/recall-intent.json', recover: async () => false,
      },
      state,
      cfg: { baseExcludes: [] },
      supported: true,
      enqueue: (task) => task(),
      agentBusy: () => false,
      rescueRollback: async () => ({ ok: false, code: E.RECALL_ROLLBACK_FAILED, message: 'rescue' }),
      E,
    }
    const routes = createRoutesCore(deps)
    const res = await routes.execute({ messageId: 'm1' })

    expect(res.ok).toBe(false)
    expect(res.code).toBe(E.RECALL_FORMAT_BLOCKED)
    expect(calls.snap).toBe(0)
    expect(calls.rollback).toBe(0)
  })
})