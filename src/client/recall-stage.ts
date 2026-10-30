/**
 * 撤回面板状态机（从 recall-node.ts 拆出以控制单文件体量）
 *
 * idle（默认，仅按钮）→ loading（预览中）→ error → confirm（变更清单 + 确认）
 * → executing（回退中）→ done（结果）。issue #31 起 confirm 带 files、
 * executing/done 带实际执行的 scope：仅消息条目被 Host 强制 session-only 时，
 * 文案必须按实际模式渲染，而不是按组件态的选择。
 */

import type { DiffChange, RecallScope } from '../types/api.js'

export type RecallStage =
  | { stage: 'idle' }
  | { stage: 'loading' }
  | { stage: 'error'; message: string }
  | { stage: 'confirm'; changes: DiffChange[]; total: number; truncated: boolean; treeId: string | null; time: number | null; cutSeq: number | null; files?: boolean }
  | { stage: 'executing'; changes: DiffChange[]; scope?: RecallScope }
  | { stage: 'done'; count: number; chatReverted: boolean; chatError: string; scope?: RecallScope }
