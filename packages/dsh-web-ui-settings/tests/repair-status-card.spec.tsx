/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RepairStatusCard } from '../src/client/RepairStatusCard.tsx'

const labels: Record<string, string> = {
  repairTitle: 'Automatic repair',
  repairDescription: 'Private local repair history',
  repairNone: 'No automatic repair has run.',
  repairLoading: 'Loading repair history',
  repairExpand: 'Show repair details',
  repairCollapse: 'Hide repair details',
  repairApplied: 'Applied',
  repairRolledBack: 'Rolled back',
  repairExhausted: 'Not applied',
  repairPending: 'In progress',
  repairModels: 'Models',
  repairFiles: 'Changed files',
  repairChecks: 'Checks',
  repairFingerprint: 'Fingerprint',
  repairOpenLogs: 'Open local logs',
  repairExportDiagnostics: 'Export redacted diagnostics',
  repairNoItems: 'None',
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'dshDesktop')
})

describe('RepairStatusCard', () => {
  it('keeps a privacy-safe repair record collapsed until the user opens advanced details', async () => {
    const action = vi.fn(async () => undefined)
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        getRepairStatus: vi.fn(async () => ({
          available: true,
          fingerprint: 'a'.repeat(64),
          state: 'applied',
          result: 'applied',
          createdAt: '2026-08-22T01:02:03.000Z',
          updatedAt: '2026-08-22T01:03:04.000Z',
          models: [{ provider: 'configured', model: 'repair-model', outcome: 'candidate-ready' }],
          changedFiles: ['plugins/example/index.mjs'],
          checks: ['plugin-example-test'],
        })),
        action,
      },
    })

    render(<RepairStatusCard t={(key) => labels[key] ?? key} />)
    await screen.findByText('Applied')
    expect(screen.queryByText('plugins/example/index.mjs')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show repair details' }))
    expect(screen.getByText('plugins/example/index.mjs')).toBeTruthy()
    expect(screen.getByText('configured / repair-model')).toBeTruthy()
    expect(screen.getByText('plugin-example-test')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/prompt|api.?key|迁移|隔离|安全模式/iu)

    fireEvent.click(screen.getByRole('button', { name: 'Open local logs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export redacted diagnostics' }))
    await waitFor(() => expect(action.mock.calls).toEqual([['open-logs'], ['export-diagnostics']]))
  })

  it('renders a quiet empty state when Desktop has no repair incident', async () => {
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: { getRepairStatus: vi.fn(async () => ({ available: false })) },
    })
    render(<RepairStatusCard t={(key) => labels[key] ?? key} />)
    expect(await screen.findByText('No automatic repair has run.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show repair details' })).toBeNull()
  })
})
