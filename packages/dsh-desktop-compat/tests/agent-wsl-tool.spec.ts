import { describe, expect, it } from 'vitest'
import { createWslCommandArgs, installAgentWslTool, parseWslDistributions, selectWslDistribution } from '../src/agent-wsl-tool.ts'

describe('Agent WSL terminal selection', () => {
  it('parses UTF-16-style output and excludes application-owned distributions', () => {
    expect(parseWslDistributions('docker-desktop\u0000\r\nUbuntu\u0000\r\nDebian\r\nUbuntu\r\n')).toEqual(['Ubuntu', 'Debian'])
  })

  it('auto-selects only one user distribution', () => {
    expect(selectWslDistribution(['Ubuntu'])).toBe('Ubuntu')
    expect(() => selectWslDistribution(['Ubuntu', 'Debian'])).toThrow(/明确指定 distribution/u)
  })

  it('fails closed for missing, reserved or changed distributions', () => {
    expect(() => selectWslDistribution([])).toThrow(/没有可供 Agent 使用/u)
    expect(() => selectWslDistribution(['Ubuntu'], 'Debian')).toThrow(/未安装或不可用/u)
    expect(selectWslDistribution(['Ubuntu'], 'ubuntu')).toBe('Ubuntu')
  })

  it('passes the exact command as one WSL argument with the session workdir', () => {
    expect(createWslCommandArgs('Ubuntu', 'printf "%s" "$HOME"', 'D:\\project dir')).toEqual([
      '--distribution', 'Ubuntu', '--cd', 'D:\\project dir',
      '--exec', '/bin/sh', '-lc', 'printf "%s" "$HOME"',
    ])
  })

  it('registers only on Windows and keeps listing separate from command execution', () => {
    const names: string[] = []
    installAgentWslTool({ tools: { register: (tool: { name: string }) => { names.push(tool.name) } } } as never)
    expect(names).toEqual(process.platform === 'win32' ? ['desktop_wsl_list', 'desktop_wsl'] : [])
  })
})
