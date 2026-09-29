/**
 * i18n 双语链路组件测试（A4）
 *
 * 与其余组件测试的「不断言文案」纪律相反，本文件**必须**断言文案：A4 的验收
 * 面就是「同一交互在 zh / en 下渲染出对应语言」，语言正确性本身是断言对象。
 * 覆盖两条链：
 * 1. 撤回确认面板——init 下发 locale='en' 时面板/按钮全英文，locale='zh' 时
 *    回中文（这同时钉住「词典取词发生在渲染期」而不是模块加载期）；
 * 2. 配置卡片——语言下拉存在、初值来自 config-get、选中后保存只提交
 *    locale 一个字段（载荷断言，与文案无关的部分）。
 */

import * as React from 'react'
import { act } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildRecallNode } from '../../src/client/recall-node.js'
import { buildConfigForm } from '../../src/client/config-card.js'
import { buildSettingsCards } from '../../src/client/settings-cards.js'
import type { SectionToggleProps } from '../../src/client/config-card.js'
import { makeUtil, makeCtx, stubFetch, stubSessions, stubWorkspaces, stubUiWorkspace, renderIntoDocument, q, qa, qid, first, at, click, chatNode, flush } from './helpers.js'

const PREVIEW_OK = {
  ok: true,
  changes: [{ kind: 'modified', rel: 'a.txt' }],
  total: 1,
  truncated: false,
  treeId: 'tree-1',
  time: 1700000000000,
  cutSeq: 7,
}

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
  document.body.innerHTML = ''
})

function SectionToggle(props: SectionToggleProps): React.ReactNode {
  return React.createElement('button', { type: 'button', onClick: props.onToggle }, props.title)
}

// select 的受控变更：与 helpers.typeInto 同理——必须走原型 setter + 原生
// change 事件，否则 React 的 value tracker 会把直接赋值当无变化吞掉
async function selectOption(el: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  await act(async () => {
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

// 动作按钮按类名取（时间戳那个 span 不带 dsh-recall-action，不会被计入）：
// 与 recall-node.test.ts 的取法一致，[1] 即撤回按钮
function actionButtons(container: HTMLElement): HTMLElement[] {
  return qa(container, '.dsh-recall-actions .dsh-recall-action')
}

async function mountRecall(initConfig: Record<string, unknown>) {
  const fetchStub = stubFetch({
    init: { ok: true, root: 'D:/ws', notice: null, config: Object.assign({ refillDraft: true, archiveOriginal: true }, initConfig) },
    'snapshot-info': { has: true },
    preview: PREVIEW_OK,
  })
  const util = makeUtil()
  const { ctx } = makeCtx()
  const sessions = stubSessions()
  const workspaces = stubWorkspaces()
  const uiWorkspace = stubUiWorkspace()
  const { UserRecallNode } = buildRecallNode(React, util, ctx, sessions.service, workspaces.service, uiWorkspace.service)
  const Node = UserRecallNode as unknown as (props: import('../../src/types/client-contract.js').ChatNodeProps) => React.ReactElement
  const handle = await renderIntoDocument(React.createElement(Node, chatNode()))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return handle.container
}

const CONFIG_VALUES = {
  gcSnaps: 50,
  gcHours: 24,
  maxFileBytes: 104857600,
  maxSnapshotsPerWorkspace: 500,
  baseExcludes: ['node_modules/'],
  refillDraft: true,
  snapshotEnabled: true,
  archiveOriginal: true,
  retentionDays: 0,
  locale: 'auto',
}

describe('i18n：撤回面板随 locale 切换', () => {
  it("init 下发 locale='en' → 确认面板与按钮为英文", async () => {
    const container = await mountRecall({ locale: 'en' })
    await click(at(actionButtons(container), 1))
    await flush()

    const panel = q(container, '.dsh-recall-panel')
    expect(panel?.textContent).toContain('Roll back')
    expect(panel?.textContent).toContain('Files and chat')
    // 两段句子的拼接：英文版第二句带句首空格（实弹发现 'sent.1501 files…' 缺空格）
    expect(panel?.textContent).toContain('sent. 1 files will change')
    expect(at(qa(container, '.dsh-recall-panel-actions .dsh-recall-btn'), 1).textContent).toBe('Roll back')
    // 反向断言：同一面板下不应再出现中文动作词（词表命中，而非回落 host 文案）
    expect(panel?.textContent).not.toContain('确认回退')
  })

  it("init 下发 locale='zh' → 同一交互回中文（显式锁定胜过 navigator）", async () => {
    const container = await mountRecall({ locale: 'zh' })
    await click(at(actionButtons(container), 1))
    await flush()

    const panel = q(container, '.dsh-recall-panel')
    expect(panel?.textContent).toContain('整段回退')
    expect(at(qa(container, '.dsh-recall-panel-actions .dsh-recall-btn'), 1).textContent).toBe('确认回退')
  })
})

describe('i18n：设置卡片换语言的即时一致性', () => {
  // 实弹发现的两处半截切换（F2 外壳折叠头停在挂载时语言 / F3 成功提示用旧语言），
  // 这里用「config-get 回读真实值」的桩把两条链一起钉住
  it('保存 English 后：卡片文案、分区折叠头、成功提示同时为英文（无需重新挂载）', async () => {
    let stored = 'zh'
    const fetchStub = stubFetch({
      'config-get': () => ({
        ok: true,
        values: Object.assign({}, CONFIG_VALUES, { locale: stored }),
        envLocks: {},
        overridden: stored === 'auto' ? {} : { locale: stored },
        writable: true,
      }),
      'config-set': (args: Record<string, unknown>) => {
        const patch = args.patch as { locale?: string } | undefined
        if (patch && patch.locale) stored = patch.locale
        return { ok: true }
      },
    })
    const util = makeUtil()
    const sessions = stubSessions()
    const workspaces = stubWorkspaces()
    const uiWorkspace = stubUiWorkspace()
    const { RecallSettingsCard } = buildSettingsCards(React, util, sessions.service, workspaces.service, uiWorkspace.service)
    const handle = await renderIntoDocument(React.createElement(RecallSettingsCard))
    cleanups.push(handle.unmount, fetchStub.restore)
    await flush()

    // 基线：config-get 下发 locale=zh → 卡片与外壳折叠头都是中文
    expect(handle.container.textContent).toContain('快照管理')

    await selectOption(qid(handle.container, 'dsh-recall-cfg-locale') as HTMLSelectElement, 'en')
    await click(q(handle.container, '.dsh-recall-btn-primary'))
    await flush()

    const text = handle.container.textContent || ''
    expect(text).toContain('Snapshot manager')                 // 外壳折叠头跟随（F2）
    expect(text).toContain('Saved and applied immediately')     // 提示用新语言（F3）
    expect(text).not.toContain('快照管理')
  })
})

describe('i18n：配置卡片的语言下拉', () => {
  it('下拉初值来自 config-get；选中 en 后保存只提交 locale 字段', async () => {
    const fetchStub = stubFetch({ 'config-get': { ok: true, values: CONFIG_VALUES, envLocks: {}, overridden: {}, writable: true }, 'config-set': { ok: true } })
    const util = makeUtil()
    const { ConfigForm } = buildConfigForm(React, util, SectionToggle)
    const handle = await renderIntoDocument(React.createElement(ConfigForm))
    cleanups.push(handle.unmount, fetchStub.restore)
    await flush()

    const select = qid(handle.container, 'dsh-recall-cfg-locale') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe('auto')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['auto', 'zh', 'en'])

    await selectOption(select, 'en')
    await click(q(handle.container, '.dsh-recall-btn-primary'))
    await flush()

    const setCalls = fetchStub.callsOf('config-set')
    expect(setCalls.length).toBe(1)
    expect(first(setCalls).args.patch).toEqual({ locale: 'en' })
  })
})