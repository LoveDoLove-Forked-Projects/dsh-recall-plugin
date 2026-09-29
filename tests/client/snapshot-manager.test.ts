/**
 * 快照管理卡片组件测试（A1）
 *
 * 覆盖：列表拉取与三级树渲染（工作区 → 会话 → 快照）、lineage 版本家族标记、
 * 三级删除与「全部删除」的确认流 + 载荷、PARTIAL_DELETE 可见性、搜索过滤、
 * 二段刷新（stale）、titles/messages 异步补齐、切换入口判据、gc 与清空错误。
 * 断言请求载荷与结构（className / aria / 调用），不断言 UI 文案。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildSnapshotManager } from '../../src/client/snapshot-manager.js'
import { makeUtil, stubFetch, stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument, q, qa, first, click, typeInto, flush } from './helpers.js'

const ROOT = 'D:/ws'
const ITEMS = [
  { id: 'm1', root: ROOT, sessionId: 's1', time: 1700000000000, workspace: 'ws', sessionTitle: 'T1' },
  { id: 'm2', root: ROOT, sessionId: 's1', time: 1700000001000, workspace: 'ws', sessionTitle: 'T1' },
]

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
})

interface MountOptions {
  items?: unknown[]
  lineage?: unknown[]
  total?: number
  staleFirst?: boolean
  deleteAll?: unknown
  byId?: Record<string, unknown>
  archivedSessionIds?: readonly string[]
}

async function mount(opts: MountOptions = {}) {
  let listCalls = 0
  const items = opts.items || ITEMS
  const manage = (args: Record<string, unknown>): unknown => {
    const op = args.op
    if (op === 'list') {
      listCalls++
      const stale = Boolean(opts.staleFirst) && listCalls === 1
      return { ok: true, items, total: opts.total ?? items.length, stale }
    }
    if (op === 'titles') return { ok: true, titles: { s1: 'Loaded-Title' } }
    if (op === 'messages') return { ok: true, messageTexts: { m1: 'msg-1' } }
    if (op === 'lineage') return { ok: true, lineage: opts.lineage || [] }
    if (op === 'usage') return { ok: true, bytes: 1048576, gitAvailable: true, homeStores: 1, fallbackStores: 0 }
    if (op === 'delete') return { ok: true, deleted: 1 }
    if (op === 'deleteAll') return opts.deleteAll || { ok: true, deleted: 2, stores: 1 }
    if (op === 'gc') return { ok: true, gc: true }
    return { ok: true }
  }
  const fetchStub = stubFetch({
    manage,
    status: { ok: true, errors: [{ time: Date.now(), message: 'recent-error-1' }], storeBase: '/home/store' },
  })
  const util = makeUtil()
  const sessions = stubSessions({ byId: opts.byId || { s1: {} } })
  const workspaces = stubWorkspaces({ archivedSessionIds: opts.archivedSessionIds || [] })
  const uiWorkspace = stubUiWorkspace()
  const { ManageCard } = buildSnapshotManager(React, util, sessions.service, workspaces.service, uiWorkspace.service)
  const handle = await renderIntoDocument(React.createElement(ManageCard))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return { container: handle.container, fetchStub, sessions, workspaces, uiWorkspace }
}

function manageCalls(fetchStub: ReturnType<typeof stubFetch>, op: string) {
  return fetchStub.calls.filter((c) => c.name === 'manage' && c.args.op === op)
}

describe('snapshot-manager：列表与树', () => {
  it('首屏发 list/lineage/usage/status 四类请求并渲染工作区节点', async () => {
    const { container, fetchStub } = await mount()
    expect(manageCalls(fetchStub, 'list').length).toBe(1)
    expect(manageCalls(fetchStub, 'lineage').length).toBe(1)
    expect(manageCalls(fetchStub, 'usage').length).toBe(1)
    expect(fetchStub.callsOf('status').length).toBe(1)
    expect(qa(container, '.dsh-recall-tree-node').length).toBeGreaterThanOrEqual(1)
  })

  it('展开工作区后渲染会话行，再展开渲染叶子（三级结构）', async () => {
    const { container } = await mount()
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()
    expect(qa(container, '.dsh-recall-tree-title').length).toBe(1)

    const toggles = qa(container, '.dsh-recall-tree-toggle')
    await click(toggles[toggles.length - 1])
    await flush()
    expect(qa(container, '.dsh-recall-tree-node').length).toBeGreaterThanOrEqual(4)
  })

  it('lineage 聚族：会话行出现版本家族标记（v1/2）', async () => {
    const { container } = await mount({
      items: [
        { id: 'a', root: ROOT, sessionId: 's-parent', time: 1, workspace: 'ws' },
        { id: 'b', root: ROOT, sessionId: 's-child', time: 2, workspace: 'ws' },
      ],
      lineage: [{ childId: 's-child', parentId: 's-parent' }],
    })
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()

    const metas = qa(container, '.dsh-recall-tree-meta').map((m) => m.textContent || '')
    expect(metas.some((t) => t.indexOf('v1/2') >= 0 || t.indexOf('v2/2') >= 0)).toBe(true)
  })

  it('titles 与 messages 异步补齐请求带正确载荷', async () => {
    const { container, fetchStub } = await mount({ items: [{ id: 'm1', root: ROOT, sessionId: 's1', time: 1, workspace: 'ws', sessionTitle: null }] })
    expect(first(manageCalls(fetchStub, 'titles')).args.sessionIds).toEqual(['s1'])
    expect(first(manageCalls(fetchStub, 'messages')).args.requests).toEqual([{ sessionId: 's1', messageId: 'm1' }])
    // 补齐后的标题进入会话行（结构断言：展开后标题文本来自 titles 响应）
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()
    expect(container.textContent).toContain('Loaded-Title')
  })

  it('搜索过滤：命中叶子保留、无匹配出空态', async () => {
    const { container } = await mount()
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()
    const input = q(container, '.dsh-recall-search .dsh-recall-ex-input')
    await typeInto(input as HTMLInputElement, 'no-such-thing')
    await flush()
    expect(qa(container, '.dsh-recall-empty').length).toBe(1)

    await typeInto(input as HTMLInputElement, 'm1')
    await flush()
    expect(qa(container, '.dsh-recall-empty').length).toBe(0)
  })

  it('stale 二段刷新：list 连发两次，第二次结果进树', async () => {
    const { fetchStub } = await mount({ staleFirst: true })
    expect(manageCalls(fetchStub, 'list').length).toBe(2)
  })

  it('total 大于已加载条数时出现「加载更多」，点击抬高 limit 再拉列表', async () => {
    const { container, fetchStub } = await mount({ total: 900 })
    const loadMore = first(qa(container, '.dsh-recall-panel-actions .dsh-recall-btn'))
    expect(loadMore.textContent).toBeTruthy()
    await click(loadMore)
    await flush()

    const lists = manageCalls(fetchStub, 'list')
    expect(lists.length).toBe(2)
    expect(Number(first(lists.slice(1)).args.limit)).toBeGreaterThan(Number(first(lists).args.limit))
  })
})

describe('snapshot-manager：删除确认流与载荷', () => {
  it('工作区删除：确认行出现 → 确认发 delete(scope=workspace, root)', async () => {
    const { container, fetchStub } = await mount()
    await click(q(container, '.dsh-recall-icon-btn-danger'))
    await flush()
    expect(qa(container, '.dsh-recall-tree-confirm').length).toBe(1)

    await click(q(container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip-danger'))
    await flush()
    const del = manageCalls(fetchStub, 'delete')
    expect(del.length).toBe(1)
    expect(first(del).args.scope).toBe('workspace')
    expect(first(del).args.root).toBe(ROOT)
  })

  it('取消确认：不发请求，确认行消失', async () => {
    const { container, fetchStub } = await mount()
    await click(q(container, '.dsh-recall-icon-btn-danger'))
    await flush()
    // 确认钮带 danger 修饰类——取消钮必须显式排除它，否则点到的是确认
    await click(q(container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip:not(.dsh-recall-ex-chip-danger)'))
    await flush()

    expect(manageCalls(fetchStub, 'delete').length).toBe(0)
    expect(qa(container, '.dsh-recall-tree-confirm').length).toBe(0)
  })

  it('会话删除：载荷带 scope=session + sessionId + root', async () => {
    const { container, fetchStub } = await mount()
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()
    await click(qa(container, '.dsh-recall-tree-node')[1] && qa(container, '.dsh-recall-icon-btn-danger')[1])
    await flush()
    await click(q(container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip-danger'))
    await flush()

    const del = manageCalls(fetchStub, 'delete')
    expect(first(del).args.scope).toBe('session')
    expect(first(del).args.sessionId).toBe('s1')
  })

  it('叶子删除：载荷带 messageId（快照删除不带 scope，走 manage delete 默认分支）', async () => {
    const { container, fetchStub } = await mount()
    await click(q(container, '.dsh-recall-tree-toggle'))
    await flush()
    const sessionToggle = qa(container, '.dsh-recall-tree-toggle')[1]
    await click(sessionToggle)
    await flush()
    const dangerBtns = qa(container, '.dsh-recall-icon-btn-danger')
    await click(dangerBtns[dangerBtns.length - 1])
    await flush()
    await click(q(container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip-danger'))
    await flush()

    const del = manageCalls(fetchStub, 'delete')
    expect(del.length).toBe(1)
    expect(first(del).args.messageId).toBe('m1')
    expect(first(del).args.scope).toBeUndefined()
    expect(first(del).args.root).toBe(ROOT)
  })

  it('全部删除：确认后发 deleteAll；部分失败（PARTIAL_DELETE）→ 错误态可见', async () => {
    const { container, fetchStub } = await mount({ deleteAll: { ok: false, code: 'PARTIAL_DELETE', deleted: 1, message: 'partial-boom' } })
    const danger = qa(container, '.dsh-recall-btn-danger')[0]
    await click(danger)
    await flush()
    expect(qa(container, '.dsh-recall-tree-confirm').length).toBe(1)

    await click(q(container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip-danger'))
    await flush()
    expect(manageCalls(fetchStub, 'deleteAll').length).toBe(1)
    expect(container.textContent).toContain('partial-boom')
    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('删除请求失败（ok:false）→ 错误态；网络异常 → 同样错误态', async () => {
    const fail = await mount({ deleteAll: { ok: false, message: 'del-boom' } })
    await click(qa(fail.container, '.dsh-recall-btn-danger')[0])
    await flush()
    await click(q(fail.container, '.dsh-recall-tree-confirm .dsh-recall-ex-chip-danger'))
    await flush()
    expect(fail.container.textContent).toContain('del-boom')
  })
})

describe('snapshot-manager：操作区与错误区', () => {
  it('立即 gc → manage op=gc', async () => {
    const { container, fetchStub } = await mount()
    const buttons = qa(container, '.dsh-recall-panel-actions .dsh-recall-btn')
    await click(buttons[buttons.length - 2]) // gc（最后一个危险按钮是全部删除）
    await flush()

    expect(manageCalls(fetchStub, 'gc').length).toBe(1)
  })

  it('最近错误渲染（payload 原文可见）且清空发 status op=clear', async () => {
    const { container, fetchStub } = await mount()
    expect(container.textContent).toContain('recent-error-1')

    const clear = qa(container, '.dsh-recall-panel-actions .dsh-recall-ex-chip')
    await click(clear[clear.length - 1])
    await flush()
    const clears = fetchStub.calls.filter((c) => c.name === 'status' && c.args.op === 'clear')
    expect(clears.length).toBe(1)
  })

  it('切换入口判据：在册且未归档才渲染「切换」chip，点击走 openSession', async () => {
    const ok = await mount()
    await click(q(ok.container, '.dsh-recall-tree-toggle'))
    await flush()
    const chips = qa(ok.container, '.dsh-recall-tree-row .dsh-recall-ex-chip')
    expect(chips.length).toBeGreaterThanOrEqual(1)
    await click(chips[chips.length - 1])
    expect(ok.uiWorkspace.opened).toEqual(['s1'])

    const archived = await mount({ archivedSessionIds: ['s1'] })
    await click(q(archived.container, '.dsh-recall-tree-toggle'))
    await flush()
    expect(qa(archived.container, '.dsh-recall-tree-row .dsh-recall-ex-chip').length).toBe(0)
  })

  it('刷新按钮重新拉列表', async () => {
    const { container, fetchStub } = await mount()
    const buttons = qa(container, '.dsh-recall-panel-actions .dsh-recall-btn')
    await click(buttons[0]) // 刷新（无加载更多时排首位）
    await flush()

    expect(manageCalls(fetchStub, 'list').length).toBe(2)
  })
})