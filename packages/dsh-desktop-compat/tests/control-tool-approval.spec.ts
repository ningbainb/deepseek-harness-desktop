import { describe, expect, it } from 'vitest'
import { controlToolApprovalDecision } from '../src/control-tool-approval.ts'

describe('Desktop control tool approval policy', () => {
  it('allows browser observations without prompting', () => {
    expect(controlToolApprovalDecision('mcp__playwright-mcp__browser_snapshot')).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__chrome-devtools-mcp__take_screenshot')).toBeUndefined()
    expect(controlToolApprovalDecision('stagehand_extract')).toBeUndefined()
  })

  it('asks once for browser actions that can change state', () => {
    expect(controlToolApprovalDecision('mcp__playwright-mcp__browser_click')?.kind).toBe('ask')
    expect(controlToolApprovalDecision('mcp__playwright-mcp__browser_file_upload')?.kind).toBe('ask')
    expect(controlToolApprovalDecision('stagehand_act')?.kind).toBe('ask')
  })

  it('allows computer observations and asks for input', () => {
    expect(controlToolApprovalDecision('cua_driver_native__list_windows')).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__cua-driver-mcp__take_screenshot')).toBeUndefined()
    expect(controlToolApprovalDecision('cua_driver_native__click')?.kind).toBe('ask')
    expect(controlToolApprovalDecision('mcp__cua-driver-mcp__type_text')?.kind).toBe('ask')
  })

  it('does not affect unrelated tools', () => {
    expect(controlToolApprovalDecision('bash')).toBeUndefined()
    expect(controlToolApprovalDecision('pwsh')).toBeUndefined()
    expect(controlToolApprovalDecision('desktop_wsl_list')).toBeUndefined()
  })

  it('requires one-shot approval for every Agent WSL command', () => {
    expect(controlToolApprovalDecision('desktop_wsl')).toEqual({
      kind: 'ask',
      reason: expect.stringContaining('Windows 沙箱之外'),
    })
    expect(controlToolApprovalDecision('desktop_wsl', 'off')?.kind).toBe('deny')
    expect(controlToolApprovalDecision('desktop_wsl', 'allow')).toEqual({ kind: 'allow' })
  })
})
