/**
 * 排除配置卡片组件测试（A1）
 *
 * 覆盖列表拉取的三态（成功 / 失败 / 平台不支持）与单卡编辑链：快捷 chip 与
 * 回车追加、脏标记驱动的保存按钮、保存载荷与失败面。文案不进断言，错误传播
 * 断言 host 载荷原文（如 message: 'boom'）。
 */

import * as React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { buildExcludeCards } from '../../src/client/exclude-card.js'
import { makeUtil, stubFetch, renderIntoDocument, q, qa, first, click, typeInto, pressEnter, flush } from './helpers.js'

const FILES = [{ path: '/home/.dsh/dsh-recall-snapshots/exclude.txt', home: true, roots: ['D:/ws'], content: '# 注释\ndist/\n' }]

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
})

async function mount(routes: Record<string, unknown> = {}): Promise<{
  container: HTMLElement
  fetchStub: ReturnType<typeof stubFetch>
}> {
  const fetchStub = stubFetch(Object.assign({ 'exclude-get': { ok: true, files: FILES } }, routes))
  const util = makeUtil()
  const { ExcludeFilesSection } = buildExcludeCards(React, util)
  const handle = await renderIntoDocument(React.createElement(ExcludeFilesSection))
  cleanups.push(handle.unmount, fetchStub.restore)
  await flush()
  return { container: handle.container, fetchStub }
}

describe('exclude-card 列表拉取', () => {
  it('拉取成功：每个 exclude 文件渲染一张编辑卡（含文本域与路径行）', async () => {
    const { container } = await mount()
    // 外层容器与单卡同名类，按「一卡一文本域」计数
    expect(qa(container, '.dsh-recall-ex-area').length).toBe(1)
    expect(q(container, '.dsh-recall-ex-path')?.textContent).toContain(first(FILES).path)
    expect((q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement).value).toContain('dist/')
  })

  it('文件为空数组 → 空态提示（不渲染编辑卡）', async () => {
    const { container } = await mount({ 'exclude-get': { ok: true, files: [] } })
    expect(qa(container, '.dsh-recall-ex-area').length).toBe(0)
    expect(container.textContent && container.textContent.length).toBeGreaterThan(0)
  })

  it('拉取失败（ok:false）→ 错误态 + 重试按钮；重试再次发请求', async () => {
    const { container, fetchStub } = await mount({ 'exclude-get': { ok: false, message: 'boom-read' } })
    expect(container.textContent).toContain('boom-read')
    expect(qa(container, '.dsh-recall-ex-area').length).toBe(0)

    await click(q(container, '.dsh-recall-panel-actions .dsh-recall-btn'))
    await flush()
    expect(fetchStub.callsOf('exclude-get').length).toBe(2)
    // 第二次仍是失败载荷：错误态保持（重试不吞错）
    expect(container.textContent).toContain('boom-read')
  })

  it('拉取异常（网络错误）→ 同样错误态', async () => {
    const { container } = await mount({ 'exclude-get': new Error('network down') })
    expect(container.textContent).toContain('network down')
  })

  it('平台不支持（unsupported）→ 错误态且不渲染编辑卡', async () => {
    const { container } = await mount({ 'exclude-get': { ok: false, unsupported: true } })
    expect(qa(container, '.dsh-recall-ex-area').length).toBe(0)
    expect(qa(container, '.dsh-recall-panel-actions .dsh-recall-btn').length).toBe(1)
  })
})

describe('exclude-card 编辑与保存', () => {
  it('快捷 chip 追加独占一行的模式；已存在的候选被滤掉', async () => {
    const { container } = await mount()
    const chips = qa(container, '.dsh-recall-ex-chip')
    // content 已含 dist/ → 候选里不再出现同名 chip
    expect(chips.map((c) => c.textContent).indexOf('dist/')).toBe(-1)

    await click(chips[0])
    await flush()
    const area = q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement
    expect(area.value.endsWith('\n')).toBe(true)
    const chipText = String(first(chips).textContent)
    expect(area.value).toContain(chipText)
    expect(area.value.split('\n').filter((l) => l === chipText).length).toBe(1)
  })

  it('输入框回车快速追加，并清空输入框', async () => {
    const { container } = await mount()
    const input = q(container, '.dsh-recall-ex-input') as HTMLInputElement
    await typeInto(input, 'tmp-cache/')
    await flush()
    await pressEnter(q(container, '.dsh-recall-ex-input'))
    await flush()

    const area = q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement
    expect(area.value).toContain('tmp-cache/')
    expect((q(container, '.dsh-recall-ex-input') as HTMLInputElement).value).toBe('')
  })

  it('「添加」按钮与回车等价（快捷区按钮，非面板操作区）', async () => {
    const { container } = await mount()
    await typeInto(q(container, '.dsh-recall-ex-input') as HTMLInputElement, 'from-btn/')
    await flush()
    await click(q(container, '.dsh-recall-ex-quick .dsh-recall-btn'))
    await flush()

    expect((q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement).value).toContain('from-btn/')
  })

  it('无改动时保存按钮禁用；有改动后可点', async () => {
    const { container } = await mount()
    const saveBtn = () => q(container, '.dsh-recall-btn-primary') as HTMLButtonElement
    expect(saveBtn().disabled).toBe(true)

    await typeInto(q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement, 'dist/\nnew-thing/\n')
    await flush()
    expect(saveBtn().disabled).toBe(false)
  })

  it('保存：发 exclude-set（path + 原文），成功后脏标记复位', async () => {
    const { container, fetchStub } = await mount({ 'exclude-set': { ok: true } })
    await typeInto(q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement, 'dist/\nonly-here/\n')
    await flush()
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    const calls = fetchStub.callsOf('exclude-set')
    expect(calls.length).toBe(1)
    expect(first(calls).args.path).toBe(first(FILES).path)
    expect(first(calls).args.content).toBe('dist/\nonly-here/\n')
    expect((q(container, '.dsh-recall-btn-primary') as HTMLButtonElement).disabled).toBe(true)
    expect(q(container, '.dsh-recall-ex-status-success')).not.toBeNull()
  })

  it('保存失败（ok:false）→ 错误态且脏标记保留（可重试）', async () => {
    const { container } = await mount({ 'exclude-set': { ok: false, message: 'boom-save' } })
    await typeInto(q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement, 'x/\n')
    await flush()
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(container.textContent).toContain('boom-save')
    expect((q(container, '.dsh-recall-btn-primary') as HTMLButtonElement).disabled).toBe(false)
  })

  it('保存异常（网络错误）→ 同样错误态', async () => {
    const { container } = await mount({ 'exclude-set': new Error('network down') })
    await typeInto(q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement, 'y/\n')
    await flush()
    await click(q(container, '.dsh-recall-btn-primary'))
    await flush()

    expect(q(container, '.dsh-recall-ex-status-error')).not.toBeNull()
  })

  it('放弃修改：草稿回基线（保存按钮复归禁用）', async () => {
    const { container } = await mount()
    await typeInto(q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement, 'zzz/\n')
    await flush()
    const discard = qa(container, '.dsh-recall-panel-actions .dsh-recall-btn')[0]
    await click(discard)
    await flush()

    expect((q(container, '.dsh-recall-ex-area') as HTMLTextAreaElement).value).toBe(first(FILES).content)
    expect((q(container, '.dsh-recall-btn-primary') as HTMLButtonElement).disabled).toBe(true)
  })
})