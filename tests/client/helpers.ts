/**
 * client 组件测试 helpers（A1）
 *
 * 组件经工厂注入真实 React 与 `buildUtil()`（真 util、真 fetch 链路，网络层由
 * `stubFetch` 接管）——测的是组件逻辑与请求载荷；宿主集成仍归 verify:host 与
 * 活体冒烟，分工不变。`act` 取自 react 18.3 的导出，jsdom 下需显式置
 * `IS_REACT_ACT_ENVIRONMENT` 才无警告。断言纪律（为 A4 i18n 让路）：只断言
 * 行为与结构——className / aria / 调用次数 / 请求载荷——不断言中文案字面量。
 */

import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { buildUtil } from '../../src/client/util.js'
import type { UtilApi } from '../../src/client/util.js'
import type { ChatNodeProps, ClientSessionsService, ClientWorkspacesService, ClientUiWorkspaceService } from '../../src/types/client-contract.js'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

// ---- 渲染 ----

export interface RenderHandle {
  container: HTMLElement
  unmount(): void
}

// 挂载到独立 div 并等 effect/微任务收敛；unmount 走 act 后摘除容器
export async function renderIntoDocument(element: React.ReactNode): Promise<RenderHandle> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element as React.ReactElement) })
  return {
    container,
    unmount(): void {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

// 冲刷一轮微任务（等组件内 promise 链的 setState 落地）
export async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

export function q(container: ParentNode, selector: string): HTMLElement | null {
  return container.querySelector(selector)
}

// 按 id 定位的容器内查询：用属性选择器而非 `#id`——同一测试内挂载两个组件
// 实例时（如「失败后重试」场景）两个容器含相同 id，jsdom 的 `#id` 快速路径
// 先走 document.getElementById 命中第一个实例，验证不在查询子树内即返回
// null、不回退全扫描；属性选择器无此优化，语义与直觉一致。
export function qid(container: ParentNode, id: string): HTMLElement | null {
  return container.querySelector('[id="' + id + '"]')
}

export function qa(container: ParentNode, selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll(selector))
}

// 取首个元素并收窄类型（noUncheckedIndexedAccess 下 `arr[0]` 是 T|undefined）：
// 空数组直接报错，让「本该存在的调用/节点」缺失在断言前就暴露
export function first<T>(arr: readonly T[]): T {
  if (!arr.length) throw new Error('期望至少一个元素，实际为空')
  return arr[0] as T
}

// 取第 i 个元素并收窄（同上的越界保护）
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error('期望第 ' + i + ' 个元素，实际越界')
  return v
}

export function text(el: Element | null | undefined): string {
  return el ? String(el.textContent || '') : ''
}

// React 18 的事件委托挂在 root 容器上——DOM 原生事件冒泡即触发合成处理器
export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('click 目标不存在（选择器未命中）')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

// 受控输入：必须走原型上的原生 setter 再派发 input，React 的 value tracker
// 才会把这次变更当作真实用户输入（直接赋 el.value 会被去重吞掉）。setter
// 按元素类型二选一——textarea 用 HTMLInputElement 的 setter 会抛
// 「not a valid instance of HTMLInputElement」。
export async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  await act(async () => {
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// 键盘：Enter 提交是若干输入框的既有交互（快速追加 / 面板默认动作）
export async function pressEnter(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('pressEnter 目标不存在')
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
}

// ---- 网络 ----

export interface FetchCall {
  name: string
  args: Record<string, unknown>
}

export interface FetchStub {
  calls: FetchCall[]
  callsOf(name: string): FetchCall[]
  restore(): void
}

// 默认路由：init 成功（组件挂载期的 ensureInit 必经）——要覆盖失败路径时
// 在 routes 里显式给同名字段即可
export const DEFAULT_ROUTES: Record<string, unknown> = {
  init: { ok: true, root: 'D:/ws', notice: null, config: { refillDraft: true, archiveOriginal: true } },
}

// 按 /api/recall/<name> 分派应答；route 值可以是对象（直接返回）或函数
// （按请求 args 现算，也可抛错以模拟网络失败）
export function stubFetch(routes: Record<string, unknown | ((args: Record<string, unknown>) => unknown)> = {}): FetchStub {
  const merged: Record<string, unknown | ((args: Record<string, unknown>) => unknown)> = Object.assign({}, DEFAULT_ROUTES, routes)
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const name = url.split('/api/recall/')[1]?.split(/[?#]/)[0] ?? ''
    let args: Record<string, unknown> = {}
    try {
      args = init && typeof init.body === 'string' && init.body ? JSON.parse(init.body) as Record<string, unknown> : {}
    } catch (error) {
      // body 非 JSON（组件不会这么发）：按空参数记录，避免测试工具自己抛错
      args = {}
    }
    calls.push({ name, args })
    const route = merged[name]
    const value = typeof route === 'function' ? (route as (a: Record<string, unknown>) => unknown)(args) : route
    if (value instanceof Error) throw value
    return { json: async () => value } as Response
  }) as typeof fetch
  return {
    calls,
    callsOf: (name: string) => calls.filter((c) => c.name === name),
    restore: () => { globalThis.fetch = original },
  }
}

export function makeUtil(overrides: Partial<UtilApi> = {}): UtilApi {
  return Object.assign(buildUtil(), overrides)
}

// ctx 桩：只有 get('conversation') 被撤回节点消费（草稿回填通道）；其余服务
// 走属性访问（guard facade 语义由 verify:host 与冒烟覆盖，组件层直接给实现）
export interface CtxStub {
  ctx: import('../../src/types/client-contract.js').ClientContext
  drafts: string[]
}
export function makeCtx(): CtxStub {
  const drafts: string[] = []
  const conversation = {
    input: { shell: () => ({ actions: { setDraft: (text: string) => { drafts.push(text) } } }) },
  }
  const ctx = {
    slots: { inject: () => undefined, register: () => undefined, entries: () => [] },
    sessions: {},
    workspaces: {},
    uiWorkspace: {},
    timer: { timeout: (fn: () => void, ms: number) => setTimeout(fn, ms) },
    get: <T = unknown>(name: string): T | undefined => (name === 'conversation' ? conversation as T : undefined),
  } as unknown as import('../../src/types/client-contract.js').ClientContext
  return { ctx, drafts }
}

// ---- 服务桩 ----

export interface SessionsStub {
  service: ClientSessionsService
  forks: Array<{ sessionId: string; atSeq?: number }>
  queueRemovals: string[]
}

export function stubSessions(opts: { childId?: string; byId?: Record<string, unknown> } = {}): SessionsStub {
  const forks: Array<{ sessionId: string; atSeq?: number }> = []
  const queueRemovals: string[] = []
  const service: ClientSessionsService = {
    fork: async (o) => { forks.push({ sessionId: o.sessionId, atSeq: o.atSeq }); return opts.childId ?? 'child-1' },
    open: () => undefined,
    list: { getSnapshot: () => ({ byId: opts.byId ?? {} }) },
    binding: () => ({ session: { updateQueue: async (itemId: string) => { queueRemovals.push(itemId) } } }),
  }
  return { service, forks, queueRemovals }
}

export interface WorkspacesStub {
  service: ClientWorkspacesService
  archived: Array<{ sessionId: string; stopActivity?: boolean }>
}

export function stubWorkspaces(opts: { archivedSessionIds?: readonly string[] } = {}): WorkspacesStub {
  const archived: Array<{ sessionId: string; stopActivity?: boolean }> = []
  const service: ClientWorkspacesService = {
    archiveSession: async (sessionId: string, options?: { stopActivity?: boolean }) => { archived.push({ sessionId, stopActivity: options && options.stopActivity }); return {} },
    list: { getSnapshot: () => ({ archivedSessionIds: opts.archivedSessionIds ?? [] }) },
  }
  return { service, archived }
}

export interface UiWorkspaceStub {
  service: ClientUiWorkspaceService
  opened: string[]
}

export function stubUiWorkspace(): UiWorkspaceStub {
  const opened: string[] = []
  const service: ClientUiWorkspaceService = {
    openSession: (sessionId: string) => { opened.push(sessionId) },
    archiveSession: async () => ({}),
    unarchiveSession: async () => ({}),
  }
  return { service, opened }
}

// ---- 日志 ----

export interface LogSpy {
  entries: Array<{ level: string; args: unknown[] }>
  dispose(): void
}

// 拦 console 四级别（logger 的输出面）；断言日志内容时配合
// localStorage.setItem('dsh-recall.debug', '*') 打开 info/debug 通道
export function spyLogger(): LogSpy {
  const entries: Array<{ level: string; args: unknown[] }> = []
  const levels = ['error', 'warn', 'info', 'debug'] as const
  const originals: Record<string, (...args: unknown[]) => void> = {}
  for (const level of levels) {
    originals[level] = console[level] as (...args: unknown[]) => void
    console[level] = (...args: unknown[]) => { entries.push({ level, args }) }
  }
  return {
    entries,
    dispose: () => {
      for (const level of levels) console[level] = originals[level] as typeof console[typeof level]
    },
  }
}

// ---- 组件 props ----

export function chatNode(overrides: Partial<ChatNodeProps> = {}): ChatNodeProps {
  return Object.assign({
    node: { id: 'm1', key: 'm1', kind: 'user', data: { content: [{ type: 'text', text: 'hello' }], time: Date.now() } },
    sessionId: 's1',
  }, overrides)
}