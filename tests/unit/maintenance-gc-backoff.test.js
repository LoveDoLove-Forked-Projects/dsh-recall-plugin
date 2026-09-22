/**
 * runGc / runGcAll 失败退避单测
 *
 * 钉住「gc 失败只回拨退避窗口（GC_RETRY_BACKOFF_MS），不推进完整 gcHours
 * 周期」：失败推进整天周期会让对象库滚雪球（实测数 GB loose、in-pack 恒 0），
 * 失败必须在退避窗口后自动重试；成功维持原有「推进到此刻」语义。
 */

import { describe, it, expect } from 'vitest'
import { createMaintenance } from '../../src/host/maintenance.js'

const HOUR = 3600000
const BACKOFF = 1800000

function setup(runShellImpl) {
  const state = {
    snapshots: new Map(),
    stores: new Map([['R1', { git: 'G1', dir: 'D1', excludeFile: 'E1', home: true, root: 'R1' }]]),
    gitExe: 'git-exe',
    gcLastAt: new Map(),
    gcCount: new Map(),
  }
  const errors = []
  const S = { gcScript: () => 'GC', purgeTagsScript: () => 'PURGE' }
  const rt = {
    state,
    scripts: S,
    resolveRoot: async () => 'R1',
    resolveStore: async (root) => state.stores.get(root),
    runShell: runShellImpl,
    recordError: (t) => { errors.push(t) },
  }
  const ctx = { sessions: { get: () => null }, get: () => null }
  const config = { gcSnaps: 50, gcHours: 24, maxSnapshotsPerWorkspace: 0, retentionDays: 0, baseExcludes: [] }
  return { state, errors, ctx, rt, config }
}

describe('runGc 失败退避', () => {
  it('失败：gcLastAt 回拨到「此刻 − gcHours + 退避」（退避窗口后重试，不推进整天）', async () => {
    const { state, errors, ctx, rt, config } = setup(async () => { throw new Error('gc timeout') })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config)
    const before = Date.now()
    await maint.runGc('S1', true)
    const last = state.gcLastAt.get('G1')
    expect(last).toBeGreaterThanOrEqual(before - 24 * HOUR + BACKOFF - 5000)
    expect(last).toBeLessThanOrEqual(Date.now() - 24 * HOUR + BACKOFF + 5000)
    // 失败距下次可重试 ≈ 退避窗口（约 30 分钟），而非整 gcHours 周期
    const untilRetry = last + 24 * HOUR - Date.now()
    expect(untilRetry).toBeGreaterThan(BACKOFF - 60000)
    expect(untilRetry).toBeLessThan(BACKOFF + 60000)
    expect(errors.some((e) => e.includes('recall maintenance failed'))).toBe(true)
  })

  it('成功：gcLastAt 推进到此刻（原有语义不变）', async () => {
    const { state, ctx, rt, config } = setup(async () => '')
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config)
    const before = Date.now()
    await maint.runGc('S1', true)
    expect(state.gcLastAt.get('G1')).toBeGreaterThanOrEqual(before)
  })

  it('force=false 且未过阈值：不触发、gcLastAt 不被改写', async () => {
    let ran = 0
    const { state, ctx, rt, config } = setup(async () => { ran++; return '' })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config)
    const prior = Date.now() - 60000
    state.gcLastAt.set('G1', prior)
    await maint.runGc('S1', false)
    expect(ran).toBe(0)
    expect(state.gcLastAt.get('G1')).toBe(prior)
  })
})

describe('runGcAll 失败退避', () => {
  it('单 store 失败走退避、成功推进此刻（互不影响）', async () => {
    const { state, ctx, rt, config, errors } = setup(async () => '')
    state.stores.set('R2', { git: 'G2', dir: 'D2', excludeFile: 'E2', home: true, root: 'R2' })
    rt.scripts = { gcScript: (store) => (store.git === 'G2' ? 'GC-FAIL' : 'GC'), purgeTagsScript: () => 'PURGE' }
    rt.runShell = async (cmd) => { if (cmd === 'GC-FAIL') throw new Error('gc failed'); return '' }
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config)
    const before = Date.now()
    await maint.runGcAll()
    expect(state.gcLastAt.get('G1')).toBeGreaterThanOrEqual(before)
    const last2 = state.gcLastAt.get('G2')
    expect(last2).toBeLessThan(before - 24 * HOUR + BACKOFF + 5000)
    expect(errors.some((e) => e.includes('G2'))).toBe(true)
  })
})
