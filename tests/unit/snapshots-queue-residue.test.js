/**
 * fork 残留排队项解析单测
 *
 * 官方 fork 的切点是「boundary 那条 turn/end 之后、下一个 turn/start 之前」的
 * 整段事件。排队投递的用户消息，其 inbox 入队事件（agent/inbox/spliced）必然
 * 落在「上一个 turn/end」与「领取它的 turn/start」之间——正好被复制进子会话
 * seed，子会话重建 inbox 后输入框上方就多出一条本该被撤回掉的排队消息。
 *
 * 本档钉住窗口扫描的边界：窗口在下一个 turn/start 处闭合、非 user 来源忽略、
 * 重复 rpcId 去重、切点非法时整体放弃；工厂侧只在 live 会话事件上扫，拿不到
 * 就返回空（不清理）。
 */

import { describe, it, expect } from 'vitest'
import { createSnapshots, scanStaleQueueRpcIds } from '../../src/host/snapshots.js'

// 取自真实会话日志的形状：seq 93 turn/end（切点）→ 94 排队投递 r1 入队 →
// 95 turn/start（窗口闭合）→ 96 入队项被领取后移除 → 100 消息落进日志
const EVENTS = [
  { seq: 93, type: 'turn/end' },
  { seq: 94, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [{ source: { kind: 'user', rpcId: 'r1' }, content: [{ type: 'image' }] }] } },
  { seq: 95, type: 'turn/start' },
  { seq: 96, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
  { seq: 100, type: 'user/message', data: { id: 'm1', source: { kind: 'user', rpcId: 'r1' } } },
]

function makeSnaps(sessions) {
  const state = { cutSeqCache: new Map() }
  const ctx = { sessions, get: () => undefined }
  const snaps = createSnapshots(ctx, { state, scripts: {} }, { baseExcludes: [] })
  return { snaps, state }
}

describe('scanStaleQueueRpcIds（fork 切点窗口）', () => {
  it('取窗口内 user 来源入队项的 rpcId，窗口在下一个 turn/start 处闭合', () => {
    expect(scanStaleQueueRpcIds(EVENTS, 93)).toEqual(['r1'])
  })

  it('切点之后没有 turn/start（消息是最后一条）时扫到事件末尾', () => {
    const tail = [
      { seq: 10, type: 'turn/end' },
      { seq: 11, type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'user', rpcId: 'r1' } }] } },
      { seq: 12, type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'user', rpcId: 'r2' } }] } },
    ]
    expect(scanStaleQueueRpcIds(tail, 10)).toEqual(['r1', 'r2'])
  })

  it('只认 user 来源，去掉重复 rpcId，忽略队列移除与其他事件', () => {
    const mixed = [
      { seq: 1, type: 'turn/end' },
      { seq: 2, type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'plugin', plugin: 'hooks-codex' } }] } },
      { seq: 3, type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'user', rpcId: 'r1' } }, { source: { kind: 'user', rpcId: 'r1' } }, { source: { kind: 'user' } }] } },
      { seq: 4, type: 'agent/inbox/spliced', data: { removedCount: 1, inserted: [] } },
      { seq: 5, type: 'turn/start' },
    ]
    expect(scanStaleQueueRpcIds(mixed, 1)).toEqual(['r1'])
  })

  it('切点非法/缺失时不清理（返回空数组）', () => {
    expect(scanStaleQueueRpcIds(EVENTS, null)).toEqual([])
    expect(scanStaleQueueRpcIds(EVENTS, NaN)).toEqual([])
    expect(scanStaleQueueRpcIds(null, 93)).toEqual([])
  })
})

describe('resolveStaleQueueRpcIds（工厂侧）', () => {
  it('live 会话在册 → 用内存事件扫窗口', async () => {
    const { snaps } = makeSnaps({ get: (id) => (id === 's1' ? { id: 's1', events: EVENTS } : undefined) })
    expect(await snaps.resolveStaleQueueRpcIds('s1', 93)).toEqual(['r1'])
  })

  it('冷会话（拿不到内存事件）→ 不清理，返回空数组而非抛错', async () => {
    const { snaps } = makeSnaps({ get: () => undefined })
    expect(await snaps.resolveStaleQueueRpcIds('s1', 93)).toEqual([])
    expect(await snaps.resolveStaleQueueRpcIds(null, 93)).toEqual([])
    expect(await snaps.resolveStaleQueueRpcIds('s1', null)).toEqual([])
  })
})
