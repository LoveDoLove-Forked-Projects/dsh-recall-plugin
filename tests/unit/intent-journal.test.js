/**
 * A2 操作意图 journal 单测
 *
 * 三针往返（begin/advance/clear）+ recover 判定矩阵：无记录/读取失败空操作、
 * 幂等判定一致只清不 reset（stale journal 防线——回退已完成但 clear 失败）、
 * 需救援各分支（safety 缺失 / agentBusy 延后 / reset 失败）与双挂载点去重；
 * 原子写损坏与形状不符按无处理；写失败只告警不抛（U4 纪律）。
 */

import { describe, it, expect } from 'vitest'
import { createIntentJournal } from '../../src/host/intent-journal.js'

const STORE = { dir: '/store', git: '/store/git/.git' }
const FILE = '/store/recall-intent.json'

function makeFixture(opts = {}) {
  const files = new Map()
  const errors = []
  const calls = { read: 0, reset: 0, lastTag: null }
  const deps = {
    runShell: async (cmd) => {
      const c = String(cmd)
      if (c.startsWith('CAT ')) {
        calls.read++
        if (opts.readThrows) throw new Error('shell not ready')
        return files.get(c.slice(4)) ?? ''
      }
      return ''
    },
    writeTextViaShell: async (file, text) => {
      if (opts.writeThrows) throw new Error('disk full')
      files.set(String(file), String(text))
    },
    scripts: {
      stripBom: (t) => String(t == null ? '' : t).replace(/^\uFEFF/, ''),
      fileReadCmd: (f) => 'CAT ' + f,
      rescueScript: () => 'unused',
    },
    isWin: false,
    recordError: (m) => errors.push(String(m)),
    workspaceMatchesTag: async () => Boolean(opts.matches),
    resetToSafety: async (store, safetyId) => {
      calls.reset++
      calls.lastTag = 'snap-' + safetyId
      return opts.resetOk !== false
    },
    agentBusy: () => Boolean(opts.busy),
  }
  const journal = createIntentJournal(deps)
  return { journal, files, errors, calls, opts }
}

function seed(files, patch = {}) {
  files.set(FILE, JSON.stringify({
    v: 1, op: 'execute', messageId: 'm1', root: 'D:/ws',
    safetyId: 'pre-rollback-1', safetyOk: true, phase: 'rollback', time: 1000,
    ...patch,
  }))
}

describe('三针往返（begin/advance/clear）', () => {
  it('begin 落盘完整形状（v/op/messageId/phase=rollback）', async () => {
    const { journal, files } = makeFixture()
    await journal.begin(STORE, 'D:/ws', { messageId: 'm1', safetyId: 'pre-rollback-1', safetyOk: true })

    const rec = JSON.parse(files.get(FILE))
    expect(rec.v).toBe(1)
    expect(rec.op).toBe('execute')
    expect(rec.messageId).toBe('m1')
    expect(rec.root).toBe('D:/ws')
    expect(rec.safetyId).toBe('pre-rollback-1')
    expect(rec.safetyOk).toBe(true)
    expect(rec.phase).toBe('rollback')
    expect(typeof rec.time).toBe('number')
  })

  it('read 往返：begin → read 得到记录；advance 推进 phase；clear 后读回 null', async () => {
    const { journal } = makeFixture()
    await journal.begin(STORE, 'D:/ws', { messageId: 'm1', safetyId: 'pre-rollback-1', safetyOk: true })
    expect((await journal.read(STORE)).phase).toBe('rollback')

    await journal.advance(STORE, 'rescue')
    expect((await journal.read(STORE)).phase).toBe('rescue')

    await journal.clear(STORE)
    expect(await journal.read(STORE)).toBe(null)
  })

  it('advance 无记录时不凭空造记录（begin 写失败/已清空场景）', async () => {
    const { journal, files } = makeFixture()
    await journal.advance(STORE, 'rescue')

    expect(files.has(FILE)).toBe(false)
  })

  it('写失败只告警不抛（U4 纪律：不阻断 execute 主流程）', async () => {
    const { journal, errors } = makeFixture({ writeThrows: true })
    await journal.begin(STORE, 'D:/ws', { messageId: 'm1', safetyId: 'pre-rollback-1', safetyOk: true })

    expect(errors.some((e) => e.indexOf('intent journal write failed') >= 0)).toBe(true)
  })

  it('read：损坏 JSON / 形状不符按无处理（fail-open 于读取侧）', async () => {
    const { journal, files } = makeFixture()
    files.set(FILE, '{broken')
    expect(await journal.read(STORE)).toBe(null)
    seed(files, { safetyId: '' })
    expect(await journal.read(STORE)).toBe(null)
    seed(files, { v: 2 })
    expect(await journal.read(STORE)).toBe(null)
  })
})

describe('recover 判定矩阵', () => {
  it('无记录 → 空操作（不 reset、不告警）', async () => {
    const { journal, calls, errors } = makeFixture()
    expect(await journal.recover(STORE)).toBe(false)
    expect(calls.reset).toBe(0)
    expect(errors.length).toBe(0)
  })

  it('读取失败 → 不判定也不去重（下次 init 重试）', async () => {
    const { journal, calls } = makeFixture({ readThrows: true })
    expect(await journal.recover(STORE)).toBe(false)
    const first = calls.read
    await journal.recover(STORE)
    expect(calls.read).toBeGreaterThan(first) // 未被 handled 去重挡住
  })

  it('幂等判定一致（回退实际已完成）→ 只清记录、不 reset', async () => {
    const { journal, files, calls, errors } = makeFixture({ matches: true })
    seed(files)

    expect(await journal.recover(STORE)).toBe(true)

    expect(calls.reset).toBe(0)
    expect(await journal.read(STORE)).toBe(null)
    expect(errors.length).toBe(0)
  })

  it('需救援且闲 → reset 到安全快照 + clear + 告警（含 phase 与 safety）', async () => {
    const { journal, files, calls, errors } = makeFixture()
    seed(files, { phase: 'rescue' })

    expect(await journal.recover(STORE)).toBe(true)

    expect(calls.reset).toBe(1)
    expect(calls.lastTag).toBe('snap-pre-rollback-1')
    expect(await journal.read(STORE)).toBe(null)
    const msg = errors.find((e) => e.indexOf('recovered interrupted rollback') >= 0)
    expect(msg).toContain('phase=rescue')
    expect(msg).toContain('snap-pre-rollback-1')
  })

  it('需救援但 agentBusy → 延后（不 reset 不清记录，告警 deferred，下次 init 重试）', async () => {
    const f = makeFixture({ busy: true })
    seed(f.files)

    expect(await f.journal.recover(STORE)).toBe(false)

    expect(f.calls.reset).toBe(0)
    expect(await f.journal.read(STORE)).not.toBe(null) // 记录保留
    expect(f.errors.some((e) => e.indexOf('deferred') >= 0)).toBe(true)
    // 非去重：忙结束后可重试并完成救援
    f.opts.busy = false
    expect(await f.journal.recover(STORE)).toBe(true)
    expect(f.calls.reset).toBe(1)
  })

  it('safetyOk=false（无救援点）→ 保留记录 + fail-loud 告警', async () => {
    const { journal, files, calls, errors } = makeFixture()
    seed(files, { safetyOk: false })

    expect(await journal.recover(STORE)).toBe(true)

    expect(calls.reset).toBe(0)
    expect(await journal.read(STORE)).not.toBe(null) // 记录保留（下次启动重试）
    expect(errors.some((e) => e.indexOf('no safety snapshot') >= 0)).toBe(true)
  })

  it('reset 失败 → 保留记录 + 告警（不静默）', async () => {
    const { journal, files, calls, errors } = makeFixture({ resetOk: false })
    seed(files)

    expect(await journal.recover(STORE)).toBe(true)

    expect(calls.reset).toBe(1)
    expect(await journal.read(STORE)).not.toBe(null)
    expect(errors.some((e) => e.indexOf('rescue failed') >= 0)).toBe(true)
  })

  it('双挂载点去重：定论后再次 recover 直接跳过（零额外读取）', async () => {
    const { journal, files, calls } = makeFixture()
    seed(files)
    await journal.recover(STORE)
    const afterFirst = calls.read

    expect(await journal.recover(STORE)).toBe(false)
    expect(calls.read).toBe(afterFirst)
  })

  it('file() 给出记录路径（U4：提示里附路径用）', () => {
    const { journal } = makeFixture()
    expect(journal.file(STORE)).toBe(FILE)
  })
})