/**
 * runGcAll 的磁盘覆盖与空仓回收单测（M3，issue #18 收尾）
 *
 * 钉住两件事：
 * 1. store 全集 = 内存缓存 ∪ 磁盘枚举（dumpStores）——会话已删、内存里没有的
 *    残骸仓库此前完全不被 gc 覆盖，而那些正是 GB 级残留；
 * 2. 只有「明确没有被引用的空仓」才整目录删除：index.json 明确为空数组、
 *    无 snap-* tag、内存无对应快照，三条全中才删（不可逆操作，宁可不删）。
 */

import { describe, it, expect } from 'vitest'
import { createMaintenance } from '../../src/host/maintenance.js'

const GIT = 'git-exe'

function setup(opts = {}) {
  const state = {
    snapshots: new Map(),
    stores: new Map(),
    gitExe: GIT,
    gcLastAt: new Map(),
    gcCount: new Map(),
    indexLoaded: new Set(),
  }
  const calls = []
  const errors = []
  const S = {
    stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
    gcScript: (store) => 'GC ' + store.git,
    listTagsScript: (store) => 'TAGS ' + store.git,
    purgeTagsScript: (store) => 'PURGE ' + store.git,
    legacyRmScript: (dir) => 'RM ' + dir,
  }
  const rt = {
    state,
    scripts: S,
    // 磁盘目录包装：与 store.ts storeFromDir 同形状（git = <dir>/git/.git）
    storeFromDir: (dir, home) => ({
      dir, home: Boolean(home), repo: dir + '/git', git: dir + '/git/.git',
      excludeFile: dir + '/exclude.txt', maxFileBytes: 104857600,
    }),
    runShell: async (cmd) => {
      calls.push(cmd)
      return opts.reply ? opts.reply(cmd) : ''
    },
    recordError: (t) => errors.push(t),
    resolveRoot: async () => null,
    resolveStore: async () => null,
  }
  const ctx = { sessions: { get: () => null }, get: () => null }
  const config = { gcSnaps: 50, gcHours: 24, maxSnapshotsPerWorkspace: 0, retentionDays: 0, baseExcludes: [] }
  return { state, calls, errors, ctx, rt, config }
}

const dump = (list) => async () => new Map(list.map(([dir, info]) => [dir, { dir, root: null, entries: null, lineage: null, ...info }]))

describe('M3-1 runGcAll 覆盖磁盘枚举的 store', () => {
  it('内存为空但磁盘有 store：照样 gc（此前这类残骸永远不被覆盖）', async () => {
    const { state, calls, ctx, rt, config } = setup()
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, {
      dumpStores: dump([['D1', { root: 'R1', entries: [{ id: 'm1' }] }]]),
    })
    await maint.runGcAll()
    expect(calls).toContain('GC D1/git/.git')
    expect(state.gcLastAt.get('D1/git/.git')).toBeGreaterThan(0)
  })

  it('内存与磁盘指同一仓库时按 git-dir 去重（不重复 gc）', async () => {
    const { state, calls, ctx, rt, config } = setup()
    state.stores.set('R1', { dir: 'D1', git: 'D1/git/.git', repo: 'D1/git', home: true, excludeFile: 'E1', maxFileBytes: 1 })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, {
      dumpStores: dump([['D1', { root: 'R1', entries: [{ id: 'm1' }] }]]),
    })
    await maint.runGcAll()
    expect(calls.filter((c) => c === 'GC D1/git/.git').length).toBe(1)
  })

  it('未注入 dumpStores（旧调用形态）时退化为内存缓存，行为与迁移前一致', async () => {
    const { state, calls, ctx, rt, config } = setup()
    state.stores.set('R1', { dir: 'D1', git: 'D1/git/.git', repo: 'D1/git', home: true, excludeFile: 'E1', maxFileBytes: 1 })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config)
    await maint.runGcAll()
    expect(calls).toContain('GC D1/git/.git')
    expect(calls.some((c) => c.startsWith('RM '))).toBe(false)
    expect(state.gcLastAt.get('D1/git/.git')).toBeGreaterThan(0)
  })

  it('dump 抛错只记错误、不阻断后续维护（best-effort）', async () => {
    const { state, calls, errors, ctx, rt, config } = setup()
    state.stores.set('R1', { dir: 'D1', git: 'D1/git/.git', repo: 'D1/git', home: true, excludeFile: 'E1', maxFileBytes: 1 })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, {
      dumpStores: async () => { throw new Error('dump boom') },
    })
    await maint.runGcAll()
    expect(calls).toContain('GC D1/git/.git')
    expect(errors.some((e) => e.includes('disk store dump failed'))).toBe(true)
  })
})

describe('M3-2 空仓目录回收', () => {
  const emptyStore = { root: 'R1', entries: [] }

  it('index 明确为空 + 无 tag + 内存无快照 → 整目录删除并摘除内存缓存', async () => {
    const { state, calls, ctx, rt, config } = setup()
    state.stores.set('R1', { dir: 'D1', git: 'D1/git/.git', repo: 'D1/git', home: true, excludeFile: 'E1', maxFileBytes: 1 })
    state.gcLastAt.set('D1/git/.git', 1)
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, { dumpStores: dump([['D1', emptyStore]]) })
    await maint.runGcAll()
    expect(calls).toContain('RM D1')
    expect(calls.indexOf('RM D1')).toBeGreaterThan(calls.indexOf('GC D1/git/.git'))  // 先 gc 后删目录
    expect(state.stores.has('R1')).toBe(false)
    expect(state.gcLastAt.has('D1/git/.git')).toBe(false)
  })

  it('有 index 条目（有快照记录）→ 不删', async () => {
    const { calls, ctx, rt, config } = setup()
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, {
      dumpStores: dump([['D1', { root: 'R1', entries: [{ id: 'm1' }] }]]),
    })
    await maint.runGcAll()
    expect(calls.some((c) => c.startsWith('RM '))).toBe(false)
  })

  it('entries 为 null（索引缺失或损坏隔离现场）→ 不删', async () => {
    const { calls, ctx, rt, config } = setup()
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, {
      dumpStores: dump([['D1', { root: 'R1', entries: null }]]),
    })
    await maint.runGcAll()
    expect(calls.some((c) => c.startsWith('RM '))).toBe(false)
  })

  it('磁盘仍有 snap-* tag → 不删（以磁盘真值二次确认）', async () => {
    const { calls, ctx, rt, config } = setup({ reply: (cmd) => (cmd.startsWith('TAGS ') ? 'snap-m1\n' : '') })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, { dumpStores: dump([['D1', emptyStore]]) })
    await maint.runGcAll()
    expect(calls.some((c) => c.startsWith('RM '))).toBe(false)
  })

  it('内存里还有该 root 的快照 → 不删（防索引失步时误删）', async () => {
    const { state, calls, ctx, rt, config } = setup()
    state.stores.set('R1', { dir: 'D1', git: 'D1/git/.git', repo: 'D1/git', home: true, excludeFile: 'E1', maxFileBytes: 1 })
    state.snapshots.set('m1', { root: 'R1', time: 1, sessionId: 's1' })
    const maint = createMaintenance(ctx, rt, { saveIndex: async () => {} }, config, { dumpStores: dump([['D1', emptyStore]]) })
    await maint.runGcAll()
    expect(calls.some((c) => c.startsWith('RM '))).toBe(false)
  })
})
