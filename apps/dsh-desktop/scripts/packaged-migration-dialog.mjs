import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const AUTOMATION_SCRIPT = join(SCRIPT_DIRECTORY, 'automate-packaged-migration-dialog.ps1')

const BUTTONS = Object.freeze({
  continue: '继续迁移',
  native: Object.freeze({
    rollback: '回滚并退出',
  }),
  recovery: Object.freeze({
    rollback: '回滚迁移',
  }),
})

const SURFACES = new Set(['native', 'recovery'])

export function packagedMigrationDialogButton(decision, { surface = 'native' } = {}) {
  if (!SURFACES.has(surface)) throw new TypeError('packaged migration surface is invalid')
  const button = decision === 'continue' ? BUTTONS.continue : BUTTONS[surface][decision]
  if (typeof button !== 'string') throw new TypeError('packaged migration decision is invalid')
  return button
}

/** Invoke one exact, process-owned migration action from the external E2E harness. */
export async function automatePackagedMigrationDialog({
  processId,
  decision,
  surface = 'native',
  timeoutMs = 30_000,
} = {}) {
  if (process.platform !== 'win32') throw new Error('packaged migration decision automation requires Windows')
  if (!Number.isInteger(processId) || processId <= 0) throw new TypeError('packaged Desktop process id is invalid')
  packagedMigrationDialogButton(decision, { surface })
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new TypeError('packaged migration dialog timeout is invalid')
  }
  try {
    // PowerShell 7 exposes Windows UIAutomation Button controls faithfully;
    // Windows PowerShell 5.1 can misreport native buttons as Pane controls.
    const result = await execFileAsync('pwsh.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-STA',
      '-File', AUTOMATION_SCRIPT,
      '-ProcessId', String(processId),
      '-Decision', decision,
      '-Surface', surface,
      '-TimeoutMs', String(timeoutMs),
    ], {
      windowsHide: true,
      timeout: timeoutMs + 10_000,
      maxBuffer: 16_384,
    })
    return Object.freeze({ decision, output: result.stdout.trim() })
  } catch (error) {
    const detail = [error?.stdout, error?.stderr, error?.message]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .slice(-4_000)
    throw new Error(`packaged ${surface} migration automation failed for ${decision}${detail ? `: ${detail}` : ''}`, { cause: error })
  }
}
