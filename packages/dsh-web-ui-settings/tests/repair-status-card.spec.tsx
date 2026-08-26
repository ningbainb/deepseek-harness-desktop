/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RepairStatusCard } from '../src/client/RepairStatusCard.tsx'

const labels: Record<string, string> = {
  repairTitle: 'Automatic repair',
  repairDescription: 'Private local repair history',
  repairNone: 'No automatic repair has run.',
  repairFullRetryFailed: 'Full startup and automatic repair did not complete; built-in plugins are active.',
  repairMissingCredentials: 'No model Key is configured, so automatic repair did not call a model. Add a Key in Model settings first.',
  repairNoModel: 'No repair model is configured. Choose a model and add its Key in Model settings.',
  repairUnsupportedTools: 'The selected model does not support the tools required for automatic repair.',
  repairFailed: 'Automatic repair did not pass verification; built-in plugins are active.',
  repairBudgetExhausted: 'Automatic repair reached its safe attempt limit; built-in plugins are active.',
  repairProfilePermission: 'A data-directory permission blocked full startup. Check the directory permissions.',
  repairProfileInstallation: 'Installed application files blocked full startup. Repair or reinstall the application.',
  repairProfileFailed: 'The application data directory could not finish startup. Check the local logs.',
  repairRetry: 'Save and try again',
  repairRetrying: 'Restarting and retrying',
  repairRetryFailed: 'The retry could not start. Try again later.',
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
  it('explains missing model credentials and offers a safe retry', async () => {
    const retry = vi.fn(async () => ({ accepted: true }))
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        getRepairStatus: vi.fn(async () => ({
          available: false,
          reason: 'missing-credentials',
          canRetry: true,
        })),
        retryRepair: retry,
      },
    })

    render(<RepairStatusCard t={(key) => labels[key] ?? key} />)
    expect(await screen.findByText(labels.repairMissingCredentials)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save and try again' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save and try again' }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    expect(document.body.textContent).not.toMatch(/secret-value|prompt|migration|isolation/iu)
  })
})
