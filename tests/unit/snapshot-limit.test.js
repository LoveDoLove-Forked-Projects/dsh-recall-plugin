/**
 * issue #24 快照护栏单测：SNAP_LIMIT 标记解析与停用文案。
 *
 * 标记是脚本与 host 之间唯一的判定通道（脚本超限早退 → host 停用该工作区
 * 快照），解析必须对格式漂移 fail-open（返回 null 走原成功路径），不能把
 * 正常输出误判成停用。
 */

import { describe, it, expect } from 'vitest'
import { parseSnapshotLimit, parseScanFail, buildSnapshotLimitNotice } from '../../src/host/snapshots.js'

describe('parseSnapshotLimit', () => {
  it('解析 bytes 标记（现状：脚本超限输出的唯一契约行）', () => {
    expect(parseSnapshotLimit('SNAP_OK\nSNAP_LIMIT bytes 1234567 268435456\n')).toEqual({
      kind: 'bytes', value: 1234567, limit: 268435456,
    })
  })

  it('解析 time 标记（毫秒）', () => {
    expect(parseSnapshotLimit('SNAP_LIMIT time 12000 10000')).toEqual({ kind: 'time', value: 12000, limit: 10000 })
  })

  it('旧脚本输出 / 无关文本 / 缺字段均返回 null（fail-open）', () => {
    expect(parseSnapshotLimit('')).toBeNull()
    expect(parseSnapshotLimit('SNAP_OK')).toBeNull()
    expect(parseSnapshotLimit('SNAP_LIMIT bytes')).toBeNull()
    expect(parseSnapshotLimit('SNAP_LIMIT other 1 2')).toBeNull()
    expect(parseSnapshotLimit('  SNAP_LIMIT bytes 1 2')).toBeNull()
    expect(parseSnapshotLimit(undefined)).toBeNull()
  })
})

// issue #29：扫描失败哨兵。它是「规模未知 → 本次不建快照」的唯一输入，
// 格式漂移必须回落 null（走原成功路径），不能把正常输出误判成失败。
describe('parseScanFail', () => {
  it('解析退出码与压平后的 stderr', () => {
    expect(parseScanFail('SNAP_SCAN_FAIL 128\nSNAP_SCAN_ERR fatal: index file smaller than expected\n')).toEqual({
      rc: 128, message: 'fatal: index file smaller than expected',
    })
  })

  it('缺行 / 退出码非法 → null；有退出码无 stderr → 空 message', () => {
    expect(parseScanFail('')).toBeNull()
    expect(parseScanFail('SNAP_OK')).toBeNull()
    expect(parseScanFail(undefined)).toBeNull()
    expect(parseScanFail('SNAP_SCAN_FAIL abc')).toBeNull()
    expect(parseScanFail('SNAP_SCAN_FAIL 128')).toEqual({ rc: 128, message: '' })
  })

  it('超限标记不会被认成扫描失败（两个通道互不串扰）', () => {
    expect(parseScanFail('SNAP_LIMIT bytes 1 2')).toBeNull()
  })
})

describe('buildSnapshotLimitNotice', () => {
  // scan 分支：原因只进「最近错误」，文案本身必须守住 140 字符预算
  it('scan：给出退出码与恢复路径，且不嵌 stderr', () => {
    const s = buildSnapshotLimitNotice({ kind: 'scan', value: 128, limit: 0 })
    expect(s).toContain('128')
    expect(s).toContain('暂停快照')
    expect(s).toContain('最近错误')
    expect(s).not.toContain('fatal:')
    expect(s.length).toBeLessThanOrEqual(140)
  })

  it('bytes：MB 换算 + 指向设置页字段名（文案与配置卡片 label 一致）', () => {
    const s = buildSnapshotLimitNotice({ kind: 'bytes', value: 1073741824, limit: 268435456 })
    expect(s).toContain('1024 MB')
    expect(s).toContain('256 MB')
    expect(s).toContain('工作区总量上限')
  })

  it('bytes：不足 1MB 用 KB（不出现无信息的 0 MB）', () => {
    const s = buildSnapshotLimitNotice({ kind: 'bytes', value: 2053, limit: 1024 })
    expect(s).toContain('2 KB')
    expect(s).toContain('1 KB')
    expect(s).not.toContain('0 MB')
  })

  it('time：秒换算（不足 1 秒按 1 秒显示，避免出现 0 秒）', () => {
    expect(buildSnapshotLimitNotice({ kind: 'time', value: 12000, limit: 10000 })).toContain('12 秒')
    expect(buildSnapshotLimitNotice({ kind: 'time', value: 200, limit: 100 })).toContain('1 秒')
  })

  // issue #28：不写明口径，用户会以为工作区真的这么大，去调大上限——那反而把
  // .gitignore 里的产物真的收进对象库，与该护栏的初衷相反。
  it('bytes：写明已按 .gitignore 与排除表过滤，且仍在长度预算内', () => {
    const s = buildSnapshotLimitNotice({ kind: 'bytes', value: 311184016, limit: 268435456 })
    expect(s).toContain('.gitignore')
    expect(s.length).toBeLessThanOrEqual(140)
  })
})
