/**
 * issue #29 工厂级测试：预算扫描失败（SNAP_SCAN_FAIL）不再放行快照。
 *
 * 钉住三条行为：
 * - 失败 → 不写快照条目、写 failed/scanFail 反馈、原因进「最近错误」；
 * - 失败后该工作区进入 sticky 停用：下一条消息不再重跑脚本（省掉一次全量扫描）；
 * - SNAP_LIMIT（超限）与 SNAP_SCAN_FAIL 两个哨兵互不误判。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots } from '../../src/host/snapshots.js'

const ROOT = 'D:/ws'
const SID = 'session-1'

function fakeState() {
  return {
    snapshots: new Map(),
    snapFeedback: new Map(),
    indexLoaded: new Set(),
    indexHealthy: new Set(),
    indexTruncated: new Set(),
    stores: new Map(),
    roots: new Map(),
    cutSeqCache: new Map(),
    gcLastAt: new Map(),
    gcCount: new Map(),
    gitExe: 'git-exe',
  }
}

const STORE = {
  dir: '/store',
  repo: '/store/git',
  git: '/store/git/.git',
  home: true,
  excludeFile: '/store/exclude.txt',
  maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456,
  scanBudgetMs: 10000,
}

// snapshotScript 用哨兵字符串回放脚本输出；format marker 回 '1' 让 A3 守卫放行
function fakeRt(state, snapshotOut) {
  const errors = []
  let snapshotRuns = 0
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    snapshotScript: () => 'SNAPCMD',
    indexReadCmd: (dir) => 'READ ' + dir,
    fileReadCmd: (f) => 'FMT ' + f,
    pruneScript: () => 'PRUNE',
  }
  return {
    state,
    isWin: false,
    scripts: S,
    errors,
    snapshotRuns: () => snapshotRuns,
    runShell: async (cmd) => {
      if (String(cmd) === 'SNAPCMD') { snapshotRuns++; return snapshotOut }
      if (String(cmd).indexOf('FMT ') === 0) return '1'
      return ''
    },
    runShellMeta: async () => ({ text: '', truncated: false }),
    writeTextViaShell: async () => {},
    recordError: (text) => errors.push(String(text)),
    resolveRoot: async () => ROOT,
    resolveStore: async () => STORE,
    tryUpgradeToHome: async () => STORE,
    ensureGit: async () => ({ ok: true }),
    resolveGit: async () => 'git-exe',
  }
}

const CFG = { baseExcludes: [], maxWorkspaceBytes: 268435456, scanBudgetMs: 10000, snapshotBudgetMs: 180000 }

describe('captureSnapshot：扫描失败（issue #29）', () => {
  it('不写快照条目，反馈 kind=scanFail，stderr 进最近错误', async () => {
    const state = fakeState()
    const rt = fakeRt(state, 'SNAP_SCAN_FAIL 128\nSNAP_SCAN_ERR fatal: index file smaller than expected')
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, CFG)
    state.stores.set(ROOT, STORE)

    await snaps.captureSnapshot(SID, 'm1')

    expect(state.snapshots.has('m1')).toBe(false)
    const fb = state.snapFeedback.get('m1')
    expect(fb && fb.failed).toBe(true)
    expect(fb && fb.kind).toBe('scanFail')
    expect(fb && fb.error).toContain('128')
    expect(rt.errors.some((t) => t.includes('scan failed') && t.includes('index file smaller'))).toBe(true)
  })

  it('失败后 sticky 停用：下一条消息不再跑快照脚本', async () => {
    const state = fakeState()
    const rt = fakeRt(state, 'SNAP_SCAN_FAIL 128\nSNAP_SCAN_ERR fatal: boom')
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, CFG)
    state.stores.set(ROOT, STORE)

    await snaps.captureSnapshot(SID, 'm1')
    await snaps.captureSnapshot(SID, 'm2')

    expect(rt.snapshotRuns()).toBe(1)
    expect(state.snapFeedback.has('m2')).toBe(false)
  })

  it('SNAP_LIMIT 仍走 workspaceLimit（两个哨兵互不误判）', async () => {
    const state = fakeState()
    const rt = fakeRt(state, 'SNAP_LIMIT bytes 1000 100')
    const snaps = createSnapshots({ sessions: { get: () => null } }, rt, CFG)
    state.stores.set(ROOT, STORE)

    await snaps.captureSnapshot(SID, 'm1')

    const fb = state.snapFeedback.get('m1')
    expect(fb && fb.kind).toBe('workspaceLimit')
  })
})
