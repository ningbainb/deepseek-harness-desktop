import React, { Component, type ErrorInfo, type ReactNode } from 'react'

export interface SafePluginBoundaryProps {
  children?: ReactNode
  pluginName?: string
  fallback?: ReactNode | ((error: Error) => ReactNode)
  onError?: (error: Error, info: ErrorInfo) => void
}

export interface SafePluginBoundaryState {
  hasError: boolean
  error?: Error
}

/**
 * Isolates third-party / community plugin components in an ErrorBoundary.
 * If a plugin crashes or throws an exception during render or lifecycle,
 * the error is safely caught and contained without breaking the main app
 * (leaving the sidebar, input bar, and buttons fully interactive).
 */
export class SafePluginBoundary extends Component<SafePluginBoundaryProps, SafePluginBoundaryState> {
  override state: SafePluginBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): SafePluginBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(`[plugin-boundary] Plugin ${this.props.pluginName ?? 'unknown'} threw during render:`, error, info)
    this.props.onError?.(error, info)
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error ?? new Error('Unknown plugin error'))
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return null
    }
    return this.props.children
  }
}
