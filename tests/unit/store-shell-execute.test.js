/**
 * 官方执行通道双代分流单测（0.1.7 shell 接缝）
 *
 * 背景：0.1.7 删掉 ShellExecutor.run/start，改为 resolve + execute(spec) 返回
 * 句柄、前台结果走 handle.result()；POSIX 上旧调用必然 TypeError，撤回全链
 * 死亡。修法是按运行时方法探测分流（store.ts runViaExecutor），两代共存。
 * 本文件覆盖三段：
 * 1) runViaExecutor 纯分流：旧通道只调 run、新通道 await result()、两代都缺时
 *    响亮报错、result() reject 原样上抛（与旧通道 run reject 同语义）；
 * 2) createRuntime 端到端：两分支的 stdout.truncated 透传一致；
 * 3) 失败分级：exitCode === null 无 stderr → 超时文案；有 stderr / 非零退出 →
 *    回显 stderr 原文（含退出码兜底）。
 *
 * 第 3 段与「新面在 POSIX 上也走得通」都靠 process.platform 改写覆盖（结束即
 * 还原），ubuntu CI 因此能跑到 linux 分支——那正是本轮最高优先级的失败面。
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { runViaExecutor, createRuntime, SHELL_PROBE_COMMAND, SHELL_PROBE_SENTINEL } from '../../src/host/store.js'

// ---- 假执行器：两代面各自独立构造 ----

// 旧代（≤0.1.6）：只有 run
function makeLegacyShell(reply) {
  const calls = { run: [], execute: [] }
  return {
    calls,
    shell: {
      resolve: (spec) => spec,
      run: async (spec) => { calls.run.push(spec); return reply(spec) },
    },
  }
}

// 新代（≥0.1.7）：只有 execute + 句柄 result()
function makeModernShell(reply) {
  const calls = { run: [], execute: [], result: 0 }
  return {
    calls,
    shell: {
      resolve: (spec) => spec,
      execute: async (spec) => {
        calls.execute.push(spec)
        return {
          result: async () => { calls.result += 1; return reply(spec) },
        }
      },
    },
  }
}

const OK_REPLY = () => ({ exitCode: 0, stdout: { text: 'ok', truncated: false }, stderr: { text: '' } })

describe('runViaExecutor（执行通道分流）', () => {
  it('① 旧执行器（只有 run）走旧通道，不触碰 execute', async () => {
    const { shell, calls } = makeLegacyShell(OK_REPLY)
    const res = await runViaExecutor(shell, { command: 'git status' })
    expect(res.exitCode).toBe(0)
    expect(res.stdout.text).toBe('ok')
    expect(calls.run.length).toBe(1)
    expect(calls.execute.length).toBe(0)
  })

  it('② 新执行器（只有 execute）走新通道，spec 逐字透传且 result() 被 await', async () => {
    const { shell, calls } = makeModernShell(OK_REPLY)
    const spec = { command: 'git status', timeoutMs: 1234, stdoutMaxBytes: 4096, stdin: 'body' }
    const res = await runViaExecutor(shell, spec)
    expect(res.stdout.text).toBe('ok')
    expect(calls.execute.length).toBe(1)
    expect(calls.execute[0]).toBe(spec) // 同一对象：helper 不重建 spec
    expect(calls.result).toBe(1)
    expect(calls.run.length).toBe(0)
  })

  it('两代都缺 → 响亮报错（不静默当成功）', async () => {
    await expect(runViaExecutor({ resolve: (spec) => spec }, { command: 'git status' }))
      .rejects.toThrow('未提供 run 也未提供 execute')
  })

  it('③ result() reject（基础设施失败）原样上抛，与旧通道 run reject 同语义', async () => {
    const { shell } = makeModernShell(() => { throw new Error('spawn ENOENT') })
    await expect(runViaExecutor(shell, { command: 'git status' })).rejects.toThrow('spawn ENOENT')

    const legacy = makeLegacyShell(() => { throw new Error('spawn ENOENT') })
    await expect(runViaExecutor(legacy.shell, { command: 'git status' })).rejects.toThrow('spawn ENOENT')
  })
})

// ---- createRuntime 端到端：分流接线 + 失败分级 ----

const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

function makeCtx(shell) {
  return { shell, sessions: { list: () => [] }, get: () => null }
}

function makeRuntime(shell) {
  return createRuntime(makeCtx(shell), { baseExcludes: [] })
}

describe('createRuntime 双通道（截断透传与失败分级）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (REAL_PLATFORM) Object.defineProperty(process, 'platform', REAL_PLATFORM)
  })

  it('⑤ 两分支 stdout 文本与 truncated 透传一致（runShellMeta 语义不变）', async () => {
    setPlatform('linux')
    const truncated = () => ({ exitCode: 0, stdout: { text: 'tail', truncated: true }, stderr: { text: '' } })
    const legacy = makeRuntime(makeLegacyShell(truncated).shell)
    const modern = makeRuntime(makeModernShell(truncated).shell)

    expect(await legacy.runShellMeta('echo hi')).toEqual({ text: 'tail', truncated: true })
    expect(await modern.runShellMeta('echo hi')).toEqual({ text: 'tail', truncated: true })
    expect(await legacy.runShell('echo hi')).toBe('tail')
    expect(await modern.runShell('echo hi')).toBe('tail')
  })

  it('新面在 POSIX 上走得通（本轮硬指标：旧调用在此必然 TypeError）', async () => {
    setPlatform('linux')
    const { shell, calls } = makeModernShell(OK_REPLY)
    const rt = makeRuntime(shell)
    expect(await rt.runShell('git status')).toBe('ok')
    expect(calls.execute.length).toBe(1)
    expect(calls.result).toBe(1)
    // 无方言探针（POSIX 不探测），也不许触达自建直连通道
    expect(calls.execute[0].command.indexOf('RCL_DIALECT_PROBE')).toBeLessThan(0)
  })

  it('④ exitCode === null 且无 stderr → 归类为准备期超时（文案含「超时」）', async () => {
    setPlatform('linux')
    const { shell } = makeModernShell(() => ({ exitCode: null, stdout: { text: '' }, stderr: { text: '   ' } }))
    await expect(makeRuntime(shell).runShell('git status'))
      .rejects.toThrow('命令准备期超时（300000ms，执行器未产出输出）')
  })

  it('④ 非零退出 → 回显 stderr 原文；无 stderr 时带退出码兜底（不误报超时）', async () => {
    setPlatform('linux')
    const withStderr = makeModernShell(() => ({ exitCode: 128, stdout: { text: '' }, stderr: { text: 'fatal: boom' } }))
    await expect(makeRuntime(withStderr.shell).runShell('git status')).rejects.toThrow('fatal: boom')

    // null + 有 stderr：信号终止之类的形态，按非零退出处理而不是吞成「超时」
    const nullWithStderr = makeModernShell(() => ({ exitCode: null, stdout: { text: '' }, stderr: { text: 'killed by signal' } }))
    await expect(makeRuntime(nullWithStderr.shell).runShell('git status')).rejects.toThrow('killed by signal')

    const silent = makeModernShell(() => ({ exitCode: 3, stdout: { text: '' }, stderr: { text: '' } }))
    await expect(makeRuntime(silent.shell).runShell('git status')).rejects.toThrow('exit 3')
  })

  it('timedOut first-cause 标记在场时按超时归类（即使带了 stderr）', async () => {
    setPlatform('linux')
    const { shell } = makeModernShell(() => ({ exitCode: null, stdout: { text: '' }, stderr: { text: 'killed' }, timedOut: true }))
    await expect(makeRuntime(shell).runShell('git status')).rejects.toThrow('命令准备期超时')
  })

  it('win32 新面：方言探针经 execute().result() 判成 pwsh，命令走官方通道', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setPlatform('win32')
    const { shell, calls } = makeModernShell((spec) => (
      spec.command === SHELL_PROBE_COMMAND
        ? { exitCode: 0, stdout: { text: SHELL_PROBE_SENTINEL + '\n' }, stderr: { text: '' } }
        : OK_REPLY()
    ))
    const rt = makeRuntime(shell)
    expect(await rt.runShell('echo hi')).toBe('ok')
    expect(rt.state.shellDialect).toBe('pwsh')
    expect(calls.execute.length).toBe(2) // 探针 1 次 + 命令 1 次，都经新面
    expect(calls.result).toBe(2)
  })
})
