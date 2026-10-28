/**
 * 输入区回填的附件两代口径测试（B1）
 *
 * 官方 readAttachment 在 0.2.2-alpha.1 换代：旧版收 attachmentId 字符串（宿主回
 * 会话日志反查完整引用），新版收完整引用对象（宿主只按 mediaType/bytes/尺寸自证）。
 * 插件必须在两代上都读得出字节——否则撤回回填与编辑重发的图片会静默消失。
 * 这里用「只认对象 / 只认字符串」两种桩模拟两代，并钉住命中代被记住（不重复撞错）。
 */

import { describe, it, expect } from 'vitest'
import { buildDraftFill } from '../../src/client/draft-fill.js'
import type { DraftAttachmentRef } from '../../src/client/draft-fill.js'
import type { ClientContext } from '../../src/types/client-contract.js'

const ID = 'sha256:' + 'a'.repeat(64)
const REF = { attachmentId: ID, mediaType: 'image/png', bytes: 3, width: 1, height: 1, name: 'shot.png' }
const FULL: DraftAttachmentRef = { attachmentId: ID, kind: 'image', attachment: REF }

const PNG = new Uint8Array([1, 2, 3])

// 桩会话：readAttachment 的入参被记录，判定交给每案的 accept
function makeCtx(accept: (arg: unknown) => boolean) {
  const calls: unknown[] = []
  const session = {
    readAttachment: async (arg: unknown) => {
      calls.push(arg)
      if (!accept(arg)) return { ok: false, error: { code: 'session/attachment-invalid' } }
      return { ok: true, value: { attachment: REF, data: PNG } }
    },
  }
  const ctx = {
    sessions: { binding: () => ({ session }) },
    get: () => undefined,
  } as unknown as ClientContext
  return { ctx, calls }
}

describe('preloadAttachmentFiles 的 readAttachment 两代入参', () => {
  it('新版（只认完整引用）：一次成功，File 名字与类型取自引用', async () => {
    const { ctx, calls } = makeCtx((arg) => typeof arg === 'object' && arg !== null)
    const files = await buildDraftFill(ctx).preloadAttachmentFiles('s1', [FULL])
    expect(files).toHaveLength(1)
    expect(files[0]?.name).toBe('shot.png')
    expect(files[0]?.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await files[0]!.arrayBuffer()))).toEqual([1, 2, 3])
    expect(calls).toEqual([REF])
  })

  it('旧版（只认 attachmentId 字符串）：对象被拒后回退裸 id，仍读得出', async () => {
    const { ctx, calls } = makeCtx((arg) => typeof arg === 'string')
    const files = await buildDraftFill(ctx).preloadAttachmentFiles('s1', [FULL])
    expect(files).toHaveLength(1)
    expect(calls).toEqual([REF, ID])
  })

  it('命中代被记住：同一次撤回的多张图只撞一次错', async () => {
    const { ctx, calls } = makeCtx((arg) => typeof arg === 'string')
    const second: DraftAttachmentRef = { attachmentId: 'sha256:' + 'b'.repeat(64), kind: 'image', attachment: { ...REF, attachmentId: 'sha256:' + 'b'.repeat(64) } }
    const files = await buildDraftFill(ctx).preloadAttachmentFiles('s1', [FULL, second])
    expect(files).toHaveLength(2)
    // 第二张直接从已命中的 id 口径开始：总调用 = 对象失败 + id + id
    expect(calls).toHaveLength(3)
    expect(typeof calls[1]).toBe('string')
    expect(typeof calls[2]).toBe('string')
  })

  it('两代都读不出：逐项跳过且不抛（附件缺失不阻断撤回）', async () => {
    const { ctx } = makeCtx(() => false)
    await expect(buildDraftFill(ctx).preloadAttachmentFiles('s1', [FULL])).resolves.toEqual([])
  })

  it('只有裸 id（旧调用方形状）时仍可用：不再造一个假引用去试对象口径', async () => {
    const { ctx, calls } = makeCtx((arg) => typeof arg === 'string')
    const files = await buildDraftFill(ctx).preloadAttachmentFiles('s1', [{ attachmentId: ID, kind: 'image' }])
    expect(files).toHaveLength(1)
    expect(calls).toEqual([ID])
  })
})

describe('fillDraft 的草稿附件注册', () => {
  const file = () => new File(['x'], 'a.png', { type: 'image/png' })

  it('只回填不发（撤回）→ 第三参 uploadImages=true，图片进输入态即上传', async () => {
    const created: unknown[][] = []
    const conversation = {
      input: { shell: () => ({ actions: { setDraft: () => undefined, addAttachments: () => true, submit: () => undefined } }) },
      createDrafts: (...args: unknown[]) => { created.push(args); return [] },
    }
    const ctx = {
      sessions: { binding: () => ({ session: {} }) },
      get: (name: string) => (name === 'conversation' ? conversation : undefined),
    } as unknown as ClientContext
    buildDraftFill(ctx).fillDraft('s2', '', Promise.resolve([file()]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(created).toHaveLength(1)
    expect(created[0]?.[0]).toBe('s2')
    expect(created[0]?.[2]).toBe(true)
  })

  it('编辑重发（自动发送）→ 第三参 false：图片随 prompt 内联，不等上传回执', async () => {
    const created: unknown[][] = []
    const conversation = {
      input: { shell: () => ({ actions: { setDraft: () => undefined, addAttachments: () => true, submit: () => undefined }, snapshot: { draft: '' } }) },
      createDrafts: (...args: unknown[]) => { created.push(args); return [] },
    }
    const ctx = {
      sessions: { binding: () => ({ session: {} }) },
      get: (name: string) => (name === 'conversation' ? conversation : undefined),
    } as unknown as ClientContext
    buildDraftFill(ctx).fillDraft('s2', 'hello', Promise.resolve([file()]), { submit: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(created).toHaveLength(1)
    expect(created[0]?.[2]).toBe(false)
  })

  it('三参形态抛错（上传服务缺席等）→ 退回两参，附件仍进输入态', async () => {
    const created: unknown[][] = []
    const added: string[][] = []
    const conversation = {
      input: { shell: () => ({ actions: { addAttachments: (ids: string[]) => { added.push(ids); return true } } }) },
      createDrafts: (...args: unknown[]) => {
        created.push(args)
        if (args.length >= 3) throw new Error('no fileUpload service')
        return [{ id: 'draft-1' }]
      },
    }
    const ctx = {
      sessions: { binding: () => ({ session: {} }) },
      get: (name: string) => (name === 'conversation' ? conversation : undefined),
    } as unknown as ClientContext
    buildDraftFill(ctx).fillDraft('s2', '', Promise.resolve([file()]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(created.map((args) => args.length)).toEqual([3, 2])
    expect(added).toEqual([['draft-1']])
  })
})
