/**
 * issue #30：dump 脚本（POSIX 模板）真执行回归
 *
 * 已有的 stores-dump.test.js / scripts-contract.test.js 只断言「生成的脚本字符串」
 * 与「解析器行为」，从不执行生成的脚本——于是两个只在执行期才暴露的缺陷全绿漏过：
 * 1) set -e 下裸 cat 可选文件（空仓没有 index.json）→ 整条 dump 退出 1；
 * 2) 落盘内容无尾换行（writeTextViaShell = cat > file），cat 后紧接 echo 把
 *    INDEXEND/EXCLEND 粘到内容行尾 → 解析器按整行匹配收不到段尾。
 * 本文件用真 bash 跑生成的脚本，把「字符串正确」升级成「行为正确」。
 *
 * win32 只在 Git Bash（MINGW/MSYS/CYGWIN）上跑：WSL bash 报 Linux，且无法直接
 * 使用本测试的 Windows 风格 fixture 路径，故不认；找不到就整组跳过（CI 在
 * ubuntu 必然执行，本地 win32 装了 Git Bash 即可复现）。
 */

import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { storesDumpScript, excludeDumpScript } from '../../src/host/scripts.posix.js'
import { parseStoresDump, parseExcludeDump } from '../../src/host/dump-parse.js'

// 探测可用的 POSIX shell：非 win32 直接认 bash；win32 只认 Git Bash 一类方言
function findBash() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', 'bash']
    : ['bash']
  for (const exe of candidates) {
    try {
      const out = String(execFileSync(exe, ['-c', 'uname -s'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim()
      if (process.platform !== 'win32' || /^(MINGW|MSYS|CYGWIN)/.test(out)) return exe
    } catch (error) { /* 换下一个候选 */ }
  }
  return null
}

const BASH = findBash()

// 与 writeTextViaShell 同形：内容原样落盘（默认不带尾换行）
function put(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// 一个 store 目录的最小形态：git/ 子目录 + 可选的三个元数据文件。内容一律不带
// 尾换行——这正是生产写入路径的字节形态，也是粘连缺陷的触发条件。
function makeStore(container, name, { index, lineage, root } = {}) {
  const dir = path.join(container, name)
  fs.mkdirSync(path.join(dir, 'git'), { recursive: true })
  if (index !== undefined) put(path.join(dir, 'index.json'), index)
  if (lineage !== undefined) put(path.join(dir, 'lineage.json'), lineage)
  if (root !== undefined) put(path.join(dir, 'root.txt'), root)
  return dir
}

function runScript(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
  const file = path.join(dir, 'dump.sh')
  // Git Bash 两种分隔符都吃，统一正斜杠避免转义歧义
  fs.writeFileSync(file, body)
  const res = spawnSync(BASH, [file.replace(/\\/g, '/')], { encoding: 'utf8' })
  return { dir, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' }
}

// 脚本回显的目录可能带平台路径前缀，按结尾段定位某个 store 的解析结果
function infoFor(map, name) {
  const hit = Array.from(map.entries()).find(([dir]) => dir.replace(/\\/g, '/').endsWith('/' + name))
  return hit ? hit[1] : null
}

describe.skipIf(!BASH)('storesDumpScript（POSIX 真执行 · issue #30）', () => {
  it('健康 store：无尾换行的 index/lineage 也能解析出内容', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
    makeStore(container, 'storeA', {
      index: JSON.stringify([{ id: 'm1', time: 1700000000000, root: '/home/u/ws', sessionId: 's1' }]),
      lineage: JSON.stringify([{ childId: 'c1', parentId: 'p1', time: 1 }]),
      root: '/home/u/ws',
    })
    const res = runScript(storesDumpScript(container.replace(/\\/g, '/'), []))
    expect(res.status).toBe(0)
    const info = infoFor(parseStoresDump(res.stdout), 'storeA')
    expect(info.root).toBe('/home/u/ws')
    expect(info.entries).toEqual([{ id: 'm1', time: 1700000000000, root: '/home/u/ws', sessionId: 's1' }])
    expect(info.lineage).toEqual([{ childId: 'c1', parentId: 'p1', time: 1 }])
  })

  it('空仓（index/lineage 都缺）：退出 0，两段按无处理', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
    makeStore(container, 'storeB')
    const res = runScript(storesDumpScript(container.replace(/\\/g, '/'), []))
    expect(res.status).toBe(0)
    const info = infoFor(parseStoresDump(res.stdout), 'storeB')
    expect(info.entries).toBe(null)
    expect(info.lineage).toBe(null)
  })

  it('index 损坏只丢该 store，同容器其余 store 照常解析', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
    makeStore(container, 'storeC', { index: '{"broken":' })
    makeStore(container, 'storeD', { index: JSON.stringify([{ id: 'ok' }]) })
    const res = runScript(storesDumpScript(container.replace(/\\/g, '/'), []))
    expect(res.status).toBe(0)
    const map = parseStoresDump(res.stdout)
    expect(infoFor(map, 'storeC').entries).toBe(null)
    expect(infoFor(map, 'storeD').entries).toEqual([{ id: 'ok' }])
  })

  it('index 为显式空数组 → entries 是 []（不是 null），gc 空仓回收判据成立', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
    makeStore(container, 'storeE', { index: '[]' })
    const res = runScript(storesDumpScript(container.replace(/\\/g, '/'), []))
    expect(res.status).toBe(0)
    expect(infoFor(parseStoresDump(res.stdout), 'storeE').entries).toEqual([])
  })

  it('内容自带尾换行 / 多行 pretty JSON：补的换行不制造空段', () => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dump-'))
    makeStore(container, 'storeF', { index: '[\n  {"id": "p1"}\n]\n' })
    const res = runScript(storesDumpScript(container.replace(/\\/g, '/'), []))
    expect(res.status).toBe(0)
    expect(infoFor(parseStoresDump(res.stdout), 'storeF').entries).toEqual([{ id: 'p1' }])
  })
})

describe.skipIf(!BASH)('excludeDumpScript（POSIX 真执行 · issue #30 同族）', () => {
  it('内容字节数为 3 的倍数（base64 无 padding）时不被 EXCLEND 尾巴污染', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-excl-'))
    // 'abc' 恰 3 字节 → base64 无 '='，拼接缺陷会把这截尾巴解成垃圾字节
    put(path.join(dir, 'exact.txt'), 'abc')
    put(path.join(dir, 'padded.txt'), 'node_modules/\n')
    const files = [path.join(dir, 'exact.txt'), path.join(dir, 'padded.txt')].map((f) => f.replace(/\\/g, '/'))
    const res = runScript(excludeDumpScript(files))
    expect(res.status).toBe(0)
    const map = parseExcludeDump(res.stdout)
    expect(map.get(files[0])).toBe('abc')
    expect(map.get(files[1])).toBe('node_modules/\n')
  })
})
