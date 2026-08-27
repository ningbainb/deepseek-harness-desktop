import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { SafePluginBoundary } from '../src/client/SafePluginBoundary.tsx'

function CrashingComponent(): React.ReactElement {
  throw new Error('Boom in community plugin')
}

function HealthyComponent(): React.ReactElement {
  return <div>Healthy Content</div>
}

describe('SafePluginBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <SafePluginBoundary pluginName="healthy-plugin">
        <HealthyComponent />
      </SafePluginBoundary>,
    )
    expect(screen.getByText('Healthy Content')).toBeDefined()
  })

  it('safely catches error and renders fallback without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <SafePluginBoundary
        pluginName="broken-plugin"
        fallback={<div>Fallback UI</div>}
      >
        <CrashingComponent />
      </SafePluginBoundary>,
    )
    expect(screen.getByText('Fallback UI')).toBeDefined()
    consoleSpy.mockRestore()
  })

  it('safely catches error and renders null if no fallback provided', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(
      <SafePluginBoundary pluginName="silent-broken-plugin">
        <CrashingComponent />
      </SafePluginBoundary>,
    )
    expect(container.firstChild).toBeNull()
    consoleSpy.mockRestore()
  })
})
