import { describe, expect, it } from 'vitest'
import { parseSimpleIndex, pickWheelEntry, probeMirrors } from '../src/host/mirrors.ts'

describe('dsh-win-control PyPI mirrors', () => {
  const sampleHtml = `
    <html><body>
      <a href="../../packages/windows_mcp-0.8.7-py3-none-any.whl#sha256=aaa">windows_mcp-0.8.7-py3-none-any.whl</a>
      <a href="../../packages/windows_mcp-0.8.8-py3-none-any.whl#sha256=bbb">windows_mcp-0.8.8-py3-none-any.whl</a>
      <a href="../../packages/windows_mcp-0.9.0rc1-py3-none-any.whl">windows_mcp-0.9.0rc1-py3-none-any.whl</a>
    </body></html>
  `

  it('parses simple index links and picks pinned or latest stable wheel', () => {
    const entries = parseSimpleIndex(sampleHtml, 'https://mirrors.ustc.edu.cn/pypi/simple/windows-mcp/')
    expect(entries).toHaveLength(3)
    expect(pickWheelEntry(entries)?.version).toBe('0.8.8')
    expect(pickWheelEntry(entries, '0.8.7')?.version).toBe('0.8.7')
    expect(pickWheelEntry(entries, '9.9.9')).toBeNull()
  })

  it('ranks working mirrors by speed and keeps official PyPI last', async () => {
    const candidates = [
      { id: 'pypi', label: 'PyPI 官方', indexUrl: 'https://pypi.org/simple', official: true },
      { id: 'slow', label: 'Slow', indexUrl: 'https://slow.example/simple', official: false },
      { id: 'fast', label: 'Fast', indexUrl: 'https://fast.example/simple', official: false },
      { id: 'down', label: 'Down', indexUrl: 'https://down.example/simple', official: false },
    ]

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('down.example')) throw new Error('ECONNREFUSED')
      if (url.endsWith('/windows-mcp/')) {
        return new Response(sampleHtml, { status: 200, headers: { 'content-type': 'text/html' } })
      }
      if (url.includes('slow.example')) {
        await new Promise(resolve => setTimeout(resolve, 40))
        return new Response(new Uint8Array(1024), { status: 206 })
      }
      if (url.includes('fast.example')) {
        return new Response(new Uint8Array(65536), { status: 206 })
      }
      return new Response(new Uint8Array(128 * 1024), { status: 206 })
    }

    const ranked = await probeMirrors({ candidates, version: '0.8.8', fetchImpl, timeoutMs: 2000 })
    expect(ranked.map(item => item.id)).toEqual(['fast', 'slow', 'down', 'pypi'])
    expect(ranked[0].ok).toBe(true)
    expect(ranked[2].ok).toBe(false)
    expect(ranked[3].official).toBe(true)
  })
})
