import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { packagedMigrationDialogButton } from '../scripts/packaged-migration-dialog.mjs'

test('packaged migration automation is restricted to exact process-owned surface buttons', () => {
  assert.equal(packagedMigrationDialogButton('continue'), '继续迁移')
  assert.equal(packagedMigrationDialogButton('rollback'), '回滚并退出')
  assert.equal(packagedMigrationDialogButton('continue', { surface: 'recovery' }), '继续迁移')
  assert.equal(packagedMigrationDialogButton('rollback', { surface: 'recovery' }), '回滚迁移')
  for (const value of ['', 'quit', 'Continue', undefined, null]) {
    assert.throws(() => packagedMigrationDialogButton(value), /decision is invalid/u)
  }
  for (const value of ['', 'shell', 'Recovery', null]) {
    assert.throws(() => packagedMigrationDialogButton('continue', { surface: value }), /surface is invalid/u)
  }
})

test('TaskDialog MSAA fallback remains constrained to an exact native PushButton default action', async () => {
  const source = await readFile(new URL('../scripts/automate-packaged-migration-dialog.ps1', import.meta.url), 'utf8')

  assert.match(source, /function Get-ExactNativeMsaaPushButton/u)
  assert.match(source, /ValidateSet\('native', 'recovery'\)/u)
  assert.match(source, /AccessibleObjectFromWindow/u)
  assert.match(source, /\$TargetProcessIds -notcontains \(\[int\]\$nativeProcessId\)/u)
  assert.match(source, /\$accessibleName -cne \$ExpectedName -or \$accessibleRole -ne 43/u)
  assert.match(source, /IsNullOrWhiteSpace\(\$accessibleDefaultAction\)/u)
  assert.match(source, /\$matchesButtonName -and \$matchesPaneControlType/u)
  assert.match(source, /\$matchesVisibleButton = -not \[bool\]\$current\.IsOffscreen/u)
  assert.match(source, /\$matchesButtonName -and \$matchesButtonControlType -and \$matchesVisibleButton/u)
  assert.match(source, /\[System\.Windows\.Automation\.ControlType\]::Pane\.Id/u)
  assert.match(source, /\$msaaFallback\.AccessibleObject\.accDoDefaultAction\(0\)/u)

  const uiAutomationInvoke = source.indexOf('$pattern.Invoke()')
  const msaaDefaultAction = source.indexOf('$msaaFallback.AccessibleObject.accDoDefaultAction(0)')
  assert.ok(uiAutomationInvoke >= 0 && uiAutomationInvoke < msaaDefaultAction, 'UIA Button+Invoke must stay preferred')
})
