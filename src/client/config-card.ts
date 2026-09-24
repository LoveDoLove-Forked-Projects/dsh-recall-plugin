/**
 * dsh-recall-plugin — client 插件配置表单卡片（S1 拆分）
 *
 * 从 settings-cards.ts 按域拆出的「插件配置」表单：9 字段 + 恢复默认。纯移动，
 * 零行为变化；依赖注入 React 与 util（api/bytesToMb）。SectionToggle（共享
 * 分区折叠头原子，负责「高级：基础排除表」的展开）由装配层注入，本文件不
 * 反向依赖 settings-cards，避免成环。
 */

import type { ReactApi, UtilApi } from './util.js'
import { useAutoDismissMessage } from './util.js'
import type { ConfigGetResponse, ConfigSetResponse, ConfigResetResponse } from '../types/api.js'

// SectionToggle 的 props 契约（结构类型，装配点由 TS 校验与 settings-cards
// 内的实现一致；不改动其自身定义）
export interface SectionToggleProps {
  title: string
  open: boolean
  onToggle: () => void
  meta?: string
  divider?: boolean
}

export function buildConfigForm(
  React: ReactApi,
  util: UtilApi,
  SectionToggle: (props: SectionToggleProps) => import('react').ReactNode
): { ConfigForm: () => import('react').ReactNode } {
  const { api, bytesToMb } = util

  // 插件配置表单草稿形状（display 层：数字字段为字符串、排除表为换行文本）
  interface ConfigDraft {
    gcSnaps: string
    gcHours: string
    maxFileBytes: string
    maxSnapshotsPerWorkspace: string
    baseExcludes: string
    refillDraft: boolean
    snapshotEnabled: boolean
    archiveOriginal: boolean
    retentionDays: string
    [key: string]: string | boolean
  }

  // 插件配置表单：值经 Host 的 settings namespace「dsh-recall」读写，保存即
  // 持久化并热生效。只提交相对基线修改过的字段，避免一次保存把全部字段
  // 标成「用户覆盖」。
  function ConfigForm(): import('react').ReactNode {
    const [baseline, setBaseline] = React.useState<ConfigDraft | null>(null)
    const [draft, setDraft] = React.useState<ConfigDraft | null>(null)
    const [envLocks, setEnvLocks] = React.useState<Record<string, boolean>>({})
    const [overridden, setOverridden] = React.useState<Record<string, unknown>>({})
    const [writable, setWritable] = React.useState(true)
    const [state, setState] = React.useState({ busy: false, message: '', error: false })
    // V3：成功消息 4s 后自动消退（错误常驻），共享 hook 见 util.ts
    useAutoDismissMessage(React, state, setState)
    const [showAdvanced, setShowAdvanced] = React.useState(false)

    function load(): void {
      api<ConfigGetResponse>('config-get', {}).then((res) => {
        if (res && res.ok) {
          const v = res.values
          const next = {
            gcSnaps: String(v.gcSnaps == null ? '' : v.gcSnaps),
            gcHours: String(v.gcHours == null ? '' : v.gcHours),
            maxFileBytes: bytesToMb(v.maxFileBytes),
            maxSnapshotsPerWorkspace: String(v.maxSnapshotsPerWorkspace == null ? '' : v.maxSnapshotsPerWorkspace),
            baseExcludes: Array.isArray(v.baseExcludes) ? v.baseExcludes.join('\n') : '',
            refillDraft: v.refillDraft !== false,
            snapshotEnabled: v.snapshotEnabled !== false,
            archiveOriginal: v.archiveOriginal !== false,
            retentionDays: String(v.retentionDays == null ? '' : v.retentionDays),
          }
          setDraft(next)
          setBaseline(next)
          setEnvLocks(res.envLocks || {})
          setOverridden(res.overridden || {})
          setWritable(res.writable !== false)
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '无法读取配置', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    React.useEffect(() => { load() }, [])

    function edit(key: string, value: string | boolean): void {
      setDraft((d) => Object.assign({}, d, { [key]: value }))
    }

    function save(): void {
      if (state.busy || !draft || !baseline) return
      const patch: Record<string, string | boolean> = {}
      for (const key of ['gcSnaps', 'gcHours', 'maxFileBytes', 'maxSnapshotsPerWorkspace', 'baseExcludes', 'refillDraft', 'snapshotEnabled', 'archiveOriginal', 'retentionDays']) {
        if (draft[key] !== baseline[key]) patch[key] = draft[key]
      }
      if (!Object.keys(patch).length) {
        setState({ busy: false, message: '没有修改', error: false })
        return
      }
      const clean: Record<string, unknown> = {}
      if (patch.gcSnaps !== undefined) {
        const n = parseInt(String(patch.gcSnaps), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: '快照条数阈值必须是 >= 1 的整数', error: true }); return }
        clean.gcSnaps = n
      }
      if (patch.gcHours !== undefined) {
        const n = parseInt(String(patch.gcHours), 10)
        if (!Number.isFinite(n) || n < 1) { setState({ busy: false, message: 'gc 小时阈值必须是 >= 1 的整数', error: true }); return }
        clean.gcHours = n
      }
      if (patch.maxFileBytes !== undefined) {
        // display 层是 MB 小数，持久化仍是字节：model 侧不变，往返零改动
        const mb = Number(patch.maxFileBytes)
        if (!Number.isFinite(mb) || mb < 0.01) { setState({ busy: false, message: '文件大小上限至少 0.01 MB', error: true }); return }
        clean.maxFileBytes = Math.round(mb * 1048576)
      }
      if (patch.maxSnapshotsPerWorkspace !== undefined) {
        const n = parseInt(String(patch.maxSnapshotsPerWorkspace), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: '快照总量上限必须是 >= 0 的整数（0 表示不限制）', error: true }); return }
        clean.maxSnapshotsPerWorkspace = n
      }
      if (patch.refillDraft !== undefined) clean.refillDraft = Boolean(patch.refillDraft)
      if (patch.snapshotEnabled !== undefined) clean.snapshotEnabled = Boolean(patch.snapshotEnabled)
      if (patch.archiveOriginal !== undefined) clean.archiveOriginal = Boolean(patch.archiveOriginal)
      if (patch.retentionDays !== undefined) {
        const n = parseInt(String(patch.retentionDays), 10)
        if (!Number.isFinite(n) || n < 0) { setState({ busy: false, message: '保留天数必须是 >= 0 的整数（0 表示不启用）', error: true }); return }
        clean.retentionDays = n
      }
      if (patch.baseExcludes !== undefined) {
        clean.baseExcludes = String(patch.baseExcludes).split('\n').map((l) => l.trim()).filter(Boolean)
      }
      setState({ busy: true, message: '保存中…', error: false })
      api<ConfigSetResponse>('config-set', { patch: clean }).then((res) => {
        if (res && res.ok) {
          setState({ busy: false, message: '已保存并即时生效', error: false })
          load()
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '保存失败', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    function numRow(key: string, label: string, hint: string, opts?: { min?: number; step?: number; suffix?: string }): import('react').ReactNode {
      const locked = Boolean(envLocks && envLocks[key])
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        // V4：标签上提为 cfg-row 直接子元素——grid 第一列（max-content）跨行
        // 对齐最长标签，消灭 130px 定宽魔法数与 hint 138px 缩进耦合。
        // 标签用 span + aria-labelledby 而非 label[for]：label 关联会让点击左侧
        // 标签直接触发右侧控件（输入框被聚焦），用户实测反馈为误触
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-' + key }, label),
        // 控件行（grid 第二列）与说明文字（第三列）分别为独立 grid item：三列
        // 各自成像，说明列起点由该列列宽统一决定——说明若跟在控件后面按流排，
        // 起笔位置会随行内 tag（条/小时/MB/天）的宽度逐行漂移（实测逐行参差）
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          React.createElement('input', {
            id: 'dsh-recall-cfg-' + key,
            'aria-labelledby': 'dsh-recall-cfg-label-' + key,
            className: 'dsh-recall-cfg-input',
            type: 'number',
            value: draft ? draft[key] : '',
            disabled: locked || !writable,
            min: opts && opts.min,
            step: opts && opts.step,
            onChange: (e: import('react').ChangeEvent<HTMLInputElement>) => edit(key, e.target.value),
          }),
          opts && opts.suffix ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, opts.suffix) : null,
          changed && !locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null,
          locked ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-locked' }, '环境变量锁定') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    // 布尔行：官方设置表单的布尔字段是 role=switch 滑钮（dsh-client-ui-settings-
    // plugins 实测），而非原生 checkbox——滑钮形态是 DSH 设置页的强视觉特征。
    // 名称经 aria-labelledby 关联标签文本（button 属 labelable 元素，用 label[for]
    // 关联会让点击标签直接切换开关——误触代价是配置被改），读屏经 role=switch +
    // aria-checked 播报开关语义与状态，不弱于原生 checkbox。
    function boolRow(key: string, label: string, hint: string): import('react').ReactNode {
      const changed = Boolean(draft && baseline && draft[key] !== baseline[key])
      const on = Boolean(draft && draft[key])
      return React.createElement('div', { className: 'dsh-recall-cfg-row', key: key },
        // 标签上提为 cfg-row 直接子元素（与 numRow 同法，V4 跨行对齐契约）
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-' + key }, label),
        // 与 numRow 同法：控件行（第二列）+ 说明（第三列）各自为 grid item。
        // -line-switch 修饰类把滑钮右缘推到数字行输入框的右边框上（滑钮只 36px
        // 宽，左对齐会在右侧留空档、与相邻数字行参差，用户实测反馈）
        React.createElement('div', { className: 'dsh-recall-cfg-line dsh-recall-cfg-line-switch' },
          React.createElement('button', {
            id: 'dsh-recall-cfg-' + key,
            type: 'button',
            role: 'switch',
            'aria-checked': on,
            'aria-labelledby': 'dsh-recall-cfg-label-' + key,
            className: 'dsh-recall-cfg-switch',
            disabled: !writable,
            onClick: () => edit(key, !on),
          }, React.createElement('span', { className: 'dsh-recall-cfg-switch-thumb' })),
          changed ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden[key] !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        React.createElement('div', { className: 'dsh-recall-cfg-hint' }, hint)
      )
    }

    function resetDefaults(): void {
      if (state.busy || !writable) return
      setState({ busy: true, message: '恢复默认中…', error: false })
      api<ConfigResetResponse>('config-reset', {}).then((res) => {
        if (res && res.ok) {
          load()
          setState({ busy: false, message: '已恢复默认值', error: false })
        } else {
          setState({ busy: false, message: (res && ((res as { message?: string }).message || (res as { error?: string }).error)) || '恢复默认失败', error: true })
        }
      }).catch((e) => setState({ busy: false, message: String(e), error: true }))
    }

    // draft/baseline 同生同灭（初始同 null、load() 同时赋值）——一并收窄，
    // 渲染区不再需要对 baseline 非空断言
    if (!draft || !baseline) {
      return React.createElement('div', { className: 'dsh-recall-ex-note' }, state.message || '正在读取配置…')
    }

    return React.createElement('div', { className: 'dsh-recall-ex-card' },
      // 全部行包进单一 cfg-grid：cfg-row 是 display:contents 透明层（css.ts），
      // 每字段留下标签／控件行／说明三个 grid item，分占第一/二/三列——第一列
      // max-content 由全表单最长标签决定（跨行对齐），第二列同理（说明列起点
      // 逐行齐平）。此前每行是独立 grid 容器，max-content 各算各的，实测参差。
      React.createElement('div', { className: 'dsh-recall-cfg-grid' },
      // V5 表单分组：9 字段平铺 → 「快照行为 / 自动治理」两组语义分组小标题，
      // 降低认知负担；「高级：基础排除表」沿用 SectionToggle 折叠，不重复加标题。
      React.createElement('div', { className: 'dsh-recall-cfg-group' }, '快照行为'),
      boolRow('snapshotEnabled', '启用快照', '关闭后不再新建快照；已有快照仍可撤回'),
      boolRow('refillDraft', '回填输入框', '撤回后把消息文本回填输入框，便于改完重发'),
      boolRow('archiveOriginal', '归档原会话', '原会话归档隐藏，可从归档找回；关闭则留在列表便于对照'),
      React.createElement('div', { className: 'dsh-recall-cfg-group' }, '自动治理'),
      // 单位后缀统一挂输入框右侧（与状态标签同基线），不再只藏在说明文字里
      numRow('gcSnaps', 'gc 触发条数', '每积累多少条快照触发一次 gc', { suffix: '条', min: 1, step: 1 }),
      numRow('gcHours', 'gc 触发小时', '距上次 gc 超过多少小时触发，与条数先到先触发', { suffix: '小时', min: 1, step: 1 }),
      numRow('maxFileBytes', '文件大小上限', '超过该大小的文件不进快照、不被回退触碰', { suffix: 'MB', min: 0.01, step: 0.5 }),
      numRow('maxSnapshotsPerWorkspace', '快照总量上限', '每工作区保留的最大快照数，超限删除最旧的；0 表示不限制', { suffix: '条', min: 0, step: 1 }),
      numRow('retentionDays', '快照保留天数', '超期快照自动删除最旧的；0 表示不启用', { suffix: '天', min: 0, step: 1 }),
      // 操作区在「基础排除表」折叠头之前：按钮服务整个表单（含折叠区之外的字段），
      // 排在折叠头之后会被误读为折叠区内容、折叠时像漏收起（用户实测反馈）；
      // 因此也不把按钮藏进折叠分支——否则折叠基础排除表后将无法保存。
      React.createElement('div', { className: 'dsh-recall-panel-actions' },
        state.message ? React.createElement('span', { role: 'status', 'aria-live': 'polite', className: 'dsh-recall-ex-status' + (state.error ? ' dsh-recall-ex-status-error' : ' dsh-recall-ex-status-success') }, (state.error ? '错误：' : '') + state.message) : null,
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn', disabled: state.busy || !writable, onClick: () => setDraft(baseline ? Object.assign({}, baseline) : null) }, '放弃修改'),
        React.createElement('button', {
          type: 'button',
          className: 'dsh-recall-btn',
          disabled: state.busy || !writable,
          title: '把所有字段恢复到插件出厂默认值',
          onClick: resetDefaults
        }, '恢复默认'),
        // 「保存」是表单唯一主动作，升主色实心按钮；放弃修改/恢复默认维持次级
        // 灰底（同排按钮只有一个视觉焦点，配色令牌经官方主题产物核验，见 css.ts）
        React.createElement('button', { type: 'button', className: 'dsh-recall-btn dsh-recall-btn-primary', disabled: state.busy || !writable, onClick: save }, '保存'),
        !writable ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '只读设置源') : null
      ),
      // divider：本条是折叠分区列表的首项，上方分界线把「字段表单」与「折叠
      // 分区」分开（否则保存按钮行紧贴折叠头，读起来像同一组字段）
      React.createElement(SectionToggle, { title: '高级：基础排除表', open: showAdvanced, onToggle: () => setShowAdvanced((v) => !v), divider: true }),
      showAdvanced ? React.createElement('div', { className: 'dsh-recall-cfg-row', key: 'baseExcludes' },
        // V4：标签上提（与 numRow 同法）；cfg-line 只剩 tags，textarea/hint 通栏
        React.createElement('span', { className: 'dsh-recall-cfg-label', id: 'dsh-recall-cfg-label-baseExcludes' }, '基础排除表'),
        React.createElement('div', { className: 'dsh-recall-cfg-line' },
          draft.baseExcludes !== baseline.baseExcludes ? React.createElement('span', { className: 'dsh-recall-cfg-tag dsh-recall-cfg-tag-modified' }, '已修改') : null,
          overridden && overridden.baseExcludes !== undefined ? React.createElement('span', { className: 'dsh-recall-cfg-tag' }, '已覆盖') : null
        ),
        // textarea/hint 加 cfg-span 通栏：折叠区在共享 grid 内展开时，内容若只占
        // 第二列，左侧标签列会成为竖直死区（实测 textarea 被挤窄）；通栏后与
        // 标签/tags 行左缘对齐。名称经 aria-labelledby 给出（与 numRow 同法，
        // 不建立 label 关联）
        React.createElement('textarea', {
          id: 'dsh-recall-cfg-baseExcludes',
          'aria-labelledby': 'dsh-recall-cfg-label-baseExcludes',
          className: 'dsh-recall-cfg-area dsh-recall-cfg-span',
          rows: 4,
          value: draft.baseExcludes,
          disabled: !writable,
          onChange: (e: import('react').ChangeEvent<HTMLTextAreaElement>) => edit('baseExcludes', e.target.value),
        }),
        React.createElement('div', { className: 'dsh-recall-cfg-hint dsh-recall-cfg-span' }, '各工作区共享的内置规则；gitignore 语法，每行一条；优先级低于「排除配置」的 exclude.txt')
      ) : null
      )
    )
  }

  return { ConfigForm }
}