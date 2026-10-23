/**
 * 消息位置编辑卡的组件测试（issue #26 二次迭代，B 形态）
 *
 * 官方不允许第二个 composer 实例，所以消息位置这张卡是插件自绘的「官方同款」，
 * 底部官方输入框保持原样。这里钉住卡本身的行为：预填原文、只读权限/模型 chip
 * 抄自底部输入框、附件 chip 可移除、Enter 发送、Esc 取消、空输入拒绝。
 *
 * 断言行为与请求次数，不断言文案字面量。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildRecallNode } from '../../src/client/recall-node.js'
import { makeUtil, makeCtx, stubFetch, stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument, q, qa, at, click, pressEnter, pressEscape, typeInto, chatNode, flush, wait } from './helpers.js'

const PREVIEW_OK = { ok: true, changes: [], total: 0, truncated: false, treeId: 'tree-1', time: 1, cutSeq: 7 }
const EXECUTE_OK = { ok: true, count: 0, cutSeq: 7, staleQueueItemIds: [] }

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
  document.body.innerHTML = ''
})

// 底部官方输入框（只提供槽容器，供只读 chip 取值）
function installOfficialComposer(permission = '完全权限', model = 'DeepSeek-V4.1-Flash'): void {
  const card = document.createElement('div')
  card.setAttribute('data-composer-card', '')
  const perm = document.createElement('div')
  perm.setAttribute('data-slot', 'conversation.input.permission')
  perm.textContent = permission
  const modelEl = document.createElement('div')
  modelEl.setAttribute('data-slot', 'conversation.input.model')
  modelEl.textContent = model
  card.appendChild(perm)
  card.appendChild(modelEl)
  document.body.appendChild(card)
}

async function mount(opts: { content?: unknown[]; routes?: Record<string, unknown>; services?: Record<string, unknown>; loadImage?: (attachment: unknown) => Promise<string> } = {}) {
  const fetchStub = stubFetch(Object.assign({ 'snapshot-info': { has: true }, preview: PREVIEW_OK, execute: EXECUTE_OK }, opts.routes || {}))
  const util = makeUtil()
  const ctxStub = makeCtx({ services: opts.services })
  const sessions = stubSessions({ childId: 'child-1' })
  const workspaces = stubWorkspaces()
  const uiWorkspace = stubUiWorkspace()
  const { UserRecallNode } = buildRecallNode(React, util, ctxStub.ctx, sessions.service, workspaces.service, uiWorkspace.service)
  const Node = UserRecallNode as unknown as (props: import('../../src/types/client-contract.js').ChatNodeProps) => React.ReactElement
  const node = opts.content
    ? { id: 'm1', key: 'm1', kind: 'user', data: { content: opts.content, time: Date.now() } }
    : undefined
  const props = node ? chatNode({ node }) : chatNode()
  const withLoad = opts.loadImage ? Object.assign({}, props, { loadImage: opts.loadImage }) : props
  const handle = await renderIntoDocument(React.createElement(Node, withLoad))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return { container: handle.container, sessions, fetchStub }
}

function editButton(container: HTMLElement): HTMLElement {
  return at(qa(container, '.dsh-recall-actions .dsh-recall-action'), 2)
}

async function openEditor(container: HTMLElement): Promise<void> {
  await click(editButton(container))
  await flush()
}

function area(container: HTMLElement): HTMLTextAreaElement {
  const el = q(container, '.dsh-recall-edit-area')
  if (!el) throw new Error('编辑区不存在')
  return el as HTMLTextAreaElement
}

describe('消息位置编辑卡', () => {
  it('点 ✎ → 出现官方同款卡片并预填原文，底部输入框不被触碰', async () => {
    installOfficialComposer()
    const m = await mount()
    await openEditor(m.container)

    expect(q(m.container, '.dsh-recall-composer')).not.toBeNull()
    expect(area(m.container).value).toBe('hello')
    // 只读 chip 抄自底部官方输入框的槽容器
    const chips = qa(m.container, '.dsh-recall-composer-chip').map((el) => el.textContent)
    expect(chips).toEqual(['完全权限', 'DeepSeek-V4.1-Flash'])
    // 打开不等于提交
    expect(m.fetchStub.callsOf('preview').length).toBe(0)
  })

  it('Enter 直接提交：preview → execute(session-only) → fork', async () => {
    const m = await mount()
    await openEditor(m.container)
    await typeInto(area(m.container), 'edited')
    await pressEnter(area(m.container))
    await flush()
    await wait(30)

    expect(m.fetchStub.callsOf('preview').length).toBe(1)
    expect(at(m.fetchStub.callsOf('execute'), 0).args.scope).toBe('session-only')
    expect(m.sessions.forks.length).toBe(1)
    expect(q(m.container, '.dsh-recall-composer')).toBeNull()
  })

  it('Esc → 关闭卡片，不发任何请求', async () => {
    const m = await mount()
    await openEditor(m.container)
    await pressEscape()
    await flush()

    expect(q(m.container, '.dsh-recall-composer')).toBeNull()
    expect(m.fetchStub.callsOf('preview').length).toBe(0)
  })

  it('原消息附件渲染成 chip，移除后不再随消息带过去', async () => {
    const m = await mount({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'file', attachment: { attachmentId: 'att-1', name: 'report.pdf' } },
      ],
    })
    await openEditor(m.container)

    const chipName = q(m.container, '.dsh-recall-composer-attach-name')
    expect(chipName ? chipName.textContent : null).toBe('report.pdf')
    await click(q(m.container, '.dsh-recall-composer-attach-x'))
    await flush()
    expect(q(m.container, '.dsh-recall-composer-attach')).toBeNull()
  })

  it('模型 chip 读官方目录：下拉选择走 selectModel，权限保持只读', async () => {
    installOfficialComposer()
    interface TestModel { id: string; name: string; reasoning?: { defaultEffort?: string; efforts: Array<{ id: string; name: string }> } }
    const state: {
      current: { provider: string; model: string; reasoningEffort?: string } | null
      groups: Array<{ id: string; name: string; models: TestModel[] }>
    } = {
      current: { provider: 'deepseek', model: 'm1', reasoningEffort: 'xhigh' },
      groups: [{
        id: 'deepseek',
        name: 'DeepSeek',
        models: [
          { id: 'm1', name: 'Model One', reasoning: { defaultEffort: 'xhigh', efforts: [{ id: 'xhigh', name: 'Xhigh' }] } },
          { id: 'm2', name: 'Model Two' },
        ],
      }],
    }
    const picked: unknown[] = []
    const directory = {
      store: { getSnapshot: () => state },
      load: async () => state,
      select: async (selection: unknown) => {
        picked.push(selection)
        const next = selection as { provider: string; model: string }
        state.current = { provider: next.provider, model: next.model }
        return { ok: true }
      },
    }
    const m = await mount({ services: { modelDirectories: { directoryFor: () => directory } } })
    await openEditor(m.container)
    await flush()
    await wait(10)

    const chip = q(m.container, '.dsh-recall-composer-chip-btn')
    // 与官方 chip 同构：模型名与思考强度是两个 span（档位空时回落 Default）
    expect(q(m.container, '.dsh-recall-composer-chip-name')?.textContent).toBe('Model One')
    expect(q(m.container, '.dsh-recall-composer-chip-effort')?.textContent).toBe('Xhigh')
    // 权限仍是只读 chip（不是按钮）
    const chips = qa(m.container, '.dsh-recall-composer-chip').map((el) => el.textContent)
    expect(chips).toContain('完全权限')

    // 主段：模型 / 推理等级 两行，第二行显示当前档位
    await click(chip)
    const cells = qa(m.container, '.dsh-recall-menu-cell')
    expect(cells.length).toBe(2)
    expect(at(cells, 1).textContent).toContain('Xhigh')

    // 列表段：按供应商分组 + 当前项打勾
    await click(at(cells, 0))
    expect(qa(m.container, '.dsh-recall-menu-heading').map((el) => el.textContent)).toEqual(['DeepSeek'])
    const options = qa(m.container, '.dsh-recall-menu-option')
    expect(options.length).toBe(2)
    expect(at(options, 0).getAttribute('aria-checked')).toBe('true')

    await click(at(options, 1))
    await flush()
    await wait(10)
    expect(picked).toEqual([{ provider: 'deepseek', model: 'm2' }])
    expect(q(m.container, '.dsh-recall-composer-chip-name')?.textContent).toBe('Model Two')
    expect(q(m.container, '.dsh-recall-composer-chip-effort')?.textContent).toBe('Default')
    expect(q(m.container, '.dsh-recall-menu')).toBeNull()

    // 推理等级段：m2 未声明 reasoning，只剩 provider default 一条
    await click(q(m.container, '.dsh-recall-composer-chip-btn'))
    await click(at(qa(m.container, '.dsh-recall-menu-cell'), 1))
    const levels = qa(m.container, '.dsh-recall-menu-option')
    expect(levels.map((el) => el.textContent)).toEqual(['Default'])
    await click(levels[0])
    await flush()
    await wait(10)
    expect(picked[1]).toEqual({ provider: 'deepseek', model: 'm2' })
  })

  it('原消息图片附件显示缩略图（走官方 loadImage 通道）', async () => {
    const m = await mount({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', attachment: { attachmentId: 'img-1', name: 'image.png' } },
      ],
      loadImage: async () => 'blob:thumb-1',
    })
    await openEditor(m.container)
    await flush()
    await wait(20)

    const thumb = q(m.container, '.dsh-recall-composer-thumb') as HTMLImageElement | null
    expect(thumb ? thumb.getAttribute('src') : null).toBe('blob:thumb-1')
    // 缩略图模式下删除键仍在（角标），且不再渲染文件名 chip
    expect(q(m.container, '.dsh-recall-composer-attach-x-badge')).not.toBeNull()
    expect(q(m.container, '.dsh-recall-composer-attach-name')).toBeNull()
  })

  it('文本清空且无附件 → 发送键禁用，不发 preview', async () => {
    const m = await mount()
    await openEditor(m.container)
    await typeInto(area(m.container), '   ')
    const send = q(m.container, '.dsh-recall-composer-send') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    await click(send)
    await pressEnter(area(m.container))
    await flush()

    expect(m.fetchStub.callsOf('preview').length).toBe(0)
  })
})
