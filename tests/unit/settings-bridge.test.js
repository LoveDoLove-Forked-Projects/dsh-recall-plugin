/**
 * settings 接缝双代桥接单测（0.1.7 SettingsForms）
 *
 * 背景：0.1.7 把 dsh-settings 换成 SettingsForms，旧注册入口
 * （installSettingsSection/installSection/register）全树移除，配置所有权移到
 * profile——ns 变成 profile entry id（本机实测 'recall'）、可写字段必须带
 * schemastery .volatile() 声明、热更经 loader/volatile-update。本文件覆盖：
 * 1) withVolatile 的 feature-detect（3.18.2 无 .volatile()，直调即模块加载崩）；
 * 2) 两代面判据与 ns 解析（含 apply 期 describe 看不到自身时的构造性回退）；
 * 3) unwrapConfig 解 Volatile ref（不解会把配置读成默认值）；
 * 4) routes 级：config-get/set/reset 在两种面下都用解析出的 ns，ns 缺失时按
 *    RECALL_SETTINGS_UNAVAILABLE 报逃生口文案；
 * 5) 接线级：installSettingsNamespace 三条旧面注册路径收到的 entry 必须是解过
 *    volatile ref 的普通值（c3cc8a7 回归钉——该缺陷曾从全部 CI 门禁漏出，靠
 *    M5-5 降级实弹才抓到）。
 *
 * 说明：本文件不 import host/index.js——它裸导入 '@deepseek-ai/dsh-settings'
 * （私有 peer，CI 不装）。接线逻辑住 src/host/settings-bridge.ts（dshSettings
 * 参数注入，不依赖该包），本文件直接 import 它覆盖注册路径；index.ts 的
 * 装配级分派仍由 verify-host 门禁覆盖（M3-2 的「只给新面也必须装配成功」断言）。
 */

import { describe, it, expect } from 'vitest'
import {
  withVolatile,
  isLegacySettingsFace,
  resolveSettingsNs,
  unwrapConfig,
  Config,
  DEFAULTS,
} from '../../src/host/config.js'
import { installSettingsNamespace } from '../../src/host/settings-bridge.js'
import { createRoutesManage } from '../../src/host/routes-manage.js'
import * as E from '../../src/host/errors.js'

// ---- 两代 settings 桩 ----

// 0.1.7 新面：只有 describe/update/replace/mutate/configure，无自建 ns 入口
function makeModernSettings({ ns = 'recall', describeList, update, replace } = {}) {
  return {
    describe: () => (describeList ? describeList() : [{ ns, user: { gcSnaps: 7 }, writable: true }]),
    update: update || (async () => {}),
    replace: replace || (async () => {}),
    writable: true,
  }
}

// ≤0.1.6 旧面：installSection 注册出的 namespace 才是 ns
function makeLegacySettings({ ns = 'dsh-recall' } = {}) {
  const installs = []
  return {
    installs,
    settings: {
      installSection: (owner, installedNs) => installs.push(installedNs),
      describe: () => [{ ns, user: { gcSnaps: 9 } }],
      update: async () => {},
    },
  }
}

const FIBER = { entry: { id: 'include:recall', options: { id: 'recall' } } }

describe('withVolatile（schemastery .volatile() feature-detect）', () => {
  it('字段带 volatile() → 调用并返回其产物（新 dsh 上标成可编辑字段）', () => {
    let called = 0
    const field = { volatile() { called += 1; return { wrapped: true } } }
    expect(withVolatile(field)).toEqual({ wrapped: true })
    expect(called).toBe(1)
  })

  it('字段无 volatile()（schemastery ≤3.18.2）→ 原样返回，不抛不炸', () => {
    const field = { default: () => field }
    expect(withVolatile(field)).toBe(field)
  })
})

describe('isLegacySettingsFace（两代面判据）', () => {
  it('旧面：installSection / register 任一在位即旧面', () => {
    expect(isLegacySettingsFace(makeLegacySettings().settings)).toBe(true)
    expect(isLegacySettingsFace({ register: () => {} })).toBe(true)
  })

  it('新面：describe/update/replace 齐全但两个注册入口都缺席 → 非旧面', () => {
    expect(isLegacySettingsFace(makeModernSettings())).toBe(false)
  })

  it('服务缺席 → 非旧面（不误判）', () => {
    expect(isLegacySettingsFace(null)).toBe(false)
    expect(isLegacySettingsFace(undefined)).toBe(false)
  })
})

describe('resolveSettingsNs（ns = profile entry id 优先）', () => {
  it('options.id 命中 describe → 用 options.id（0.1.7 真机形态：recall）', () => {
    expect(resolveSettingsNs({ fiber: FIBER }, makeModernSettings())).toBe('recall')
  })

  it('apply 期 describe 看不到自身（fiber 未 ACTIVE）→ 回退 options.id', () => {
    const settings = makeModernSettings({ describeList: () => [] })
    expect(resolveSettingsNs({ fiber: FIBER }, settings)).toBe('recall')
  })

  it('describe 只报全 id 时用 entry.id（降级候选，不为单一形态赌死）', () => {
    const settings = makeModernSettings({ describeList: () => [{ ns: 'include:recall' }] })
    expect(resolveSettingsNs({ fiber: FIBER }, settings)).toBe('include:recall')
  })

  it('旧面：候选含历史字面量 dsh-recall，按 describe 交集命中', () => {
    expect(resolveSettingsNs({ fiber: FIBER }, makeLegacySettings().settings)).toBe('dsh-recall')
  })

  it('旧面 + entry 在位但 describe 未列出（注册未就绪）→ 仍回 dsh-recall，不误用 options.id', () => {
    // 生产形态：0.1.6 上 entry（profile 行）与 ns 无关，ns 是插件注册时给的字面量。
    // 这条钉住「回退按面分叉」——若回退取 options.id，0.1.6 上会拿新面的键去写旧面注册表。
    const legacy = makeLegacySettings()
    legacy.settings.describe = () => []
    expect(resolveSettingsNs({ fiber: FIBER }, legacy.settings)).toBe('dsh-recall')
  })

  it('无 entry 且非旧面 → null（无任何可寻址条目，宁可报不可用也不猜）', () => {
    expect(resolveSettingsNs({}, makeModernSettings())).toBe(null)
    expect(resolveSettingsNs(null, makeModernSettings())).toBe(null)
  })

  it('无 entry 但旧面 → dsh-recall（≤0.1.6 的 ns 与 Loader 无关）', () => {
    expect(resolveSettingsNs({}, makeLegacySettings().settings)).toBe('dsh-recall')
  })

  it('describe 抛错 → 回退候选，不把异常抛给调用方', () => {
    const settings = makeModernSettings({ describeList: () => { throw new Error('boom') } })
    expect(resolveSettingsNs({ fiber: FIBER }, settings)).toBe('recall')
  })
})

describe('unwrapConfig（Volatile ref 取值收口）', () => {
  const ref = (value) => ({ get: () => value })

  it('Volatile 字段取 .get()（不解会把数字读成对象）', () => {
    expect(unwrapConfig({ gcSnaps: ref(50), refillDraft: ref(false) })).toEqual({ gcSnaps: 50, refillDraft: false })
  })

  it('普通值原样透传（旧面 resolved 配置无 ref）', () => {
    expect(unwrapConfig({ gcSnaps: 7, baseExcludes: ['a'] })).toEqual({ gcSnaps: 7, baseExcludes: ['a'] })
  })

  it('数组逐元素解一层；数组内的 ref 也解', () => {
    expect(unwrapConfig({ baseExcludes: ref(['a', 'b']) })).toEqual({ baseExcludes: ['a', 'b'] })
    expect(unwrapConfig({ list: [ref(1), 2] })).toEqual({ list: [1, 2] })
  })

  it('嵌套 plain object 逐属性解一层，不向下递归', () => {
    expect(unwrapConfig({ outer: { inner: ref(1) } })).toEqual({ outer: { inner: 1 } })
  })

  it('非对象输入 → 空对象（不抛）', () => {
    expect(unwrapConfig(null)).toEqual({})
    expect(unwrapConfig('x')).toEqual({})
  })

  it('解出的值能过 createConfig 的字段校验（端到端：ref 不再回退默认值）', () => {
    const raw = unwrapConfig({ gcSnaps: ref(9), refillDraft: ref(false), maxSnapshotsPerWorkspace: ref(3) })
    expect(raw.gcSnaps).toBe(9)
    expect(raw.refillDraft).toBe(false)
    expect(raw.maxSnapshotsPerWorkspace).toBe(3)
  })
})

// ---- 接线级：旧面注册 entry 解 volatile ref（c3cc8a7 回归钉）----

// 复刻 M5-5 降级现场：schemastery ≥3.18.3 下 loader 把 volatile 标记字段解析成
// Volatile ref 后才交给 apply（与 settings 面无关——0.1.6 旧面 DSH 同样拿到 ref）
const ref = (value) => ({ get: () => value })
const refConfig = () => ({
  gcSnaps: ref(9),
  refillDraft: ref(false),
  maxSnapshotsPerWorkspace: ref(3),
})
const plainEntry = { gcSnaps: 9, refillDraft: false, maxSnapshotsPerWorkspace: 3 }

// ctx 桩：inject 立即执行回调（cordis 可选注入就绪形态）；on 收集事件监听；
// effect 立即执行并把返回值留作 disposer（cordis effect 语义）
function makeHostCtx({ settings } = {}) {
  const effects = []
  const listeners = {}
  const ctx = {
    // 复刻 cordis fiber.entry 增补（0.1.7 起 apply 期可读）——新面 ns 解析读 options.id
    fiber: { entry: FIBER.entry },
    inject(names, cb) { cb({ settings, effect: (fn) => effects.push(fn()) }) },
    on(event, listener) { (listeners[event] = listeners[event] || []).push(listener) },
  }
  return { ctx, effects, listeners }
}

// hooks 桩：setSource 记活绑定、onChange 触发时读当前 source——复刻 index.ts
// 的 settingsHooks 语义（applied 与 applyResolvedConfig 共用一个数组，断言时序）
function makeHooks() {
  let source = null
  const applied = []
  return {
    hooks: {
      setSource: (fn) => { source = fn },
      onChange: () => applied.push(source ? source() : undefined),
    },
    applied,
  }
}

function makeDeps({ dshSettings = {}, settings, config, recordError = () => {} } = {}) {
  const { ctx, effects, listeners } = makeHostCtx({ settings })
  const { hooks, applied } = makeHooks()
  const deps = {
    ctx,
    dshSettings,
    config: config ?? refConfig(),
    settingsHooks: hooks,
    applyResolvedConfig: (value) => applied.push(value),
    recordError,
  }
  return { deps, effects, listeners, applied }
}

describe('installSettingsNamespace（旧面注册 entry 解 volatile ref——c3cc8a7 回归钉）', () => {
  it('路径 1（独立函数在位）：installSettingsSection 收到解过 ref 的普通 entry', () => {
    const got = []
    const { deps } = makeDeps({ dshSettings: { installSettingsSection: (...args) => got.push(args) } })
    installSettingsNamespace(deps)
    expect(got).toHaveLength(1)
    const [owner, ns, schema, entry, hooks] = got[0]
    expect(ns).toBe('dsh-recall')
    expect(schema).toBe(Config)
    // 回归锚点：entry 逐字段是普通值——接线若丢掉 unwrapConfig，字段是 { get }
    // 对象，toEqual 即红（真实后果是旧 provider schema 校验入口抛、ns 永不注册）
    expect(entry).toEqual(plainEntry)
    expect(hooks).toBe(deps.settingsHooks)
  })

  it('路径 2（服务方法面 0.1.2-alpha.2+）：installSection 收到普通 entry，hooks 接通', () => {
    const got = []
    const settings = {
      installSection: (owner, ns, schema, entry, hooks) => got.push({ ns, entry, hooks }),
      describe: () => [{ ns: 'dsh-recall' }],
      update: async () => {},
    }
    const { deps } = makeDeps({ settings })
    installSettingsNamespace(deps)
    expect(got).toHaveLength(1)
    expect(got[0].ns).toBe('dsh-recall')
    expect(got[0].entry).toEqual(plainEntry)
    expect(got[0].hooks).toBe(deps.settingsHooks)
  })

  it('路径 3（register 核心 API 0.1.1-rc.2-）：base 是普通 entry；卸载回退 legacyEntry', () => {
    const got = []
    const watchFns = []
    let scopeValue = { gcSnaps: 7 }
    const settings = {
      register: (ns, schema, options) => {
        got.push({ ns, schema, options })
        return { get: () => scopeValue, watch: (fn) => watchFns.push(fn) }
      },
      describe: () => [{ ns: 'dsh-recall' }],
      update: async () => {},
    }
    const { deps, applied, effects } = makeDeps({ settings })
    installSettingsNamespace(deps)
    expect(got).toHaveLength(1)
    expect(got[0].ns).toBe('dsh-recall')
    // base 必须是解过 ref 的普通值（M5-5 现场：ref 进 register 的 schema 校验即抛）
    expect(got[0].options.base).toEqual(plainEntry)
    // 注册期语义：source 指向 scope、onChange 先触发一次（读到 scope 值）、watch 已挂
    expect(applied).toEqual([{ gcSnaps: 7 }])
    expect(watchFns).toHaveLength(1)
    // 卸载语义：effect disposer 把 source 回退到 legacyEntry（同样解过 ref）再触发
    expect(effects).toHaveLength(1)
    scopeValue = undefined
    effects[0]()
    expect(applied[1]).toEqual(plainEntry)
  })

  it('新面（无旧注册入口）：不注册 namespace，volatile-update 重读入口 config', () => {
    const { deps, listeners, applied } = makeDeps({ settings: makeModernSettings() })
    installSettingsNamespace(deps)
    expect(listeners['loader/volatile-update']).toHaveLength(1)
    // ref 形态的 config 原样交给 applyResolvedConfig：读同一批 ref 是有意设计，
    // 解 ref 是 applyResolvedConfig 自己的事（index.ts / settings-bridge 各司其职）。
    // 断引用相等而非深比较——{ get } 是闭包，跨实例深比较必假红。
    listeners['loader/volatile-update'][0]()
    expect(applied).toHaveLength(1)
    expect(applied[0]).toBe(deps.config)
  })

  it('接线抛错 → recordError 收到 skip 文案（catch 兜底，不让装配炸）', () => {
    const errors = []
    const { deps } = makeDeps({
      dshSettings: { installSettingsSection: () => { throw new Error('boom') } },
      recordError: (message) => errors.push(message),
    })
    installSettingsNamespace(deps)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('recall settings namespace skipped')
    expect(errors[0]).toContain('boom')
  })
})

// ---- routes 级：两种面都用解析出的 ns ----

function makeRoutes(settings, fiber) {
  const calls = { update: [], replace: [], applied: [] }
  const ctx = {
    fiber,
    get: (name) => (name === 'settings' ? settings : null),
  }
  const routes = createRoutesManage({
    ctx,
    cfg: Object.assign({}, DEFAULTS, { baseExcludes: [] }),
    supported: true,
    E,
    DEFAULTS,
    applyResolvedConfig: (value) => calls.applied.push(value),
    readSettings: () => ({}),
    // 只被 manage 路径消费，这里仅满足装配期的解构（配置端点不读会话信息）
    sessionInfo: {
      sessionTitles: new Map(),
      messageTexts: new Map(),
      liveTitleFast: () => null,
      liveMessageTextFast: () => null,
    },
  })
  return { routes, calls }
}

describe('config-get/set/reset（ns 解析贯通）', () => {
  it('新面：读 overridden、写 update/replace 全走 options.id（recall）', async () => {
    const calls = { update: [], replace: [] }
    const settings = makeModernSettings({
      update: async (...args) => calls.update.push(args),
      replace: async (...args) => calls.replace.push(args),
    })
    const { routes } = makeRoutes(settings, FIBER)

    const got = await routes['config-get']()
    expect(got.overridden).toEqual({ gcSnaps: 7 })
    expect(got.writable).toBe(true)

    expect(await routes['config-set']({ patch: { gcSnaps: 11 } })).toEqual({ ok: true })
    expect(calls.update).toEqual([['recall', { gcSnaps: 11 }]])

    expect(await routes['config-reset']()).toEqual({ ok: true })
    expect(calls.replace).toEqual([['recall', {}]])
  })

  it('旧面：同一套端点走注册出的 namespace（dsh-recall）', async () => {
    const calls = { update: [], replace: [] }
    const legacy = makeLegacySettings()
    legacy.settings.update = async (...args) => calls.update.push(args)
    legacy.settings.replace = async (...args) => calls.replace.push(args)
    const { routes } = makeRoutes(legacy.settings, FIBER)

    const got = await routes['config-get']()
    expect(got.overridden).toEqual({ gcSnaps: 9 })

    expect(await routes['config-set']({ patch: { gcHours: 5 } })).toEqual({ ok: true })
    expect(calls.update).toEqual([['dsh-recall', { gcHours: 5 }]])

    expect(await routes['config-reset']()).toEqual({ ok: true })
    expect(calls.replace).toEqual([['dsh-recall', {}]])
  })

  it('ns 缺失（新面但无 entry）→ UNAVAILABLE 且文案保留逃生口', async () => {
    const { routes } = makeRoutes(makeModernSettings(), {})
    for (const res of [await routes['config-set']({ patch: { gcSnaps: 1 } }), await routes['config-reset']()]) {
      expect(res.ok).toBe(false)
      expect(res.code).toBe(E.RECALL_SETTINGS_UNAVAILABLE)
      expect(res.message).toContain('cordis.patch.yml')
    }
  })

  it('设置服务缺席 → UNAVAILABLE（与 ns 缺失同一出口）', async () => {
    const { routes } = makeRoutes(null, FIBER)
    expect((await routes['config-set']({ patch: { gcSnaps: 1 } })).code).toBe(E.RECALL_SETTINGS_UNAVAILABLE)
    expect((await routes['config-reset']()).code).toBe(E.RECALL_SETTINGS_UNAVAILABLE)
    // 读侧不报错：resolved 值照常返回，只是无 overridden
    const got = await routes['config-get']()
    expect(got.ok).toBe(true)
    expect(got.overridden).toEqual({})
  })

  it('新面写入报错（官方 No configurable plugin entry）→ WRITE_FAILED 透传原因', async () => {
    const settings = makeModernSettings({
      update: async () => { throw new Error('No configurable plugin entry "recall"') },
    })
    const { routes } = makeRoutes(settings, FIBER)
    const res = await routes['config-set']({ patch: { gcSnaps: 1 } })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(E.RECALL_SETTINGS_WRITE_FAILED)
    expect(res.message).toContain('No configurable plugin entry')
  })
})
