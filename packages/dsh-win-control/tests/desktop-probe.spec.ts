import { describe, expect, it } from 'vitest'
import { describeProbe, parseProbeOutput } from '../src/host/desktop-probe.ts'

describe('dsh-win-control desktop probe', () => {
  it('parses the last JSON line while ignoring PowerShell warnings', () => {
    const raw = [
      'WARNING: some banner line',
      '{"uia":0,"windows":7,"scale":1.5}',
    ].join('\r\n')
    expect(parseProbeOutput(raw)).toEqual({
      uiaWindows: 0,
      windowHandles: 7,
      displayScale: 1.5,
    })
    expect(parseProbeOutput('not json')).toBeNull()
  })

  it('emits actionable advisories for empty UIA and high DPI', () => {
    const outcome = describeProbe({ uiaWindows: 0, windowHandles: 6, displayScale: 1.5 })
    expect(outcome.line).toContain('UI Automation 可见 0 个顶层窗口')
    expect(outcome.line).toContain('系统缩放 150%')
    expect(outcome.notes).toHaveLength(2)
    expect(outcome.notes[0]).toContain('issues/607')
    expect(outcome.notes[1]).toContain('Snapshot')
  })
})
