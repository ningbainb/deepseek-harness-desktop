import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron } from 'playwright'

import { createPresetBuffer } from '../src/presets/preset-archive.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const delay = (milliseconds) => new Promise((resolveDelay) => { setTimeout(resolveDelay, milliseconds) })

async function waitForWindow(app, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = app.windows().find(predicate)
    if (match) return match
    await delay(100)
  }
  throw new Error('timed out waiting for the expected Desktop window')
}

/** Verify that an untrusted preset launch previews only, then an allowlisted deep link drains after Runtime readiness. */
export async function runPresetDeepLinkE2E({ appDir, executablePath, electronPath, timeoutMs = 120_000 }) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-preset-deep-link-e2e-'))
  const dshHome = join(temporary, 'dsh-home')
  const userData = join(temporary, 'user-data')
  const presetPath = join(temporary, 'review-only.dshpreset')
  const desktopManifest = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8'))
  const runtimeVersion = desktopManifest.dependencies?.['@deepseek-ai/dsh']
  if (typeof runtimeVersion !== 'string') throw new Error('Desktop manifest does not declare an exact DSH runtime')
  const preset = createPresetBuffer({
    manifest: {
      name: 'Packaged preview fixture',
      description: 'Must be reviewed without applying files.',
      createdAt: '2026-08-19T00:00:00.000Z',
      source: { desktopVersion: desktopManifest.version, runtimeVersion },
      requiredCapabilities: [],
      requiredSecrets: ['EXAMPLE_API_KEY'],
    },
    settings: { language: 'en' },
    skills: {
      'preview-only': {
        'SKILL.md': '# Preview only\n\nThis file must not be written until the user confirms import.\n',
      },
    },
    taskTemplates: [{ id: 'preview-template', title: 'Preview only' }],
    readme: '# Preview fixture\n',
  })
  await writeFile(presetPath, preset, { flag: 'wx' })
  await seedPrimaryRuntimePermissionForTest({ userData })

  let app
  try {
    app = await electron.launch({
      executablePath: executablePath || electronPath,
      args: executablePath
        ? [presetPath, 'dsh://extensions']
        : [join(appDir, 'src', 'main.mjs'), presetPath, 'dsh://extensions'],
      cwd: appDir,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_DESKTOP_USER_DATA: userData,
        DSH_DESKTOP_DISABLE_UPDATES: '1',
      },
    })
    const extensionPage = await waitForWindow(app, (page) => /extensions\.html/u.test(page.url()), timeoutMs)
    await extensionPage.locator('#preset-name').filter({ hasText: 'Packaged preview fixture' }).waitFor({ state: 'visible', timeout: timeoutMs })
    assert.equal(await extensionPage.locator('#presets-tab').getAttribute('aria-selected'), 'true')
    const text = await extensionPage.locator('body').innerText()
    assert.match(text, /EXAMPLE_API_KEY/u)
    assert.doesNotMatch(text, new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'iu'))
    await assert.rejects(access(join(dshHome, 'skills', 'preview-only')), /ENOENT/u)
    await assert.rejects(access(join(dshHome, 'settings.yaml')), /ENOENT/u)
    await assert.rejects(access(join(dshHome, 'task-templates.json')), /ENOENT/u)

    const mainPage = await waitForWindow(app, (page) => /^http:\/\/127\.0\.0\.1:/u.test(page.url()), timeoutMs)
    await mainPage.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', {
      state: 'attached',
      timeout: timeoutMs,
    })
    await extensionPage.waitForFunction(() => document.querySelector('#plugins-tab')?.getAttribute('aria-selected') === 'true', undefined, {
      timeout: timeoutMs,
    })
    assert.equal(await extensionPage.locator('#plugins-tab').getAttribute('aria-selected'), 'true')
    console.log('verified .dshpreset preview-only ingress and queued dsh://extensions dispatch after Runtime readiness')
  } catch (error) {
    const runtimeLog = await readFile(join(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')
    if (runtimeLog) console.error(`recent Runtime log:\n${runtimeLog.slice(-4_000)}`)
    throw error
  } finally {
    await app?.close().catch(() => {})
    await rm(temporary, { recursive: true, force: true })
  }
}
