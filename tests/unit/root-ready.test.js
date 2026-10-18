/**
 * issue #24 根就绪链单测：产物 root 早退、完整链调用序、in-flight 去重、失败不缓存。
 *
 * 为什么这些分支值得钉：预热与 init 端点共享同一条链，早退漏掉一处就会让
 * 「init 说停用、预热却在扫」（报告者 #24 指出的边角）；去重与失败重试的
 * 语义一旦回退，启动命令风暴会以「每条会话各跑一遍」的形式复活。
 */

import { describe, it, expect } from 'vitest'
import { createEnsureRootReady } from '../../src/host/root-ready.js'

const BASE = ['node_modules/', 'dist/', 'target/']

const STORE = {
  dir: '/store', repo: '/store/git', git: '/store/git/.git', home: true,
  excludeFile: '/store/exclude.txt', maxFileBytes: 8388608,
  maxWorkspaceBytes: 268435456, scanBudgetMs: 10000,
}

function makeDeps(opts = {}) {
  const calls = { resolveStore: 0, upgrade: 0, ensureGit: 0, loadIndex: 0, rebuild: 0, guard: 0, recover: 0, cleanup: 0 }
  const deps = {
    rt: {
      isWin: opts.isWin !== false,
      resolveStore: async () => {
        calls.resolveStore++
        if (opts.failFirstResolve && calls.resolveStore === 1) throw new Error('boom')
        return STORE
      },
      tryUpgradeToHome: async () => { calls.upgrade++; return STORE },
      ensureGit: async () => { calls.ensureGit++; return { ok: true } },
      cleanupLegacy: () => { calls.cleanup++ },
    },
    snaps: {
      loadIndex: async () => { calls.loadIndex++ },
      rebuildOrphans: async () => { calls.rebuild++ },
      guardStoreFormat: async () => { calls.guard++; return true },
    },
    journal: { recover: async () => { calls.recover++ } },
    cfg: { baseExcludes: BASE },
  }
  return { deps, calls }
}

describe('ensureRootReady（issue #24）', () => {
  it('产物 root 早退：零调用、返回 null（预热不为 dist/build 白跑）', async () => {
    const { deps, calls } = makeDeps()
    const ensure = createEnsureRootReady(deps)
    expect(await ensure('D:\\ws\\dist', null)).toBeNull()
    // 任一路径段命中即可（src-tauri/target/debug 的 target 在中间段）
    expect(await ensure('D:\\ws\\src-tauri\\target\\debug', null)).toBeNull()
    expect(calls).toEqual({
      resolveStore: 0, upgrade: 0, ensureGit: 0, loadIndex: 0, rebuild: 0, guard: 0, recover: 0, cleanup: 0,
    })
  })

  it('POSIX 大小写敏感：Dist 不命中 dist/（与 buildArtifactRootSegment 同判据）', async () => {
    const { deps, calls } = makeDeps({ isWin: false })
    const ensure = createEnsureRootReady(deps)
    expect(await ensure('/home/u/Dist', null)).toBe(STORE)
    expect(calls.resolveStore).toBe(1)
  })

  it('普通 root 走完整链并按序返回 store', async () => {
    const { deps, calls } = makeDeps()
    const ensure = createEnsureRootReady(deps)
    expect(await ensure('D:\\ws\\my-app', 'sid')).toBe(STORE)
    expect(calls).toEqual({
      resolveStore: 1, upgrade: 1, ensureGit: 1, loadIndex: 1, rebuild: 1, guard: 1, recover: 1, cleanup: 1,
    })
  })

  it('in-flight 去重：并发两次同 root 只跑一条链', async () => {
    const { deps, calls } = makeDeps()
    const ensure = createEnsureRootReady(deps)
    const [a, b] = await Promise.all([ensure('D:/ws/x', 's1'), ensure('D:/ws/x', 's2')])
    expect(a).toBe(STORE)
    expect(b).toBe(STORE)
    expect(calls.resolveStore).toBe(1)
    expect(calls.ensureGit).toBe(1)
  })

  it('失败不缓存：首次 reject 后第二次重跑（瞬态故障可自愈）', async () => {
    const { deps, calls } = makeDeps({ failFirstResolve: true })
    const ensure = createEnsureRootReady(deps)
    await expect(ensure('D:/ws/y', null)).rejects.toThrow('boom')
    expect(await ensure('D:/ws/y', null)).toBe(STORE)
    expect(calls.resolveStore).toBe(2)
  })
})
