/**
 * 撤回节点组件测试（A1）
 *
 * 覆盖主链：快照存在性轮询 → 撤回按钮 → preview 确认面板（scope 二选一 /
 * cutSeq 缺省不出选项）→ execute 执行链（fork / 导航 / 归档 / 残留队列清理 /
 * 回填）与 STALE 自动重拉、失败与异常面。断言请求载荷与行为（调用次数、
 * updateQueue / setDraft / archiveSession 的入参），不断言 UI 文案。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildRecallNode } from '../../src/client/recall-node.js'
import { makeUtil, makeCtx, stubFetch, stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument, q, qa, first, click, chatNode, flush } from './helpers.js'

const PREVIEW_OK = {
  ok: true,
  changes: [{ kind: 'modified', rel: 'a.txt' }, { kind: 'added', rel: 'b.txt' }],
  total: 2,
  truncated: false,
  treeId: 'tree-1',
  time: 1700000000000,
  cutSeq: 7,
}

const EXECUTE_OK = { ok: true, count: 2, cutSeq: 7, staleQueueItemIds: ['m-stale'] }

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
  document.body.innerHTML = ''
})

interface MountOptions {
  routes?: Record<string, unknown>
  props?: Record<string, unknown>
  util?: Record<string, unknown>
  initConfig?: Record<string, unknown>
  childId?: string
}

async function mount(opts: MountOptions = {}) {
  const initRoute = {
    ok: true,
    root: 'D:/ws',
    notice: null,
    config: Object.assign({ refillDraft: true, archiveOriginal: true }, opts.initConfig || {}),
  }
  const fetchStub = stubFetch(Object.assign({ init: initRoute, 'snapshot-info': { has: true }, preview: PREVIEW_OK, execute: EXECUTE_OK }, opts.routes || {}))
  const util = makeUtil(opts.util || {})
  const { ctx, drafts } = makeCtx()
  const sessions = stubSessions({ childId: opts.childId ?? 'child-1' })
  const workspaces = stubWorkspaces()
  const uiWorkspace = stubUiWorkspace()
  const { UserRecallNode } = buildRecallNode(React, util, ctx, sessions.service, workspaces.service, uiWorkspace.service)
  // 组件契约返回 ReactNode（工厂签名用 unknown 收口），createElement 需要
  // 显式函数组件类型——断言到 ComponentType 后按声明 props 传参
  const Node = UserRecallNode as unknown as (props: import('../../src/types/client-contract.js').ChatNodeProps) => React.ReactElement
  const handle = await renderIntoDocument(React.createElement(Node, chatNode(opts.props || {})))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return { container: handle.container, fetchStub, drafts, sessions, workspaces, uiWorkspace }
}

function actionButtons(container: HTMLElement): HTMLElement[] {
  return qa(container, '.dsh-recall-actions .dsh-recall-action')
}

function toasts(): HTMLElement[] {
  return qa(document.body, '.dsh-recall-toast')
}

describe('撤回节点：快照存在性轮询', () => {
  it('has:true → 撤回按钮出现（复制 + 撤回两个动作）', async () => {
    const { container, fetchStub } = await mount()
    expect(actionButtons(container).length).toBe(2)
    expect(fetchStub.callsOf('snapshot-info').length).toBe(1)
  })

  it('has:false（无失败/说明，且消息已老）→ 不出现按钮、不继续轮询', async () => {
    const { container, fetchStub } = await mount({
      routes: { 'snapshot-info': { has: false } },
      props: { node: { id: 'm-old', key: 'm-old', data: { content: [{ type: 'text', text: 'x' }], time: Date.now() - 10 * 60 * 1000 } } },
    })
    expect(actionButtons(container).length).toBe(1)
    expect(fetchStub.callsOf('snapshot-info').length).toBe(1)
  })

  it('failed → toast 提示 + 停止轮询（失败是终止态）', async () => {
    const { fetchStub } = await mount({ routes: { 'snapshot-info': { has: false, failed: true, error: 'disk full' } } })
    expect(toasts().length).toBe(1)
    expect(fetchStub.callsOf('snapshot-info').length).toBe(1)
  })

  it('notice（如构建产物 root 停用）→ toast 说明 + 停止空轮询', async () => {
    const { fetchStub } = await mount({ routes: { 'snapshot-info': { has: false, notice: 'disabled-by-guard' } } })
    expect(toasts().length).toBe(1)
    expect(fetchStub.callsOf('snapshot-info').length).toBe(1)
  })

  it('has:true 且带 skipped → toast 列出跳过路径，按钮照常出现', async () => {
    const { container } = await mount({ routes: { 'snapshot-info': { has: true, skipped: ['a/', 'b/'] } } })
    expect(actionButtons(container).length).toBe(2)
    const toast = toasts()[0]
    expect(toast && toast.textContent).toContain('a/')
  })

  it('查询异常（网络错误）→ 不崩，按钮不出现', async () => {
    const { container } = await mount({ routes: { 'snapshot-info': new Error('network down') } })
    expect(actionButtons(container).length).toBe(1)
  })
})

describe('撤回节点：preview 与确认面板', () => {
  it('点击撤回 → 发 preview（messageId + sessionId）并渲染变更清单与 scope 二选一', async () => {
    const { container, fetchStub } = await mount()
    await click(actionButtons(container)[1])
    await flush()

    const calls = fetchStub.callsOf('preview')
    expect(calls.length).toBe(1)
    expect(first(calls).args).toEqual({ messageId: 'm1', sessionId: 's1' })
    expect(qa(container, '.dsh-recall-list .dsh-recall-file').length).toBe(2)
    expect(q(container, '.dsh-recall-scope')).not.toBeNull()
    expect(qa(container, '.dsh-recall-scope input[type="radio"]').length).toBe(2)
  })

  it('cutSeq 为 null（首条消息）→ 不渲染 scope 选项，仍可确认（仅文件回退）', async () => {
    const { container } = await mount({ routes: { preview: Object.assign({}, PREVIEW_OK, { cutSeq: null }) } })
    await click(actionButtons(container)[1])
    await flush()

    expect(q(container, '.dsh-recall-scope')).toBeNull()
    expect(q(container, '.dsh-recall-btn-danger')).not.toBeNull()
  })

  it('truncated → 面板多一条截断说明（结构断言：note 数 +1）', async () => {
    const full = await mount({ routes: { preview: Object.assign({}, PREVIEW_OK, { truncated: true, total: 900 }) } })
    await click(actionButtons(full.container)[1])
    await flush()
    expect(qa(full.container, '.dsh-recall-panel-note').length).toBe(3)

    const plain = await mount({ routes: { preview: Object.assign({}, PREVIEW_OK, { truncated: false }) } })
    await click(actionButtons(plain.container)[1])
    await flush()
    expect(qa(plain.container, '.dsh-recall-panel-note').length).toBe(2)
  })

  it('preview 失败（ok:false）→ 错误面板（关闭按钮 + host 载荷原文）', async () => {
    const { container } = await mount({ routes: { preview: { ok: false, message: 'no-snap-here' } } })
    await click(actionButtons(container)[1])
    await flush()

    expect(q(container, '.dsh-recall-list')).toBeNull()
    expect(container.textContent).toContain('no-snap-here')
  })

  it('preview 异常（网络错误）→ 错误面板', async () => {
    const { container } = await mount({ routes: { preview: new Error('network down') } })
    await click(actionButtons(container)[1])
    await flush()

    expect(container.textContent).toContain('network down')
    expect(q(container, '.dsh-recall-btn-danger')).toBeNull()
  })

  it('取消关闭面板：回到仅按钮态（再点撤回重新拉 preview）', async () => {
    const { container, fetchStub } = await mount()
    await click(actionButtons(container)[1])
    await flush()
    await click(q(container, '.dsh-recall-panel-actions .dsh-recall-btn'))
    await flush()

    expect(q(container, '.dsh-recall-scope')).toBeNull()
    await click(actionButtons(container)[1])
    await flush()
    expect(fetchStub.callsOf('preview').length).toBe(2)
  })
})

describe('撤回节点：execute 执行链', () => {
  async function openConfirm(mountResult: Awaited<ReturnType<typeof mount>>): Promise<void> {
    await click(actionButtons(mountResult.container)[1])
    await flush()
  }

  it('确认 → execute 携带 previewTreeId/previewTotal/scope；成功后 fork/导航/归档/队列清理全链发生', async () => {
    const m = await mount()
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    const exec = first(m.fetchStub.callsOf('execute'))
    expect(exec.args.messageId).toBe('m1')
    expect(exec.args.sessionId).toBe('s1')
    expect(exec.args.previewTreeId).toBe('tree-1')
    expect(exec.args.previewTotal).toBe(2)
    expect(exec.args.scope).toBe('both')

    expect(m.sessions.forks).toEqual([{ sessionId: 's1', atSeq: 7 }])
    expect(m.uiWorkspace.opened).toEqual(['child-1'])
    expect(m.workspaces.archived).toEqual([{ sessionId: 's1', stopActivity: true }])
    expect(m.sessions.queueRemovals).toEqual(['m-stale'])
    const lineage = m.fetchStub.callsOf('lineage-record')
    expect(lineage.length).toBe(1)
    expect(first(lineage).args).toEqual({ childId: 'child-1', parentId: 's1' })
  })

  it('refillDraft 开启（init 下发）→ 把被撤回消息文本回填输入框', async () => {
    const m = await mount()
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.drafts).toEqual(['hello'])
  })

  it('refillDraft 关闭 → 不回填', async () => {
    const m = await mount({ initConfig: { refillDraft: false } })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.drafts).toEqual([])
  })

  it('archiveOriginal 关闭 → 不归档原会话（fork 与回填照常）', async () => {
    const m = await mount({ initConfig: { archiveOriginal: false } })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.workspaces.archived).toEqual([])
    expect(m.sessions.forks.length).toBe(1)
    expect(m.drafts).toEqual(['hello'])
  })

  it('STALE → 自动重新 preview 回到确认面板（不重复执行）', async () => {
    const m = await mount({ routes: { execute: { ok: false, code: 'STALE', message: 'stale' } } })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.fetchStub.callsOf('preview').length).toBe(2)
    expect(m.fetchStub.callsOf('execute').length).toBe(1)
    expect(q(m.container, '.dsh-recall-scope')).not.toBeNull()
    expect(m.sessions.forks.length).toBe(0)
  })

  it('execute 失败（非 STALE）→ 错误面板且不 fork', async () => {
    const m = await mount({ routes: { execute: { ok: false, message: 'rollback-boom' } } })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.container.textContent).toContain('rollback-boom')
    expect(m.sessions.forks.length).toBe(0)
  })

  it('execute 异常（网络错误）→ 错误面板', async () => {
    const m = await mount({ routes: { execute: new Error('network down') } })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.container.textContent).toContain('network down')
  })

  it('选择仅撤回对话 → execute 载荷 scope=session-only', async () => {
    const m = await mount()
    await openConfirm(m)
    await click(qa(m.container, '.dsh-recall-scope input[type="radio"]')[1])
    await flush()
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(first(m.fetchStub.callsOf('execute')).args.scope).toBe('session-only')
  })

  it('fork 失败 → 降级为仅文件回退：不导航、不清理队列、不归档', async () => {
    const m = await mount()
    m.sessions.service.fork = async () => { throw new Error('fork down') }
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.uiWorkspace.opened).toEqual([])
    expect(m.sessions.queueRemovals).toEqual([])
    expect(m.workspaces.archived).toEqual([])
    expect(m.container.textContent).toContain('fork down')
  })

  it('fork 返回空 id → 不进入对话回退分支（结果面板仍出）', async () => {
    const m = await mount({ childId: '' })
    await openConfirm(m)
    await click(q(m.container, '.dsh-recall-btn-danger'))
    await flush()

    expect(m.uiWorkspace.opened).toEqual([])
    expect(q(m.container, '.dsh-recall-panel-actions')).not.toBeNull()
  })
})

describe('撤回节点：消息渲染与复制', () => {
  it('图片块经 renderMessageImages 渲染（走官方图片管线）', async () => {
    const calls: Array<{ images: Array<{ attachment: unknown }>; align: string }> = []
    const renderMessageImages = (args: { images: Array<{ attachment: unknown }>; align: string }) => { calls.push(args); return React.createElement('div', { className: 'img-slot' }) }
    const { container } = await mount({
      props: {
        renderMessageImages,
        node: { id: 'm1', key: 'm1', data: { content: [{ type: 'text', text: 'hi' }, { type: 'image', attachment: { attachmentId: 'att-1' } }] } },
      },
    })

    expect(qa(container, '.img-slot').length).toBe(1)
    // 渲染函数每次 render 都会被调用（挂载 + 状态更新重渲染），断言载荷而非次数
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(first(first(calls).images).attachment).toEqual({ attachmentId: 'att-1' })
  })

  it('file 块渲染文件卡片（扩展名徽标 + 文件名）', async () => {
    const { container } = await mount({
      props: { node: { id: 'm1', key: 'm1', data: { content: [{ type: 'file', attachment: { attachmentId: 'att-2', name: 'report.pdf' } }] } } },
    })

    expect(qa(container, '.dsh-recall-filecard').length).toBe(1)
    expect(q(container, '.dsh-recall-filecard-icon')?.textContent).toBe('PDF')
  })

  it('复制按钮把消息文本交给剪贴板通道', async () => {
    const copied: string[] = []
    const { container } = await mount({ util: { writeClipboard: async (t: string) => { copied.push(t); return true } } })
    await click(actionButtons(container)[0])
    await flush()

    expect(copied).toEqual(['hello'])
  })
})