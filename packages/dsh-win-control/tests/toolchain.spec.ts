import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings } from '../src/core/settings.ts'
import {
  PROFILE_BLOCK_BEGIN,
  PROFILE_BLOCK_END,
  buildBridgeOverrideBlock,
  createToolchainInstaller,
  executableIn,
  managedExecutable,
  parseProcessLines,
  processesUnder,
  toolDirectoryFor,
  upsertBridgeOverride,
} from '../src/host/toolchain.ts'

describe('dsh-win-control toolchain', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('discovers executables and parses running process locks', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-win-control-tc-'))
    dirs.push(root)
    const toolDir = toolDirectoryFor(root, '0.8.8')
    const scriptsDir = join(toolDir, 'Scripts')
    mkdirSync(scriptsDir, { recursive: true })
    const exe = join(scriptsDir, 'windows-mcp.exe')
    writeFileSync(exe, '')

    expect(executableIn(toolDir)).toBe(exe)
    expect(managedExecutable(root, '0.8.8')).toBe(exe)

    const entries = parseProcessLines(`101|C:\\Windows\\System32\\cmd.exe\n202|${exe}\n`)
    expect(processesUnder(join(root, '0.8.8'), entries, 'win32')).toEqual([{ pid: 202, path: exe }])
  })

  it('idempotently inserts and updates managed profile patch block', () => {
    const block1 = buildBridgeOverrideBlock('C:\\tools\\windows-mcp.exe', defaultSettings(), '0.8.8')
    const initial = upsertBridgeOverride('- id: custom-plugin\n  disabled: false\n', block1)
    expect(initial).toContain('- id: custom-plugin')
    expect(initial).toContain(PROFILE_BLOCK_BEGIN)
    expect(initial).toContain(PROFILE_BLOCK_END)
    expect(initial).toContain('disabled: false')

    const updatedSettings = defaultSettings()
    updatedSettings.bridge.screenshotScale = 0.5
    const block2 = buildBridgeOverrideBlock('C:\\tools\\windows-mcp.exe', updatedSettings, '0.8.8')
    const replaced = upsertBridgeOverride(initial, block2)
    expect(replaced.split(PROFILE_BLOCK_BEGIN)).toHaveLength(2)
    expect(replaced).toContain('"0.5"')
    expect(replaced).toContain('- id: custom-plugin')
  })

  it('refuses install when windows-mcp process is locked and supports cancellation', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-win-control-inst-'))
    dirs.push(home)
    const lockedInstaller = createToolchainInstaller({
      home,
      listProcessesImpl: async () => [{ pid: 999, path: join(home, 'win-control', 'toolchain', '0.8.8', 'windows-mcp', 'Scripts', 'windows-mcp.exe') }],
    })
    const locked = await lockedInstaller.start({ version: '0.8.8', settings: defaultSettings(), profileDir: null })
    expect(locked.state).toBe('failed')
    expect(locked.error).toContain('999')

    class FakeChild extends EventEmitter {
      stdout = new EventEmitter()
      stderr = new EventEmitter()
      killed = false
      kill() {
        this.killed = true
        this.emit('close', null)
      }
    }
    const child = new FakeChild()
    const installer = createToolchainInstaller({
      home,
      listProcessesImpl: async () => [],
      probeMirrorsImpl: async () => [{ id: 'ustc', label: 'USTC', indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple', official: false, ok: true }],
      spawnImpl: (() => child) as unknown as typeof import('node:child_process').spawn,
    })

    const run = installer.start({ version: '0.8.8', settings: defaultSettings(), profileDir: null })
    await new Promise(resolve => setTimeout(resolve, 15))
    installer.cancel()
    const outcome = await run
    expect(child.killed).toBe(true)
    expect(outcome.state).toBe('cancelled')
  })
})
