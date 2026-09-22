import { describe, expect, it } from 'vitest'
import { parseAgentWslPermission } from '../src/agent-wsl-permission.ts'

describe('Agent WSL permission policy', () => {
  it('defaults to per-command approval only when the file is absent', () => {
    expect(parseAgentWslPermission()).toBe('ask')
  })

  it('accepts only explicit versioned modes', () => {
    for (const mode of ['off', 'ask', 'allow'] as const) {
      expect(parseAgentWslPermission(JSON.stringify({ version: 1, mode }))).toBe(mode)
    }
    for (const raw of ['{}', '{', '{"version":2,"mode":"allow"}', '{"version":1,"mode":"yes"}']) {
      expect(parseAgentWslPermission(raw)).toBe('off')
    }
  })
})
