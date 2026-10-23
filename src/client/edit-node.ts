/**
 * dsh-recall-plugin — client 就地编辑（issue #26；2026-10-23 改为气泡原位）
 *
 * 编辑态不另起面板，直接占住原气泡的位置：气泡容器右对齐，编辑框宽度取实测的
 * 气泡宽度，于是「点编辑 → 原地长出编辑框」，消息下方只留动作行不动。为什么
 * 不用 absolute 覆盖 + mirror：那要额外计算溢出、要压住下方动作行、还要防测量
 * 失败；把气泡内容整体换成编辑框天然占同一位置，布局交给文档流，无需兜底。
 *
 * 状态机与执行链仍在 recall-node（复用同一段 fork 收尾），这里只吃 stage 渲染。
 */

import type { ReactApi } from './util.js'
import type { Translate } from './locales/index.js'

// editing / error 都携带 text：错误后面板可继续改再重试，不丢用户输入。
// attachments 是原消息里可回填的附件数（0 时不渲染附件提示行）
export type EditStage =
  | { stage: 'idle' }
  | { stage: 'editing'; text: string; attachments: number }
  | { stage: 'submitting' }
  | { stage: 'error'; text: string; attachments: number; message: string }

export interface EditPanelProps {
  stage: EditStage
  // 主按钮文案随 editSubmitsImmediately 分叉（发送 / 仅回填），由装配侧决定
  submitLabel: string
  // 原气泡实测宽度（px）；null = 未测到，按容器全宽渲染
  width: number | null
  onChange(text: string): void
  onSubmit(): void
  onClose(): void
}

export interface EditFlowApi {
  EditIcon: () => import('react').ReactNode
  EditPanel: (props: EditPanelProps) => import('react').ReactNode
}

export function buildEditFlow(React: ReactApi, t: Translate): EditFlowApi {
  // 铅笔图标：与 UndoIcon/CopyIcon 同一套内联规格（16 声明尺寸、stroke 1.4、
  // currentColor 随按钮文字色），保证动作行三个按钮的视觉重量一致
  function EditIcon() {
    return React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      React.createElement('path', { d: 'M10.6 2.9 13.1 5.4 5.8 12.7 3 13.4l.7-2.8 6.9-7.7z' }),
      React.createElement('path', { d: 'M9.4 4.1 11.9 6.6' })
    )
  }

  function EditPanel(props: EditPanelProps): import('react').ReactNode {
    const stage = props.stage
    if (stage.stage === 'idle') return null
    // 宽度在原气泡基础上放大 30%：改稿时要通读整句、常需增删字，贴原宽偏窄；
    // 下限 220px 保证可用，上限由消息列宽度兜住（maxWidth 100%）
    const style: Record<string, string> = { maxWidth: '100%' }
    if (props.width !== null) style.width = Math.max(220, Math.round(props.width * 1.3)) + 'px'

    if (stage.stage === 'submitting') {
      return React.createElement('div', { className: 'dsh-recall-edit dsh-recall-edit-inline', style },
        React.createElement('div', { className: 'dsh-recall-edit-busy', role: 'status', 'aria-live': 'polite' }, t('edit.submitting'))
      )
    }

    const error = stage.stage === 'error' ? stage.message : ''
    return React.createElement('div', { className: 'dsh-recall-edit dsh-recall-edit-inline', style },
      React.createElement('textarea', {
        className: 'dsh-recall-edit-area',
        value: stage.text,
        rows: 3,
        autoFocus: true,
        placeholder: t('edit.placeholder'),
        'aria-label': t('edit.placeholder'),
        onChange: (e: import('react').ChangeEvent<HTMLTextAreaElement>) => props.onChange(e.target.value),
      }),
      error !== '' ? React.createElement('div', { className: 'dsh-recall-edit-error', role: 'alert' }, error) : null,
      stage.attachments > 0
        ? React.createElement('div', { className: 'dsh-recall-edit-note' }, t('edit.attachments', { n: stage.attachments }))
        : React.createElement('div', { className: 'dsh-recall-edit-note' }, t('edit.note')),
      React.createElement('div', { className: 'dsh-recall-edit-actions' },
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn dsh-recall-btn-sm', onClick: props.onClose }, error !== '' ? t('common.close') : t('common.cancel')),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn dsh-recall-btn-sm dsh-recall-btn-primary',
          onClick: props.onSubmit,
        }, error !== '' ? t('edit.retry') : props.submitLabel)
      )
    )
  }

  return { EditIcon, EditPanel }
}
