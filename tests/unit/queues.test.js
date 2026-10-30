/**
 * per-root 任务队列（issue #29 后续）：为什么按 root 分链。
 *
 * 同一 root 必须串行——快照/preview/回滚/删除都在写同一个 git index；
 * 不同 root 必须并行——一个慢快照不该让别的会话连撤回按钮都出不来。
 * 这里钉住四条语义：同 root 顺序、跨 root 并行、win32 key 归一、
 * 失败不堵链；外加跨 root 批量操作的联锁行为。
 */

import { describe, it, expect } from 'vitest'
import { createQueues } from '../../src/host/queues.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('createQueues（per-root 串行链）', () => {
  it('同一 root 串行执行，顺序与入队一致', async () => {
    const q = createQueues(false)
    const order = []
    const first = q.enqueueFor('/a', async () => { await sleep(20); order.push('a1') })
    const second = q.enqueueFor('/a', async () => { order.push('a2') })
    await Promise.all([first, second])
    expect(order).toEqual(['a1', 'a2'])
  })

  it('不同 root 并行：慢任务不挡另一个 root', async () => {
    const q = createQueues(false)
    const order = []
    const slow = q.enqueueFor('/a', async () => { await sleep(60); order.push('a') })
    const fast = q.enqueueFor('/b', async () => { order.push('b') })
    await Promise.all([slow, fast])
    expect(order).toEqual(['b', 'a'])
  })

  it('win32：同一仓库的大小写变体共用一把锁', async () => {
    const q = createQueues(true)
    const order = []
    const first = q.enqueueFor('D:\\WS', async () => { await sleep(20); order.push(1) })
    const second = q.enqueueFor('d:\\ws', async () => { order.push(2) })
    await Promise.all([first, second])
    expect(order).toEqual([1, 2])
  })

  it('一次失败不堵链：后续任务照常执行', async () => {
    const q = createQueues(false)
    const failing = q.enqueueFor('/a', async () => { throw new Error('boom') })
    const next = q.enqueueFor('/a', async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('enqueueMany：等所有相关链尾落地后执行，后续同 root 任务排在它之后', async () => {
    const q = createQueues(false)
    const order = []
    const a = q.enqueueFor('/a', async () => { await sleep(30); order.push('a') })
    const b = q.enqueueFor('/b', async () => { order.push('b') })
    const many = q.enqueueMany(['/a', '/b'], async () => { order.push('many') })
    const after = q.enqueueFor('/a', async () => { order.push('after') })
    await Promise.all([a, b, many, after])
    expect(order).toEqual(['b', 'a', 'many', 'after'])
  })

  it('enqueueMany 空集合退化为全局链（与无 root 的 enqueueFor 同一条）', async () => {
    const q = createQueues(false)
    const order = []
    const many = q.enqueueMany([], async () => { order.push('many') })
    const global = q.enqueueFor(null, async () => { order.push('global') })
    await Promise.all([many, global])
    expect(order).toEqual(['many', 'global'])
  })
})
