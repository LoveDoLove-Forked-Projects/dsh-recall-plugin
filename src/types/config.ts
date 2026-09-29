// 配置域类型（事实来源：src/host/config.js 的 Config schema 与 DEFAULTS）。
// 仅类型导出——共享运行时常量继续住 src/host/config.js。
//
// M4 起消费：config.ts 的 `createConfig(raw: RawConfig): ResolvedConfig` 与
// `DEFAULTS: ResolvedConfig` 标注（schema 增删字段时漏改 DEFAULTS 编译期报错，
// 消灭「改默认值两处同步改」的人工同步面）。

// A4：界面语言偏好（auto=跟随系统；zh/en=显式锁定）。client 侧解析成具体
// 语言（locales/index.ts 的 resolveLocale），host 只做搬运与取值校验。
export type LocalePref = 'auto' | 'zh' | 'en'

export interface ResolvedConfig {
  gcSnaps: number
  gcHours: number
  maxFileBytes: number
  maxSnapshotsPerWorkspace: number
  baseExcludes: string[]
  refillDraft: boolean
  snapshotEnabled: boolean
  archiveOriginal: boolean
  retentionDays: number
  locale: LocalePref
}

export type RawConfig = Partial<ResolvedConfig>
