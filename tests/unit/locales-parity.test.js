/**
 * i18n 词典一致性单测（A4）
 *
 * 三道门禁：
 * 1. 结构 parity：zh / en key 集合相等、无空值、同 key 的 {占位符} 集合一致
 *    （占位符集合漂移是最隐蔽的一类——en 漏一个 {n}，界面就少一个数字）；
 * 2. key 空间静态扫描：src/client 里字面量形态的取词（t('x') 与单引号里的
 *    语义 ID）必须都在 zh 表内——「代码有 key、字典没有」的漏配在这里拦红；
 * 3. 兜底链行为：当前语言缺 key 回 zh 原文、zh 也缺才回 key 本身；插值缺参
 *    保留 {name} 原样（不让 undefined 进界面）。
 *
 * 扫描的边界：只认字面量与「语义 ID 形状」的单引号字符串，动态拼接
 * （t('err.' + code)、t(open ? 'a' : 'b')）由 parity 的 key 集合与替换期自查
 * 覆盖——静态扫描是廉价的第一道网，不追求完备（完备要 AST，投入不成比例）。
 */

import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh } from '../../src/client/locales/zh.js'
import { en } from '../../src/client/locales/en.js'
import { hasTranslation, interpolate, resolveLocale, translate } from '../../src/client/locales/index.js'

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/client')

// 递归收集 client 源码（排除字典目录自身：那里引用的不是 key 而是 key 定义）
function clientSources(dir = clientDir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'locales') continue
      out.push(...clientSources(full))
    } else if (entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

// {name} 槽位集合（排序后比较：同一 key 两语言的槽位必须一一对应）
function placeholders(text) {
  const found = []
  for (const m of String(text).matchAll(/\{(\w+)\}/g)) found.push(m[1])
  return found.sort()
}

describe('i18n 词典 parity', () => {
  it('zh / en key 集合完全相等', () => {
    const zhKeys = Object.keys(zh).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(zhKeys)
  })

  it('无空值（两语言任一空串都会让界面出现空白行）', () => {
    for (const [key, value] of Object.entries(zh)) expect(value === '', 'zh.' + key).toBe(false)
    for (const [key, value] of Object.entries(en)) expect(value === '', 'en.' + key).toBe(false)
  })

  it('同 key 的 {占位符} 集合一致', () => {
    for (const key of Object.keys(zh)) {
      expect(placeholders(en[key]), 'en.' + key).toEqual(placeholders(zh[key]))
    }
  })

  it('动态细节码不设 err.*（宁中英混排也不吞排障细节，策略钉死）', () => {
    // 这些 code 的 host message 携带具体原因/命令，字典覆盖会把它整段盖掉
    for (const code of ['ROLLBACK_FAILED', 'BAD_TYPE', 'SETTINGS_WRITE_FAILED', 'PARTIAL_DELETE', 'ERROR']) {
      expect(hasTranslation('err.' + code), 'err.' + code).toBe(false)
    }
    // 静态码则必须可译（撤回链上的四个用户可见错误都在其中）
    for (const code of ['STALE', 'AGENT_BUSY', 'NO_SNAPSHOT', 'NO_STORE', 'FORMAT_BLOCKED']) {
      expect(hasTranslation('err.' + code), 'err.' + code).toBe(true)
    }
  })
})

describe('i18n key 空间静态扫描', () => {
  // 扫描命中「语义 ID 形状」（x.y.z）的单引号字面量，但只有**词典域前缀**
  // 的命中才当作词典键校验——client 里还有官方 slot 键（conversation.chat.node、
  // settings.plugin.item、plugins.bundle.config）同样是点分形状，它们不属于
  // 词表，误判成漏配会让门禁天天红。前缀集合从词典自身派生（新增域自动纳入）
  const dictPrefixes = new Set(Object.keys(zh).map((k) => k.split('.')[0]))

  it('src/client 内词表域前缀的字面量 key 全部在 zh 表内', () => {
    const missing = []
    for (const file of clientSources()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/'([a-z][a-zA-Z]*\.[a-zA-Z][a-zA-Z.]*)'/g)) {
        const key = m[1]
        if (!dictPrefixes.has(key.split('.')[0])) continue
        if (zh[key] === undefined) missing.push(path.relative(clientDir, file) + ' -> ' + key)
      }
    }
    expect(missing, '以下 key 不在 zh 表内：\n' + missing.join('\n')).toEqual([])
  })
})

describe('i18n 兜底链与插值', () => {
  // navigator 是宿主全局：node ≥ 21 起真实存在且 language 随系统 locale 变化
  // （CI runner 为 en-US、中文开发机为 zh-CN）——不桩定就等于把断言挂到运行
  // 环境的 locale 上，本地绿 CI 红（2026-09-30 首发实锤）。每个分支显式桩定，
  // afterEach 统一恢复原值（vi.stubGlobal 记录「存在/不存在」两态）。
  afterEach(() => { vi.unstubAllGlobals() })

  it('resolveLocale：显式 zh/en 直取；auto 按 navigator.language 判、无 navigator 回落 zh', () => {
    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('en')).toBe('en')
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(resolveLocale('auto')).toBe('zh')
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(resolveLocale('auto')).toBe('en')
    expect(resolveLocale('fr-FR')).toBe('en') // 非法值不炸，按 auto 处理
    vi.stubGlobal('navigator', undefined) // 老 node / 嵌入式无 navigator 环境
    expect(resolveLocale('auto')).toBe('zh')
    expect(resolveLocale(undefined)).toBe('zh')
  })

  it('translate：命中取当前语言；本语言缺 key 回 zh；都缺回 key 本身', () => {
    expect(translate('zh', 'common.save')).toBe('保存')
    expect(translate('en', 'common.save')).toBe('Save')
    // 两语言都缺 → key 本身（界面上可见语义 ID，便于定位漏配）
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
  })

  it('interpolate：替换 {name}；缺参保留原样；多余参忽略', () => {
    expect(interpolate('共 {n} 条', { n: 3 })).toBe('共 3 条')
    expect(interpolate('共 {n} 条', {})).toBe('共 {n} 条')
    expect(interpolate('共 {n} 条', { n: 3, extra: 'x' })).toBe('共 3 条')
    expect(interpolate('无槽位')).toBe('无槽位')
  })

  it('translate 带参：占位符由 params 填充（面板/列表里所有数字都走这条）', () => {
    expect(translate('en', 'tree.snapCount', { n: 5 })).toBe('5 snapshots')
    expect(translate('zh', 'manage.deletedCount', { deleted: 2 })).toBe('已删除 2 条快照')
  })
})