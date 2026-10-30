/**
 * notify 端点单测（issue #19 撤回终态事件广播；工厂级，注入假 deps 不跑 git）
 *
 * 钉四件事：参数校验缺失码（复用 BAD_TYPE）、root enrich 成败（失败落 null
 * 不阻断）、emit 异步触发（queueMicrotask，端点应答先于事件）、监听器抛错
 * 仍恒 { ok: true }。事件名与 payload 形状的编译期绑定在 tests/types 钉。
 */

import { describe, it, expect } from 'vitest'
import { createRoutesCore, RECALL_EVENT_COMPLETE_HOST, RECALL_EVENT_FAILED_HOST } from '../../src/host/routes-core.js'
import * as E from '../../src/host/errors.js'

const ROOT = 'D:/ws'
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeDeps(opts = {}) {
  const events = []
  const errors = []
  const deps = {
    rt: {
      // resolveRoot 按 opts.rootFail 注入失败形态：抛错 / 返空 / 正常
      resolveRoot: async () => {
        if (opts.rootThrow) throw new Error('resolveRoot boom')
        return opts.rootNull ? null : ROOT
      },
      recordError: (m) => errors.push(String(m)),
    },
    snaps: {}, state: { snapshots: new Map(), stores: new Map(), errors: [] },
    cfg: { baseExcludes: [] }, supported: true,
    enqueueFor: (_root, task) => task(), enqueueMany: (_roots, task) => task(), agentBusy: () => false,
    rescueRollback: async () => ({ ok: false, code: E.RECALL_ROLLBACK_FAILED, message: 'x' }),
    E,
    // emitEvent 桩：opts.emitThrow 时同步抛（模拟下游广播层故障）
    emitEvent: (event, payload) => {
      if (opts.emitThrow) throw new Error('emit boom')
      events.push({ event, payload })
    },
  }
  return { deps, events, errors }
}

describe('notify：参数校验（缺失复用 RECALL_BAD_TYPE，不发事件）', () => {
  const badCases = [
    ['缺 status', { sessionId: 's1', messageId: 'm1' }],
    ['status 非法', { status: 'ok', sessionId: 's1', messageId: 'm1' }],
    ['缺 sessionId', { status: 'complete', messageId: 'm1' }],
    ['缺 messageId', { status: 'complete', sessionId: 's1' }],
    ['空对象', {}],
  ]
  for (const [name, args] of badCases) {
    it(name + ' → BAD_TYPE 且 emit 零调用', async () => {
      const { deps, events } = makeDeps()
      const routes = createRoutesCore(deps)
      const res = await routes.notify(args)
      expect(res.ok).toBe(false)
      expect(res.code).toBe(E.RECALL_BAD_TYPE)
      await flushMicrotasks()
      expect(events).toEqual([])
    })
  }
})

describe('notify：complete 上报 → enrich + 异步广播', () => {
  it('字段透传 + root enrich 成功 + version/time 由 host 补', async () => {
    const { deps, events } = makeDeps()
    const routes = createRoutesCore(deps)
    const res = await routes.notify({
      status: 'complete', sessionId: 's1', messageId: 'm1', scope: 'both',
      cutSeq: 7, childSessionId: 'child-1', count: 3,
      chatReverted: true, archiveRequested: true,
    })
    expect(res).toEqual({ ok: true })
    // 异步广播与端点应答的 microtask 顺序不构成可依赖契约（规格要的是
    // 「下游抛错不反噬调用栈」），故此处不断言 events 为空，只钉 flush 后
    // 恰好一条且字段正确
    await flushMicrotasks()
    expect(events.length).toBe(1)
    expect(events[0].event).toBe(RECALL_EVENT_COMPLETE_HOST)
    expect(events[0].event).toBe('dsh-recall/complete')
    const p = events[0].payload
    expect(p.version).toBe(1)
    expect(p.sessionId).toBe('s1')
    expect(p.childSessionId).toBe('child-1')
    expect(p.scope).toBe('both')
    expect(p.cutSeq).toBe(7)
    expect(p.messageId).toBe('m1')
    expect(p.root).toBe(ROOT)
    expect(p.count).toBe(3)
    expect(p.chatReverted).toBe(true)
    expect(p.archiveRequested).toBe(true)
    expect(typeof p.time).toBe('number')
  })

  it('resolveRoot 抛错 / 返空 → root 落 null，事件照发', async () => {
    for (const opts of [{ rootThrow: true }, { rootNull: true }]) {
      const { deps, events } = makeDeps(opts)
      const routes = createRoutesCore(deps)
      const res = await routes.notify({ status: 'complete', sessionId: 's1', messageId: 'm1' })
      expect(res).toEqual({ ok: true })
      await flushMicrotasks()
      expect(events.length).toBe(1)
      expect(events[0].payload.root).toBeNull()
      // 缺省字段兜底：childSessionId=null / count=0 / chatReverted=false
      expect(events[0].payload.childSessionId).toBeNull()
      expect(events[0].payload.count).toBe(0)
      expect(events[0].payload.chatReverted).toBe(false)
    }
  })
})

describe('notify：failed 上报 → stage/code/error 语义', () => {
  it('stage=execute + code 透传', async () => {
    const { deps, events } = makeDeps()
    const routes = createRoutesCore(deps)
    const res = await routes.notify({
      status: 'failed', stage: 'execute', sessionId: 's1', messageId: 'm1',
      scope: 'both', cutSeq: null, code: E.RECALL_AGENT_BUSY, error: 'Agent 正在运行中',
    })
    expect(res).toEqual({ ok: true })
    await flushMicrotasks()
    expect(events[0].event).toBe(RECALL_EVENT_FAILED_HOST)
    expect(events[0].event).toBe('dsh-recall/failed')
    expect(events[0].payload.stage).toBe('execute')
    expect(events[0].payload.code).toBe(E.RECALL_AGENT_BUSY)
    expect(events[0].payload.error).toBe('Agent 正在运行中')
    expect(events[0].payload.root).toBe(ROOT)
  })

  it('stage 缺省落 execute；code 非法缺省时不带 code 键', async () => {
    const { deps, events } = makeDeps()
    const routes = createRoutesCore(deps)
    await routes.notify({ status: 'failed', sessionId: 's1', messageId: 'm1', error: 'boom' })
    await flushMicrotasks()
    expect(events[0].payload.stage).toBe('execute')
    expect('code' in events[0].payload).toBe(false)
  })

  it('stage=fork（fork 抛错/返空场景，文件已回退语义由 client 决策表保证）', async () => {
    const { deps, events } = makeDeps()
    const routes = createRoutesCore(deps)
    await routes.notify({ status: 'failed', stage: 'fork', sessionId: 's1', messageId: 'm1', error: 'fork failed' })
    await flushMicrotasks()
    expect(events[0].payload.stage).toBe('fork')
  })
})

describe('notify：监听器抛错不影响端点应答（反噬防护）', () => {
  it('emitEvent 抛错 → 仍恒 { ok: true }，recordError 留痕', async () => {
    const { deps, events, errors } = makeDeps({ emitThrow: true })
    const routes = createRoutesCore(deps)
    const res = await routes.notify({ status: 'complete', sessionId: 's1', messageId: 'm1' })
    expect(res).toEqual({ ok: true })
    // 抛错发生在 microtask 内，不冒泡成 unhandled rejection
    await flushMicrotasks()
    expect(events).toEqual([])
    expect(errors.some((m) => m.includes('recall event emit failed'))).toBe(true)
  })
})
