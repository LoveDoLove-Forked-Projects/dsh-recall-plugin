#!/usr/bin/env node
/**
 * verify-host.mjs — 端到端装配验证（E1，F-G5 复刻生产装配路径）
 *
 * 现有测试层缺「真实 cordis context 起插件」一环：字段探针钉官方 API 形状、
 * 单测钉纯逻辑，但 inject 漏声明（P0-1 冒烟实证的缺陷类）、端点未注册、
 * Config schema 无效等装配层错误只能靠活体冒烟发现。本脚本用本机 dsh 安装
 * 目录的真实 cordis `new Context()` + 最小服务桩 apply 插件，把装配断言变成
 * 本地可跑的门禁：
 *   1. 生产同款装配：`ctx.plugin({ name, apply, inject, Config }, {})`——
 *      插件跑在带 inject 门禁的子 fiber 上（复刻 loader 路径），而非早期
 *      版本的裸 `apply(ctx, {})`（root fiber 无门禁，漏声明不红——2026-08-28
 *      实证：从 inject 删 'agents' 裸 apply 依然全绿，agents 访问点的
 *      try/catch 守卫把 cordis 的 "cannot get property without inject"
 *      吞掉，fail-open 静默；详见 plan-competitor-fixes.md F-G5）；
 *   2. 漏声明即红的行为断言：agents 桩记录被访问次数——preview/execute
 *      端点会走 agentBusy → ctx.agents.list()，漏声明时守卫 fail-open、
 *      桩零访问，本断言红（行为级，不依赖抛错穿透守卫）；
 *   3. 全部预期端点已注册且响应体带 ok 字段（status=200 会被插件自身
 *      错误映射遮蔽，只能证明端点名注册；'ok' in body 才证明走完统一
 *      errBody 形状）；
 *   4. Config 是活 Schemastery object schema（合规清单 #3）；
 *   5. settings 桩在位时，全程 console.error 无 'recall settings namespace
 *      skipped'（settings 桩接入生效，skip 分支未被触发）；
 *   6. 卸载后 connection 路由注册清零（合规清单 #2/#5，HMR 无 module 级残留）；
 *   7. **只给新面**的 settings 桩（无 installSection/register，复刻 0.1.7 的
 *      SettingsForms）也必须装配成功，且 ns 解析贯通到端点读写（config-get 读到
 *      describe 的 user 覆盖、config-set/reset 把 profile entry id 交给官方）。
 *      为什么单独跑一个 pass：旧桩同时提供两代面时旧三分支先命中，新面永远不被
 *      走通——这正是 0.1.7 真实换代被本门禁掩盖的根因（断言 5 只能证明「没报
 *      skip」，证明不了走的是哪一代）。
 *
 * 定位与 CI 语义同 test:probe：优先 DSH_ROOT，否则 %APPDATA%\npm\...\dsh；
 * 无 dsh 环境整体 skip（退出 0），不 fail。本门禁不起真 git/真会话——shell 桩
 * 应答方言探针让插件判 pwsh 留在官方通道、其余命令回空输出，只做装配层断言，
 * 不替代活体冒烟。
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

function dshRoot() {
  if (process.env.DSH_ROOT) return process.env.DSH_ROOT
  const global = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh')
  return fs.existsSync(global) ? global : null
}

const DSH = dshRoot()
if (!DSH) {
  console.log('[verify-host] skip: 未找到 dsh 安装（可设 DSH_ROOT）；本门禁仅在有 dsh 的机器上跑')
  process.exit(0)
}

// 从 dsh 安装目录解析 cordis（真实 Context，而非 mock）
const requireFromDsh = createRequire(path.join(DSH, 'package.json'))
const { Context } = requireFromDsh('@deepseek-ai/cordis')

// 动态 import 插件（插件内部 import schemastery/dsh-settings 走项目 junction）。
// Windows 绝对路径必须转 file:// URL，否则 ESM loader 把盘符当协议。
const { apply, inject, name, Config } = await import(pathToFileURL(path.join(root, 'lib', 'index.js')).href)

// 方言探针哨兵取自插件自身产物（不重抄字面量）：shell 桩据此应答探针、让插件
// 判成 pwsh 留在官方通道——本门禁的定位是装配断言（「不起真 git/真会话」），
// 判成 bash 会改走自建直连通道、真的去 spawn powershell.exe 跑 git 命令。
const { SHELL_PROBE_SENTINEL } = await import(pathToFileURL(path.join(root, 'lib', 'store.js')).href)

// ---- 最小服务桩：只实现插件实际调用的方法面（字段面来自 probe 已核验事实）----
const registered = [] // connection fetch 路由注册记录（端点注册 + 卸载清零的载体）
const ctx = new Context()

// recordError 通道：拦截全程 console.error，供 settings skip 断言（断言 5）
const consoleErrors = []
const origConsoleError = console.error
console.error = (...args) => {
  consoleErrors.push(args.map((a) => String(a && a.message ? a.message : a)).join(' '))
  origConsoleError(...args)
}

// F-G5：agents 桩带访问计数。preview/execute → agentBusy → ctx.agents.list()，
// inject 声明完整时必被触达；漏声明时插件守卫 fail-open、桩零访问。
let agentsTouched = 0

// 两代 settings 桩（0.1.7 换代）：新面（SettingsForms）只有 describe/update/
// replace(+mutate/configure)，旧面的 installSection/register 整体移除、旧三分支
// 在新面上静默 no-op。面由参数选择，两个装配 pass 各取一代——「只给新面」这一代
// 是本轮新增的：旧桩同时提供 installSection 时旧三分支照常命中、新面永远不被走通，
// 这正是 0.1.7 真实换代被本门禁掩盖的根因。
function makeSettingsStub(face, record) {
  const stub = {
    describe() {
      record.describes += 1
      // 新面按 entry id 寻址：桩报的就是插件 profile 行的 options.id（含 user 覆盖，
      // 供 config-get 的 overridden 通路断言）；旧面桩报空表（旧面 describe 只列
      // 已注册 namespace，与 profile 行无关）。
      return face === 'modern' ? [{ ns: 'recall', user: { gcSnaps: 42 } }] : []
    },
    writable: true,
    async update(ns, patch) { record.updates.push([ns, patch]) },
    async replace(ns, section) { record.replaces.push([ns, section]) },
  }
  if (face === 'legacy') {
    // 0.1.2-alpha.2 起插件走 settings.installSection（独立函数被官方移除）；
    // 桩实现注册语义的最小面：setSource 接入口 config、onChange 触发一次。
    stub.installSection = (owner, ns, schema, entry, hooks) => {
      record.installs.push(ns)
      if (hooks && typeof hooks.setSource === 'function') hooks.setSource(() => entry)
      if (hooks && typeof hooks.onChange === 'function') hooks.onChange()
    }
  }
  return stub
}

// 桩服务由「提供者插件」fiber 提供（ctx.provide），与被测插件互为兄弟——
// 复刻生产拓扑（dsh-base 提供 agents、host 提供其余服务）。为什么不能用
// ctx.reflect.provide 直接挂 root：cordis 属性访问的 fiber-walk 沿祖先链
// 逐 fiber 查 store，root 是被测 fiber 的祖先——未声明服务也会被找到、
// 不抛 "cannot get property without inject"，门禁失效（删 agents 实证仍绿）。
// 兄弟 fiber 提供的服务只进 inject 快照（声明才解析），未声明即抛——与
// 生产一致。
function provideStubs(c, opts) {
  const routes = opts.registered
  const touchAgents = opts.touchAgents || (() => {})
  c.provide('connection', {
    fetch: {
      // 复刻官方 registerFetchRoute 的可观测语义：登记 route、返回异步
      // disposer。真实实现里注册本体挂在 connection fiber 的 effect 上
      // （owner = this.ctx），插件用 ctx.effect 包裹返回值——卸载时 cordis
      // 调用该 disposer，路由随之清除。
      register(route) {
        routes.push(route)
        return async () => {
          const i = routes.indexOf(route)
          if (i >= 0) routes.splice(i, 1)
        }
      },
    },
  })
  c.provide('shell', {
    resolve(spec) { return spec },
    // 方言探针按 pwsh 应答（回显哨兵）→ 插件判 pwsh 走官方通道，全程不 spawn。
    // 其余命令回空输出：门禁只做装配断言，不制造真实 git 副作用（见头部定位）。
    async run(spec) {
      const command = spec && typeof spec.command === 'string' ? spec.command : ''
      const text = command.indexOf(SHELL_PROBE_SENTINEL) >= 0 ? SHELL_PROBE_SENTINEL + '\n' : ''
      return { stdout: { text }, stderr: { text: '' }, exitCode: 0 }
    },
  })
  c.provide('sessions', {
    list() { return [] },
    get() { return null },
  })
  c.provide('agents', {
    list() { touchAgents(); return [] },
    get() { touchAgents(); return null },
  })
  c.provide('sandboxPolicy', { workspaceRoot: process.cwd() })
  c.provide('sessionQuery', {
    async listSessions() { return [] },
    async readSession() { return null },
  })
  c.provide('settings', opts.settings)
}

const legacyRecord = { installs: [], updates: [], replaces: [], describes: 0 }
await ctx.plugin({
  name: 'verify-host-stubs',
  apply(c) {
    provideStubs(c, {
      registered,
      settings: makeSettingsStub('legacy', legacyRecord),
      touchAgents: () => { agentsTouched += 1 },
    })
  },
}, {})

// ---- 断言 ----
const failures = []
function assert(cond, msg) {
  if (!cond) failures.push(msg)
}

// 1. 生产同款装配：ctx.plugin 对象插件 + inject 门禁（await 等就绪/启动错）
//    config-validation 与 plugin-startup 错误都会在 await 时抛出——漏声明
//    导致服务永远不可得时 fiber 停在 PENDING，同样不红不绿，靠断言 2 兜底。
try {
  await ctx.plugin({ name, apply, inject, Config }, {})
} catch (error) {
  failures.push('ctx.plugin 装配抛错（inject/Config 声明可能不完整）：' + (error && error.message ? error.message : error))
}

// 2. 端点注册：connection.fetch 逐端点注册 exact 路由，且 fetch 能响应
// 路由形状直接照官方 ConnectionFetchRoute 契约断言（path/methods/requestBody/fetch）
const sampleRoute = registered.find((r) => r && r.path === '/api/recall/init')
if (sampleRoute) {
  assert(Array.isArray(sampleRoute.methods) && sampleRoute.methods.includes('POST'),
    '路由 methods 含 POST（得到 ' + JSON.stringify(sampleRoute.methods) + '）')
  assert(sampleRoute.requestBody === 'buffered',
    '路由 requestBody=buffered（得到 ' + sampleRoute.requestBody + '）')
  assert(typeof sampleRoute.fetch === 'function', '路由 fetch 是函数')
} else {
  failures.push('示例路由 /api/recall/init 未注册')
}

// 复刻宿主的共享分发：exact pathname 命中路由则调用其 fetch、未命中 404
// （真实分发器 = connection 的 createSharedFetchHandler('/api')）
async function dispatch(pathname, args) {
  const route = registered.find((r) => r && r.path === pathname)
  if (!route) return new Response(null, { status: 404 })
  return route.fetch(new Request('http://dsh.internal' + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args || {}),
  }))
}
async function callEndpoint(endpointName, args) {
  const response = await dispatch('/api/recall/' + endpointName, args)
  let parsed = null
  try { parsed = await response.json() } catch (error) { parsed = null }
  return { status: response.status, body: parsed }
}

const EXPECTED_ENDPOINTS = [
  'init', 'snapshot-info', 'preview', 'execute',
  'exclude-get', 'exclude-set', 'config-get', 'config-set', 'config-reset',
  'manage', 'status', 'lineage-record',
]
// snapshot-info 返回 { has, time, id, ...feedback }，无 ok 字段（客户端按
// has 判定）；其余端点全部走统一 { ok } 形状。白名单放行而非静默豁免。
const EXPECTED_BODY_OK = new Set(['snapshot-info'])

const registeredPaths = registered.map((r) => r && r.path)
const missingRoutes = EXPECTED_ENDPOINTS.filter((ep) => !registeredPaths.includes('/api/recall/' + ep))
assert(missingRoutes.length === 0, 'connection.fetch 注册了全部端点路由（缺失: ' + missingRoutes.join(', ') + '）')
assert(registered.length === EXPECTED_ENDPOINTS.length,
  '注册路由数 == 端点数（' + registered.length + ' vs ' + EXPECTED_ENDPOINTS.length + '）——多余路由说明重复注册')

for (const ep of EXPECTED_ENDPOINTS) {
  try {
    const res = await callEndpoint(ep, {})
    assert(res.status === 200, '端点 ' + ep + ' 已注册（status=' + res.status + '）')
    // F-G5：统一响应形状——status=200 会被插件自身错误映射遮蔽（端点名
    // 注册 ≠ handler 正常），body 带 ok 字段才证明走完 errBody 统一出口。
    // snapshot-info 等极少数端点历史上无 ok 字段——以 EXPECTED_BODY_OK
    // 白名单声明，新增无 ok 端点时显式登记而不是静默放行。
    if (!EXPECTED_BODY_OK.has(ep)) {
      assert(res.body && typeof res.body === 'object' && 'ok' in res.body,
        '端点 ' + ep + ' 响应体带 ok 字段（得到: ' + JSON.stringify(res.body).slice(0, 120) + '）')
    }
  } catch (error) {
    failures.push('端点 ' + ep + ' 调用抛错：' + (error && error.message ? error.message : error))
  }
}
try {
  const unknown = await callEndpoint('no-such-endpoint', {})
  assert(unknown.status === 404, '未知端点返回 404（status=' + unknown.status + '）')
} catch (error) {
  failures.push('未知端点探测抛错：' + (error && error.message ? error.message : error))
}
// F-G5 漏声明即红（行为级）：preview 走 agentBusy → ctx.agents.list()，
// inject 声明完整时 agents 桩必被触达。删 'agents' 跑本脚本 → 此断言红。
assert(agentsTouched > 0, 'preview/execute 探测触发了 agents 访问（agentBusy 通路，访问 ' + agentsTouched + ' 次）——inject 漏声明 agents 时守卫 fail-open、此断言红')

// 3. Config 是活 Schemastery object schema（合规清单 #3：禁普通对象）
assert(Config && typeof Config === 'function' && Config.type === 'object',
  'Config 是活 Schemastery object schema（type=' + (Config && Config.type) + '）')
try {
  if (Config && typeof Config === 'function') {
    Config({}) // callable 校验：空输入填充默认值，非法即抛
  }
} catch (error) {
  failures.push('Config schema 校验失败：' + (error && error.message ? error.message : error))
}

// 4. 卸载后注册清零（合规清单 #2/#5：effect disposer 成对，无 module 级残留）
const before = registered.length
try {
  // root fiber 的 dispose = restart()（async），必须 await 才会清空 effect
  // 并触发各 effect 的 disposer（connection.fetch.register 返回的异步注销
  // 函数由 cordis 等待完成）；子插件 fiber 随 root 级联 dispose
  await ctx.fiber.dispose()
} catch (error) {
  failures.push('ctx.fiber.dispose() 抛错：' + (error && error.message ? error.message : error))
}
assert(registered.length === 0, '卸载后 connection 路由注册清零（' + before + ' → ' + registered.length + '）')

// 5. settings 桩接入：settings 服务在位时插件不应记录 skip（index.js
// installSettingsSection 的 catch 分支文本），记录了说明桩没接通或
// settings 接线有回归。
console.error = origConsoleError
assert(!consoleErrors.some((m) => m.indexOf('recall settings namespace skipped') >= 0),
  'settings 桩在位时无 settings skip 记录（得到 ' + consoleErrors.length + ' 条 console.error）')

// 6. 首个 pass 确实走了旧面：installSection 被以旧字面量 ns 调用（旧路径未被
// 新分支吃掉）。0.1.7 上这条不存在，故只在旧桩 pass 断言。
assert(legacyRecord.installs.includes('dsh-recall'),
  '旧面桩：installSection 以 dsh-recall 注册 namespace（得到 ' + JSON.stringify(legacyRecord.installs) + '）')

// ---- 7. 只给新面（无 installSection/register）也必须装配成功 ----
// 为什么单独跑一个 pass：旧桩同时提供两代面时，旧三分支先命中、新面永远不被走通
// ——这正是 0.1.7 真实换代被掩盖的根因。本 pass 只给新面，并复刻 Loader 的
// Fiber.entry 增补（生产上由 cordis-plugin-loader 注入；新面 ns 解析读的就是
// entry.options.id），断言装配成功 + ns 解析贯通到端点读写。
const modernRecord = { installs: [], updates: [], replaces: [], describes: 0 }
const modernRegistered = []
const modernSettings = makeSettingsStub('modern', modernRecord)
assert(typeof modernSettings.installSection === 'undefined' && typeof modernSettings.register === 'undefined',
  '新面桩不含旧注册入口（否则新一代缺失又会像本轮一样被自己的桩掩盖）')

const modernErrors = []
console.error = (...args) => {
  modernErrors.push(args.map((a) => String(a && a.message ? a.message : a)).join(' '))
  origConsoleError(...args)
}
let modernAgentsTouched = 0
const modernCtx = new Context()
try {
  await modernCtx.plugin({
    name: 'verify-host-stubs-modern',
    apply(c) {
      provideStubs(c, {
        registered: modernRegistered,
        settings: modernSettings,
        touchAgents: () => { modernAgentsTouched += 1 },
      })
    },
  }, {})

  // ctx.plugin 返回带 then 的 wrapped fiber（Object.create(fiber)），真实 Fiber
  // 在原型上；apply 在微任务里才跑，故此处的 entry 赋值先于插件读它。
  const modernFiber = modernCtx.plugin({ name, apply, inject, Config }, {})
  const realFiber = Object.getPrototypeOf(modernFiber)
  if (realFiber && typeof realFiber === 'object') {
    realFiber.entry = { id: 'include:recall', options: { id: 'recall', name } }
  } else {
    failures.push('取不到插件 fiber（cordis plugin() 返回形态变化）')
  }
  await modernFiber
} catch (error) {
  failures.push('新面-only 装配抛错（settings 换代后新路径未走通）：' + (error && error.message ? error.message : error))
}

assert(modernRegistered.length === EXPECTED_ENDPOINTS.length,
  '新面-only：端点仍注册齐全（' + modernRegistered.length + ' vs ' + EXPECTED_ENDPOINTS.length + '）')

async function callModern(endpointName, args) {
  const route = modernRegistered.find((r) => r && r.path === '/api/recall/' + endpointName)
  if (!route) return { status: 404, body: null }
  const response = await route.fetch(new Request('http://dsh.internal/api/recall/' + endpointName, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args || {}),
  }))
  let parsed = null
  try { parsed = await response.json() } catch (error) { parsed = null }
  return { status: response.status, body: parsed }
}

const modernGet = await callModern('config-get', {})
assert(modernGet.body && modernGet.body.ok === true, '新面-only：config-get 正常应答（' + JSON.stringify(modernGet.body).slice(0, 120) + '）')
assert(modernGet.body && modernGet.body.overridden && modernGet.body.overridden.gcSnaps === 42,
  '新面-only：config-get 按解析出的 entry id 读到 describe 的 user 覆盖（得到 ' + JSON.stringify(modernGet.body && modernGet.body.overridden) + '）')

const modernSet = await callModern('config-set', { patch: { gcSnaps: 11 } })
assert(modernSet.body && modernSet.body.ok === true, '新面-only：config-set 正常应答（' + JSON.stringify(modernSet.body).slice(0, 120) + '）')
assert(modernRecord.updates.length === 1 && modernRecord.updates[0][0] === 'recall' && modernRecord.updates[0][1].gcSnaps === 11,
  '新面-only：config-set 把 ns=recall 交给官方 update（旧面硬编码 dsh-recall 在 0.1.7 上必失败；得到 ' + JSON.stringify(modernRecord.updates) + '）')

const modernReset = await callModern('config-reset', {})
assert(modernReset.body && modernReset.body.ok === true, '新面-only：config-reset 正常应答（' + JSON.stringify(modernReset.body).slice(0, 120) + '）')
assert(modernRecord.replaces.length === 1 && modernRecord.replaces[0][0] === 'recall',
  '新面-only：config-reset 走官方 replace(ns, {})（得到 ' + JSON.stringify(modernRecord.replaces) + '）')

// preview 同样走 agentBusy → ctx.agents.list()：与 pass 1 同一个漏声明即红的
// 行为断言，确认换代后的新路径没有绕开 inject 门禁。
await callModern('preview', {})
assert(modernAgentsTouched > 0, '新面-only：agents 通路仍被触达（inject 声明在两种面下都成立）')

// 让 apply 期的启动预热 IIFE 先跑完再卸载：它内部会经 ctx.sessions 访问服务，
// fiber 一旦停用该访问会变成未捕获拒绝（"cannot get required service ... in
// inactive context"），而预热是 fire-and-forget（外部无法 await）——卸载前留一拍
// 是门禁侧的确定性手段（探针已由桩应答，预热此后的步骤全是微任务，无 I/O）。
await new Promise((resolve) => { setTimeout(resolve, 50) })

try { await modernCtx.fiber.dispose() } catch (error) {
  failures.push('新面-only：dispose 抛错：' + (error && error.message ? error.message : error))
}
assert(modernRegistered.length === 0, '新面-only：卸载后路由清零（' + modernRegistered.length + '）')
console.error = origConsoleError
assert(!modernErrors.some((m) => m.indexOf('recall settings namespace skipped') >= 0),
  '新面-only：无 settings skip 记录（得到 ' + modernErrors.length + ' 条 console.error）')

// ---- 输出 ----
if (failures.length) {
  console.error('[verify-host] FAIL (' + failures.length + '):\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('[verify-host] ok: ' + name + ' 装配断言全部通过（inject=' + inject.join(',') + '，端点 ' + EXPECTED_ENDPOINTS.length + ' 项，agents 桩访问 ' + agentsTouched + ' 次）')