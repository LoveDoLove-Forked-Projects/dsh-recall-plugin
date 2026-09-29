/**
 * 命名空间 logger 测试（A5）
 *
 * 钉住验收语义：error/warn 恒输出（降级路径最低保底）；info/debug 由
 * localStorage['dsh-recall.debug'] 开关按命名空间过滤、每次调用重读（改开关
 * 即生效，无需重启）；localStorage 不可用（隐私模式等）时静默降级，绝不因
 * 日志抛错。
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { createLogger, appLog, recallNodeLog } from '../../src/client/log.js'
import { spyLogger, first, at } from './helpers.js'
import type { LogSpy } from './helpers.js'

let spies: LogSpy[] = []
afterEach(() => {
  for (const s of spies) s.dispose()
  spies = []
  localStorage.clear()
  vi.restoreAllMocks()
})

function capture(): LogSpy {
  const spy = spyLogger()
  spies.push(spy)
  return spy
}

describe('client 命名空间 logger', () => {
  it('error / warn 恒输出（无开关也出），前缀为 [dsh-recall:<ns>]', () => {
    const spy = capture()
    const log = createLogger('app')
    log.error('boom')
    log.warn('careful')

    expect(spy.entries.length).toBe(2)
    expect(first(spy.entries).level).toBe('error')
    expect(first(first(spy.entries).args)).toBe('[dsh-recall:app]')
    expect(at(spy.entries, 1).level).toBe('warn')
  })

  it('info / debug 默认静默（不给用户控制台刷噪音）', () => {
    const spy = capture()
    createLogger('app').info('hello')
    createLogger('app').debug('trace')

    expect(spy.entries.length).toBe(0)
  })

  it("开关 '*' 全开：info / debug 可见", () => {
    localStorage.setItem('dsh-recall.debug', '*')
    const spy = capture()
    const log = createLogger('app')
    log.info('hello')
    log.debug('trace')

    expect(spy.entries.map((e) => e.level)).toEqual(['info', 'debug'])
  })

  it('按命名空间精确过滤：只开 app 时 recall-node 仍静默', () => {
    localStorage.setItem('dsh-recall.debug', 'app')
    const spy = capture()
    appLog.info('visible')
    recallNodeLog.info('hidden')

    expect(spy.entries.length).toBe(1)
    expect(first(first(spy.entries).args)).toBe('[dsh-recall:app]')
  })

  it('逗号分隔多命名空间与空格容忍', () => {
    localStorage.setItem('dsh-recall.debug', 'other, recall-node')
    const spy = capture()
    appLog.info('hidden')
    recallNodeLog.info('visible')

    expect(spy.entries.length).toBe(1)
    expect(first(first(spy.entries).args)).toBe('[dsh-recall:recall-node]')
  })

  it('每次调用重读开关：删除后 info 立即隐藏（无需重启）', () => {
    const spy = capture()
    localStorage.setItem('dsh-recall.debug', '*')
    appLog.info('on')
    localStorage.removeItem('dsh-recall.debug')
    appLog.info('off')

    expect(spy.entries.length).toBe(1)
    expect(at(first(spy.entries).args, 1)).toBe('on')
  })

  it('localStorage 不可用（getItem 抛错）→ 降级为只出 error/warn，不抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const spy = capture()
    const log = createLogger('app')

    expect(() => log.info('hello')).not.toThrow()
    log.error('boom')

    expect(spy.entries.length).toBe(1)
    expect(first(spy.entries).level).toBe('error')
  })
})