import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const appRequire = createRequire(new URL('../package.json', import.meta.url))
const usageManifest = appRequire.resolve('@linxin666/dsh-usage/package.json')
const usageRequire = createRequire(usageManifest)
const react = usageRequire('react')
const jsx = usageRequire('react/jsx-runtime')
const { renderToStaticMarkup } = usageRequire('react-dom/server')
const { JSDOM } = usageRequire('jsdom')
const clientPath = resolve(dirname(usageManifest), 'lib/client.js')
const client = readFileSync(clientPath, 'utf8')
// Execute the installed function, rather than a test implementation of the row.
const rowStart = client.indexOf('\t\tfunction SettingsRow(props) {')
const rowEnd = client.indexOf('\n\t\t//#endregion', rowStart)
assert.ok(rowStart >= 0 && rowEnd > rowStart, 'Installed usage bundle must expose the reviewed SettingsRow region')
const SettingsRow = runInNewContext(`(function () { ${client.slice(rowStart, rowEnd)}; return SettingsRow })()`, {
  react, react_jsx_runtime: jsx, usage_module_css_default: {}, t: key => key,
}, { filename: clientPath })

const verifierPath = 'apps/dsh-desktop/scripts/verify-selected-balance.mjs'
// Optional read-only RED mode: run the same tests against the actual pre-fix Git file.
const baseline = process.env.DSH_USAGE_READINESS_BASELINE === 'HEAD'
const verifier = baseline
  ? execFileSync('git', ['show', `HEAD:${verifierPath}`], { cwd: repository, encoding: 'utf8' })
  : readFileSync(resolve(repository, verifierPath), 'utf8')
const assertionStart = verifier.indexOf('  const restored = reopened.settings.getByRole(')
const assertionEnd = verifier.indexOf('  await restored.click()', assertionStart)
assert.ok(assertionStart >= 0 && assertionEnd > assertionStart, 'Execute the actual reopen-to-persistence-assertion block')
const persistenceAssertion = verifier.slice(assertionStart, assertionEnd)

const pending = { snapshot: undefined, value: {} }
function accepted(enabled) {
  return {
    snapshot: { status: 'ready', writable: true, value: { enabled }, base: { enabled: true }, user: { enabled }, revision: 1 },
    value: { enabled },
  }
}

function markup(props) {
  return renderToStaticMarkup(react.createElement(SettingsRow, {
    ...props, settings: { set() { throw new Error('Readiness regression must not write settings') } },
  }))
}

function documentFor(t, props) {
  const dom = new JSDOM(`<div data-dsh-plugin="usage">${markup(props)}</div>`)
  t.after(() => dom.window.close())
  return dom.window
}

test('loading row renders a checked disabled default, not evidence of a saved enabled value', t => {
  const window = documentFor(t, pending)
  const input = window.document.querySelector('input[type="checkbox"]')
  assert.equal(input.checked, true)
  assert.equal(input.disabled, true)
  t.diagnostic(`Installed usage ${JSON.parse(readFileSync(usageManifest, 'utf8')).version}; client SHA256 ${createHash('sha256').update(client).digest('hex')}; fixture ${baseline ? 'Git HEAD RED' : 'working tree'}`)
})

for (const enabled of [false, true]) {
  test(`ready saved ${enabled} renders its actual checked value and an enabled control`, t => {
    const window = documentFor(t, accepted(enabled))
    const input = window.document.querySelector('input[type="checkbox"]')
    assert.equal(input.checked, enabled)
    assert.equal(input.disabled, false)
  })
}

/** Controlled transport publication; DOM and fixture predicate both remain real. */
async function runReopen(t, savedValue) {
  const window = documentFor(t, pending)
  const publication = Promise.withResolvers()
  const waiting = Promise.withResolvers()
  let reads = 0
  const predicates = []
  const settings = {
    getByRole(role, options) {
      assert.equal(role, 'checkbox')
      assert.equal(options.name, '启用插件')
      assert.equal(options.exact, true)
      return { async isChecked() {
        reads += 1
        return window.document.querySelector('input[type="checkbox"]').checked
      } }
    },
    async waitForFunction(predicate, argument, options) {
      assert.equal(options.polling, 100)
      assert.equal(options.timeout, 60_000)
      // Call the actual callback extracted from the verifier, in its DOM realm.
      predicates.push(predicate(argument))
      assert.equal(predicates[0], false, 'A visible disabled default must not satisfy readiness')
      waiting.resolve()
      await publication.promise
      predicates.push(predicate(argument))
      assert.equal(predicates[1], true, 'Ready must accept either persisted boolean, including unexpected true')
    },
  }
  const outcome = runInNewContext(`(async () => { ${persistenceAssertion} })()`, {
    reopened: { settings }, document: window.document, HTMLInputElement: window.HTMLInputElement, assert,
  }, { filename: verifierPath }).then(
    () => ({ ok: true }), error => ({ ok: false, error }),
  )
  try {
    const first = await Promise.race([
      waiting.promise.then(() => 'waiting'),
      outcome.then(() => 'assertion-settled'),
    ])
    assert.equal(first, 'waiting', 'The actual fixture must wait before reading the persistence value')
    assert.equal(reads, 0, 'No persistence read is allowed while the default checkbox is disabled')
    window.document.querySelector('[data-dsh-plugin="usage"]').innerHTML = markup(accepted(savedValue))
    publication.resolve()
    const result = await outcome
    assert.deepEqual(predicates, [false, true])
    assert.equal(reads, 1, 'Keep one original equality assertion after readiness')
    if (!result.ok) throw result.error
  } finally {
    publication.resolve()
    await outcome
  }
}

test('actual reopen fixture waits for delayed readiness before accepting saved false', async t => {
  await runReopen(t, false)
})

test('actual reopen fixture accepts ready true then fails its original false assertion', async t => {
  await assert.rejects(runReopen(t, true), error => {
    assert.equal(error.code, 'ERR_ASSERTION')
    assert.equal(error.actual, true)
    assert.equal(error.expected, false)
    return true
  })
})
