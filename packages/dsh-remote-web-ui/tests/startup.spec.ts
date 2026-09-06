import { describe, expect, it } from 'vitest'

import { validateWebHost, webCommand } from '../src/startup'

describe('remote web startup seam', () => {
  it('accepts only the official host-webserver bind literals', () => {
    expect(validateWebHost(undefined)).toBeUndefined()
    expect(validateWebHost('127.0.0.1')).toBe('127.0.0.1')
    expect(validateWebHost('0.0.0.0')).toBe('0.0.0.0')
    expect(() => validateWebHost('192.168.225.105')).toThrow(/web host/u)
    expect(() => validateWebHost(null)).toThrow(/web host/u)
  })

  it('exposes LAN binding as an explicit command-line option', () => {
    const options = webCommand().options.map((option) => option.long)
    expect(options).toContain('--host')
    expect(options).toContain('--no-open')
    expect(options).toContain('--port')
    expect(options).toContain('--trusted-host')
  })
})
