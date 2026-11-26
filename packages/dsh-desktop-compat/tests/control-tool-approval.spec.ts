import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { controlToolApprovalDecision, installControlToolApproval } from '../src/control-tool-approval.ts'

async function runPreExecute(ctx: Context, name: string, session: unknown) {
  return (ctx as unknown as {
    waterfall: (target: unknown, event: string, exec: unknown, next: () => Promise<unknown>) => Promise<unknown>
  }).waterfall(ctx, 'tools/pre-execute', { name, agent: { session } }, async () => ({ kind: 'allow' }))
}

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
    expect(controlToolApprovalDecision('mcp__windows__Screenshot')).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__windows__Snapshot')).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__windows__DisplayInventory')).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__windows__Click')?.kind).toBe('ask')
    expect(controlToolApprovalDecision('mcp__windows__Type')?.kind).toBe('ask')
    expect(controlToolApprovalDecision('mcp__windows__Click', 'ask', { fullAccessUnattended: true })).toBeUndefined()
    expect(controlToolApprovalDecision('mcp__windows__Type', 'ask', { fullAccessUnattended: true })).toBeUndefined()
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

  it('passes through mutating browser and computer tools under danger-full-access + never policy', async () => {
    const ctx = new Context()
    const session = { id: 'full-never' }
    ;(ctx as unknown as Record<string, unknown>).approval = { effectivePolicy: () => 'never' }
    ;(ctx as unknown as Record<string, unknown>).permissionPresets = {
      current: () => 'danger-full-access',
      permissionState: () => ({ sandbox: 'danger-full-access', approval: 'never' }),
    }
    installControlToolApproval(ctx)

    expect(await runPreExecute(ctx, 'mcp__playwright-mcp__browser_navigate', session)).toEqual({ kind: 'allow' })
    expect(await runPreExecute(ctx, 'mcp__chrome-devtools-mcp__click', session)).toEqual({ kind: 'allow' })
    expect(await runPreExecute(ctx, 'cua_driver_native__click', session)).toEqual({ kind: 'allow' })
    expect((await runPreExecute(ctx, 'desktop_wsl', session) as { kind: string }).kind).toBe('ask')
  })

  it('keeps one-shot approval when approval policy is ask or sandbox is not danger-full-access', async () => {
    const askCtx = new Context()
    const session = { id: 'full-ask' }
    ;(askCtx as unknown as Record<string, unknown>).approval = { effectivePolicy: () => 'ask' }
    ;(askCtx as unknown as Record<string, unknown>).permissionPresets = {
      current: () => 'desktop-full-access-ask',
      permissionState: () => ({ sandbox: 'danger-full-access', approval: 'ask' }),
    }
    installControlToolApproval(askCtx)
    expect((await runPreExecute(askCtx, 'mcp__playwright-mcp__browser_navigate', session) as { kind: string }).kind).toBe('ask')
    expect((await runPreExecute(askCtx, 'cua_driver_native__click', session) as { kind: string }).kind).toBe('ask')

    const restrictedCtx = new Context()
    ;(restrictedCtx as unknown as Record<string, unknown>).approval = { effectivePolicy: () => 'never' }
    ;(restrictedCtx as unknown as Record<string, unknown>).permissionPresets = {
      current: () => 'workspace-write',
      permissionState: () => ({ sandbox: 'workspace-write', approval: 'never' }),
    }
    installControlToolApproval(restrictedCtx)
    expect((await runPreExecute(restrictedCtx, 'mcp__playwright-mcp__browser_navigate', session) as { kind: string }).kind).toBe('ask')
  })
})
