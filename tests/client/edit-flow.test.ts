/**
 * 「编辑并重发」组件测试（issue #26）
 *
 * 覆盖入口与提交链：✎ 展开就地编辑框（预填原文）→ preview 取切点 →
 * execute(scope=session-only，不动项目文件) → fork → setDraft(改后文本) →
 * 官方 actions.submit 自动发出。同时钉住三条拒绝/降级面：首条消息无切点、
 * 预览失败、fork 失败（此时绝不能往原会话里补发一条重复消息）。
 * 断言请求载荷与调用次数，不断言 UI 文案字面量。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildRecallNode } from '../../src/client/recall-node.js'
import { makeUtil, makeCtx, stubFetch, stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument, q, qa, first, click, typeInto, chatNode, flush, wait } from './helpers.js'

const PREVIEW_OK = {
  ok: true,
  changes: [{ kind: 'modified', rel: 'a.txt' }],
  total: 1,
  truncated: false,
  treeId: 'tree-1',
  time: 1700000000000,
  cutSeq: 7,
}

const EXECUTE_OK = { ok: true, count: 0, cutSeq: 7, staleQueueItemIds: [] }

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
  document.body.innerHTML = ''
})

interface MountOptions {
  routes?: Record<string, unknown>
  initConfig?: Record<string, unknown>
}

async function mount(opts: MountOptions = {}) {
  const initRoute = {
    ok: true,
    root: 'D:/ws',
    notice: null,
    config: Object.assign({ refillDraft: true, archiveOriginal: true, editSubmitsImmediately: true }, opts.initConfig || {}),
  }
  const fetchStub = stubFetch(Object.assign({ init: initRoute, 'snapshot-info': { has: true }, preview: PREVIEW_OK, execute: EXECUTE_OK }, opts.routes || {}))
  const util = makeUtil()
  const ctxStub = makeCtx()
  const { ctx, drafts } = ctxStub
  const sessions = stubSessions({ childId: 'child-1' })
  const workspaces = stubWorkspaces()
  const uiWorkspace = stubUiWorkspace()
  const { UserRecallNode } = buildRecallNode(React, util, ctx, sessions.service, workspaces.service, uiWorkspace.service)
  const Node = UserRecallNode as unknown as (props: import('../../src/types/client-contract.js').ChatNodeProps) => React.ReactElement
  const handle = await renderIntoDocument(React.createElement(Node, chatNode()))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  // submits 透传 ctxStub 的 getter：发送发生在组件闭包里，断言时再读；
  // ctx 一并返回，便于用例替换 conversation 面模拟跨版本的输入态差异
  return {
    container: handle.container,
    fetchStub,
    drafts,
    get submits(): number { return ctxStub.submits },
    sessions,
    ctx,
  }
}

// 动作行顺序：时间 / 复制 / 撤回 / 编辑——按位置取，不依赖文案
function editButton(container: HTMLElement): HTMLElement {
  return qa(container, '.dsh-recall-actions .dsh-recall-action')[2] as HTMLElement
}

function editArea(container: HTMLElement): HTMLTextAreaElement | null {
  return q(container, '.dsh-recall-edit-area') as HTMLTextAreaElement | null
}

function submitButton(container: HTMLElement): HTMLElement | null {
  return q(container, '.dsh-recall-edit .dsh-recall-btn-primary')
}

async function openEditor(container: HTMLElement): Promise<void> {
  await click(editButton(container))
  await flush()
}

describe('编辑并重发：入口与面板', () => {
  it('点 ✎ → 就地展开编辑框并预填原消息文本', async () => {
    const m = await mount()
    await openEditor(m.container)

    const area = editArea(m.container)
    expect(area).not.toBeNull()
    expect(area && area.value).toBe('hello')
    // 编辑面板不拉 preview（打开不等于提交）
    expect(m.fetchStub.callsOf('preview').length).toBe(0)
  })

  it('取消 → 面板关闭，不发任何请求', async () => {
    const m = await mount()
    await openEditor(m.container)
    await click(q(m.container, '.dsh-recall-edit .dsh-recall-btn'))
    await flush()

    expect(editArea(m.container)).toBeNull()
    expect(m.fetchStub.callsOf('preview').length).toBe(0)
  })

  it('点撤回 → 编辑面板收起（两条入口互斥，不并存）', async () => {
    const m = await mount()
    await openEditor(m.container)
    await click(qa(m.container, '.dsh-recall-actions .dsh-recall-action')[1])
    await flush()

    expect(editArea(m.container)).toBeNull()
    expect(q(m.container, '.dsh-recall-scope')).not.toBeNull()
  })

  it('编辑态下 ✎ 收起（只剩复制/撤回，重复点击无法重置文本或宽度）', async () => {
    const m = await mount()
    await openEditor(m.container)
    // 显示态是 复制/撤回/编辑 三枚；编辑态收回 ✎，避免「再点一次」用原文
    // 覆盖用户改到一半的内容（且此时气泡已被编辑框顶替，再量宽度会读到空值）
    expect(qa(m.container, '.dsh-recall-actions .dsh-recall-action').length).toBe(2)
  })

  it('文本清空且原消息无附件 → 本地拦截，不发 preview', async () => {
    const m = await mount()
    await openEditor(m.container)
    await typeInto(editArea(m.container) as HTMLTextAreaElement, '   ')
    await click(submitButton(m.container))
    await flush()

    expect(m.fetchStub.callsOf('preview').length).toBe(0)
    expect(q(m.container, '.dsh-recall-edit-error')).not.toBeNull()
  })
})

describe('编辑并重发：提交链', () => {
  it('提交 → execute 走 session-only、fork 到该消息之前、回填改后文本并自动发送', async () => {
    const m = await mount()
    await openEditor(m.container)
    await typeInto(editArea(m.container) as HTMLTextAreaElement, 'hello2')
    await click(submitButton(m.container))
    await flush()
    await wait(30)

    // preview 只用来换切点（不带 scope）
    expect(first(m.fetchStub.callsOf('preview')).args).toEqual({ messageId: 'm1', sessionId: 's1' })
    // 编辑语义不动项目文件：scope 固定 session-only
    expect(first(m.fetchStub.callsOf('execute')).args.scope).toBe('session-only')
    expect(m.sessions.forks).toEqual([{ sessionId: 's1', atSeq: 7 }])
    // 改后文本进输入框，随后由官方 actions.submit 发出（不是回填原文）
    expect(m.drafts).toEqual(['hello2'])
    expect(m.submits).toBe(1)
  })

  it('editSubmitsImmediately=false → 只回填、不替用户发送', async () => {
    const m = await mount({ initConfig: { editSubmitsImmediately: false } })
    await openEditor(m.container)
    await typeInto(editArea(m.container) as HTMLTextAreaElement, 'hello3')
    await click(submitButton(m.container))
    await flush()
    await wait(30)

    expect(m.drafts).toEqual(['hello3'])
    expect(m.submits).toBe(0)
    expect(m.sessions.forks.length).toBe(1)
  })

  // 官方链（ui-conversation 0.2.1-rc.2）：actions.setDraft → draftEditor.setDraft
  // → editor.update(..., { discrete: true }) → updateListener → publish →
  // state.set(compose())，全程同步，故正常路径第一拍就能发。这里模拟「输入态快照
  // 滞后」的跨版本面，钉住兜底：等草稿落地，且只发一次。
  it('输入态快照滞后于 setDraft → 等草稿落地后只发送一次', async () => {
    const m = await mount()
    let submits = 0
    const typed: string[] = []
    const start = Date.now()
    const conversation = {
      input: {
        shell: () => ({
          actions: { setDraft: (text: string) => { typed.push(text) }, submit: () => { submits++ } },
          get snapshot() {
            // 前 100ms 一直读到空草稿（旧投影），之后才反映新文本
            return { draft: Date.now() - start > 100 ? (typed[typed.length - 1] || '') : '' }
          },
        }),
      },
    }
    ;(m.ctx as unknown as { get: (name: string) => unknown }).get = (name: string) => name === 'conversation' ? conversation : undefined

    await openEditor(m.container)
    await typeInto(editArea(m.container) as HTMLTextAreaElement, 'hello5')
    await click(submitButton(m.container))
    await flush()
    await wait(400)

    expect(typed).toContain('hello5')
    expect(submits).toBe(1)
  })

  it('refillDraft 关闭不影响编辑重发（编辑自己的开关是 editSubmitsImmediately）', async () => {
    const m = await mount({ initConfig: { refillDraft: false } })
    await openEditor(m.container)
    await typeInto(editArea(m.container) as HTMLTextAreaElement, 'hello4')
    await click(submitButton(m.container))
    await flush()
    await wait(30)

    expect(m.drafts).toEqual(['hello4'])
    expect(m.submits).toBe(1)
  })
})

describe('编辑并重发：拒绝与降级面', () => {
  it('首条消息（cutSeq 为 null）→ 明确拒绝，不 fork、不回填、不发送', async () => {
    const m = await mount({ routes: { preview: Object.assign({}, PREVIEW_OK, { cutSeq: null }) } })
    await openEditor(m.container)
    await click(submitButton(m.container))
    await flush()
    await wait(30)

    expect(m.fetchStub.callsOf('execute').length).toBe(0)
    expect(m.sessions.forks.length).toBe(0)
    expect(m.drafts).toEqual([])
    expect(m.submits).toBe(0)
    expect(q(m.container, '.dsh-recall-edit-error')).not.toBeNull()
  })

  it('preview 失败 → 错误面板可见，不执行也不回填', async () => {
    const m = await mount({ routes: { preview: { ok: false, message: 'no-snap-here' } } })
    await openEditor(m.container)
    await click(submitButton(m.container))
    await flush()

    expect(m.container.textContent).toContain('no-snap-here')
    expect(m.fetchStub.callsOf('execute').length).toBe(0)
    expect(m.drafts).toEqual([])
  })

  it('execute 失败 → 错误面板可见，不 fork', async () => {
    const m = await mount({ routes: { execute: { ok: false, code: 'AGENT_BUSY', message: 'busy' } } })
    await openEditor(m.container)
    await click(submitButton(m.container))
    await flush()

    expect(m.fetchStub.callsOf('execute').length).toBe(1)
    expect(m.sessions.forks.length).toBe(0)
    expect(m.drafts).toEqual([])
  })

  it('fork 失败 → 不往原会话补发（原消息仍在，补发即重复）', async () => {
    const m = await mount()
    m.sessions.service.fork = async () => { throw new Error('fork down') }
    await openEditor(m.container)
    await click(submitButton(m.container))
    await flush()
    await wait(30)

    expect(m.drafts).toEqual([])
    expect(m.submits).toBe(0)
    expect(m.container.textContent).toContain('fork down')
  })
})
