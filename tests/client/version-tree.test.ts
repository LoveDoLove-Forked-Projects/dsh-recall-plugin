/**
 * 版本家族存储测试（‹ X/N › 翻页器的数据源）
 *
 * 钉住三件事：家族按「根 → 成员」聚合（子再 fork 仍归同一家族）、成员顺序即
 * 版本序号、重复登记幂等（重试/重复提交不能虚增版本数）。家族只有 2 个成员
 * 以上才可翻页，单成员返回 null。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { familyOf, recordVersion } from '../../src/client/version-tree.js'

describe('版本家族：登记与查询', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('首次 fork → 家族 [父, 子]，子下标 1', () => {
    recordVersion('s1', 's2')
    expect(familyOf('s1')).toEqual({ rootId: 's1', ids: ['s1', 's2'], index: 0 })
    expect(familyOf('s2')).toEqual({ rootId: 's1', ids: ['s1', 's2'], index: 1 })
  })

  it('子会话再 fork → 追加到同一家族，顺序即版本序号', () => {
    recordVersion('s1', 's2')
    recordVersion('s2', 's3')
    expect(familyOf('s3')).toEqual({ rootId: 's1', ids: ['s1', 's2', 's3'], index: 2 })
  })

  it('重复登记同一父子对 → 幂等，不虚增版本数', () => {
    recordVersion('s1', 's2')
    recordVersion('s1', 's2')
    expect(familyOf('s2')?.ids).toEqual(['s1', 's2'])
  })

  it('未登记的会话 → null（没有家族就不出翻页器）', () => {
    expect(familyOf('unknown')).toBeNull()
    expect(familyOf('')).toBeNull()
    expect(familyOf(null)).toBeNull()
  })

  it('空 id / 自指不产生记录', () => {
    recordVersion('', 's2')
    recordVersion('s1', '')
    recordVersion('s1', 's1')
    expect(familyOf('s1')).toBeNull()
    expect(familyOf('s2')).toBeNull()
  })
})
