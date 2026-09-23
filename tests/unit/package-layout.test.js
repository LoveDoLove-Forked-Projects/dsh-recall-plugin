/**
 * 发布包内容布局断言（P1-1；P2-4 收口补齐）
 *
 * npm pack --dry-run --json 输出包里实际会安装的文件，据此钉住 files 白名单：
 * - 运行时文件必须进包（lib/、assets/icon.svg 等发布资源、cordis.patch.yml、README、LICENSE、package.json）；
 * - 仓库开发文件绝不进包（AGENTS.md / docs/（含 docs/reference 镜像）/ tests/ / scripts/——
 *   AGENTS.md 已在 .gitignore 中确认不进 npm，这里从 pack 输出侧再兜一道；
 *   scripts/ 是 P2-5 起的发布前巡检脚本，同样不是运行时产物）。
 * 借鉴 turn-rewind 的 package-layout 思路，用 node:child_process 跑产物断言，
 * 比 CI shell 步骤更可移植（跨平台跑同一份逻辑）。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let files = []
beforeAll(() => {
  // Windows 上 npm 是 .cmd 批处理：直接 spawn 会 EINVAL，shell 又会触发
  // DEP0190 弃用噪音——探测 npm-cli.js 用 node 直跑最干净；找不到时才
  // 退回 shell（参数是固定白名单，无注入面）。
  let cmd = 'npm'
  let args = ['pack', '--dry-run', '--json']
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]
    const cli = candidates.find((c) => fs.existsSync(c))
    if (cli) { cmd = process.execPath; args = [cli, ...args] }
  }
  const stdout = execFileSync(cmd, args, {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'npm',
  })
  const parsed = JSON.parse(stdout)
  // npm < 11 输出数组 [{...}]，npm 11+ 输出 {<包名>: {...}}——两种形状都取首个条目
  const item = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
  files = (item && Array.isArray(item.files) ? item.files : []).map((f) => f.path)
})

describe('npm 发布包内容', () => {
  it('pack --dry-run 能正常出包', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('运行时文件全部在包内', () => {
    const required = [
      'lib/index.js', 'lib/client.js', 'lib/config.js', 'lib/store.js',
      'lib/snapshots.js', 'lib/maintenance.js', 'lib/scripts.pwsh.js',
      'lib/scripts.posix.js', 'cordis.patch.yml', 'README.md', 'LICENSE',
      'package.json', 'assets/icon.svg',
    ]
    for (const rel of required) expect(files, 'pack 缺少 ' + rel).toContain(rel)
  })

  // 图标读的是包导出解析出来的 package.json 旁文件（dsh-app-boot 的 readPluginMeta →
  // iconOf），任一条判据不满足时宿主只留 metadata error、图标静默不显示——漏配要到
  // 线上才看得出来。这里把官方判据逐条钉住（相对路径 / 四格式 / ≤256 KiB / realpath
  // 后仍在包目录内 / 常规文件），并借 pack 输出确认 files 白名单覆盖了图标文件。
  it('icon 声明满足宿主读取判据且随包发布', () => {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const icon = manifest.icon
    expect(typeof icon, 'package.json 缺 icon 字段').toBe('string')
    expect(path.isAbsolute(icon) || /^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon), 'icon 必须是相对路径').toBe(false)
    expect(['.svg', '.png', '.jpg', '.jpeg', '.webp']).toContain(path.extname(icon).toLowerCase())
    const file = fs.realpathSync(path.join(root, icon))
    const local = path.relative(fs.realpathSync(root), file)
    expect(local === '..' || local.startsWith('..' + path.sep) || path.isAbsolute(local), 'icon 必须留在包目录内').toBe(false)
    expect(fs.statSync(file).isFile(), 'icon 必须是常规文件').toBe(true)
    expect(fs.statSync(file).size, 'icon 不得超过 256 KiB').toBeLessThanOrEqual(256 * 1024)
    expect(files, 'pack 缺少 ' + icon).toContain(icon)
  })

  it('仓库开发文件不进包（AGENTS.md / docs / tests / scripts）', () => {
    for (const disallowed of ['AGENTS.md', 'docs/', 'tests/', 'scripts/']) {
      expect(files.some((f) => f.startsWith(disallowed)), 'pack 泄漏 ' + disallowed).toBe(false)
    }
  })
})