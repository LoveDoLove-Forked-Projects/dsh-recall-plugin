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
 *    RECALL_SETTINGS_UNAVAILABLE 报逃生口文案。
 *
 * 说明：本文件不 import host/index.js——它裸导入 '@deepseek-ai/dsh-settings'
 * （私有 peer，CI 不装），装配级分派由 verify-host 门禁覆盖（M3-2 的「只给新面
 * 也必须装配成功」断言）。
 */

import { describe, it, expect } from 'vitest'
import {
  withVolatile,
  isLegacySettingsFace,
  resolveSettingsNs,
  unwrapConfig,
  DEFAULTS,
} from '../../src/host/config.js'
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
