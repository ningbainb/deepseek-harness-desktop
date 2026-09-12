import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { saveDockSettingsDrafts } from '../src/dock-settings-view.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')

function fixture(t) {
  const dom = new JSDOM('<section data-dock-dirty="true"><div><input value="A"><button data-dock-save>Save</button></div></section>')
  t.after(() => dom.window.close())
  const { document } = dom.window
  const form = document.querySelector('section')
  const input = document.querySelector('input')
  const button = document.querySelector('button')
  const edit = value => {
    input.value = value
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  const fail = () => {
    const alert = document.createElement('p')
    alert.setAttribute('role', 'alert')
    alert.textContent = 'Save failed'
    form.append(alert)
    return alert
  }
  return { dom, document, form, input, button, edit, fail }
}

test('save and close waits for an existing save A, then saves the newer draft B once', async t => {
  const f = fixture(t)
  const writes = []
  f.button.addEventListener('click', () => { writes.push(f.input.value); f.button.disabled = true })
  f.button.click()
  f.edit('B')
  let polls = 0
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => {
      polls++
      if (polls === 2) f.button.disabled = false // A finishes; B remains dirty.
      if (polls === 4) { f.button.disabled = false; f.form.dataset.dockDirty = 'false' }
    },
    maxPolls: 6,
  })
  assert.equal(saved, true)
  assert.deepEqual(writes, ['A', 'B'])
  assert.equal(polls, 4)
})

test('edits made during the close save survive, even when the input returns to the same value', async t => {
  const f = fixture(t)
  const writes = []
  f.button.addEventListener('click', () => { writes.push(f.input.value); f.button.disabled = true })
  let polls = 0
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => {
      if (++polls === 1) {
        f.edit('B')
        f.edit('A')
        f.button.disabled = false
      } else {
        f.button.disabled = false
        f.form.dataset.dockDirty = 'false'
      }
    },
    maxPolls: 4,
  })
  assert.equal(saved, true)
  assert.deepEqual(writes, ['A', 'A'])
  assert.equal(polls, 2)
})

test('a failed close save stops promptly without automatically retrying the same draft', async t => {
  const f = fixture(t)
  let writes = 0, polls = 0
  f.button.addEventListener('click', () => { writes++; f.button.disabled = true })
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => { polls++; f.button.disabled = false; f.fail() },
  })
  assert.equal(saved, false)
  assert.equal(writes, 1)
  assert.equal(polls, 1)
  assert.equal(f.form.dataset.dockDirty, 'true')
})

test('choosing save and close permits one explicit retry of a previous failed save', async t => {
  const f = fixture(t)
  const previousFailure = f.fail()
  let writes = 0
  f.button.addEventListener('click', () => { writes++; f.button.disabled = true })
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => { previousFailure.remove(); f.button.disabled = false; f.form.dataset.dockDirty = 'false' },
  })
  assert.equal(saved, true)
  assert.equal(writes, 1)
})

test('a save already in flight failing during close stops before another write', async t => {
  const f = fixture(t)
  f.button.disabled = true
  let writes = 0, polls = 0
  f.button.addEventListener('click', () => { writes++ })
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => { polls++; f.button.disabled = false; f.fail() },
  })
  assert.equal(saved, false)
  assert.equal(writes, 0)
  assert.equal(polls, 1)
})

test('a save that makes no progress is bounded and does not submit duplicate writes', async t => {
  const f = fixture(t)
  let writes = 0, polls = 0
  f.button.addEventListener('click', () => { writes++; f.button.disabled = true })
  const saved = await saveDockSettingsDrafts({
    document: f.document,
    wait: async () => { if (++polls === 2) f.button.disabled = false },
    maxPolls: 4,
  })
  assert.equal(saved, false)
  assert.equal(writes, 1)
  assert.equal(polls, 4)
  assert.equal(f.form.dataset.dockDirty, 'true')
})

test('the serialized renderer helper can save a collapsed form and releases its edit listeners', async t => {
  const f = fixture(t)
  f.button.parentElement.hidden = true
  let writes = 0
  f.button.addEventListener('click', () => { writes++; f.form.dataset.dockDirty = 'false' })
  const added = [], removed = []
  const add = f.document.addEventListener.bind(f.document)
  const remove = f.document.removeEventListener.bind(f.document)
  f.document.addEventListener = (name, listener, ...options) => { added.push([name, listener]); return add(name, listener, ...options) }
  f.document.removeEventListener = (name, listener, ...options) => { removed.push([name, listener]); return remove(name, listener, ...options) }
  const saved = await vm.runInNewContext(`(${saveDockSettingsDrafts.toString()})()`, {
    document: f.document,
    setTimeout: callback => { callback(); return 0 },
  })
  assert.equal(saved, true)
  assert.equal(writes, 1)
  assert.deepEqual(removed, added.filter(([name]) => name === 'input' || name === 'change'))
})
