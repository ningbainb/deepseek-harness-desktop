import assert from 'node:assert/strict'
import test from 'node:test'
import { WINDOW_CHROME_CSS } from '../src/window-chrome.mjs'

import {
  applyConversationPolish,
  CONVERSATION_POLISH_CSS,
  installConversationPolish,
} from '../src/conversation-polish.mjs'

test('expanded reasoning header remains sticky without targeting generated class names', () => {
  assert.match(CONVERSATION_POLISH_CSS, /\[data-variant="think"\] > \[data-open\] > \[data-disclosure-row\]/u)
  assert.match(CONVERSATION_POLISH_CSS, /position: sticky/u)
  assert.match(CONVERSATION_POLISH_CSS, /inset-block-start: 8px/u)
  assert.match(CONVERSATION_POLISH_CSS, /z-index: 20/u)
  assert.doesNotMatch(CONVERSATION_POLISH_CSS, /QWLzlG|_[a-zA-Z0-9]{6}_/u)
})

test('context accessory retains its surface without trapping viewport-fixed native tooltips', () => {
  assert.match(CONVERSATION_POLISH_CSS, /\[data-slot="conversation\.composer\.dock"\] \+ \*:has\(> button\[aria-haspopup="dialog"\]\)/u)
  assert.match(CONVERSATION_POLISH_CSS, /backdrop-filter: none !important/u)
  assert.doesNotMatch(CONVERSATION_POLISH_CSS, /\[role="tooltip"\][^{]*\{[^}]*display:\s*none/u)
})

test('Desktop grid clips offscreen panels without becoming a programmatic scroll container', () => {
  assert.match(WINDOW_CHROME_CSS, /body > #root \[data-dsh-frame\] \{[^}]*overflow: clip !important;/u)
})

test('conversation polish inserts author CSS and follows navigations', async () => {
  const calls = []
  const scripts = []
  const listeners = new Map()
  const webContents = {
    isDestroyed: () => false,
    insertCSS: async (css, options) => calls.push([css, options]),
    executeJavaScript: async script => scripts.push(script),
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }

  assert.equal(await applyConversationPolish(webContents), true)
  assert.deepEqual(calls, [[CONVERSATION_POLISH_CSS, { cssOrigin: 'author' }]])
  assert.match(scripts[0], /installConversationRendering/u)
  assert.match(scripts[1], /installSidebarTools/u)

  const dispose = installConversationPolish({ browserWindow: { webContents } })
  assert.equal(typeof listeners.get('did-finish-load'), 'function')
  dispose()
  assert.equal(listeners.has('did-finish-load'), false)
  assert.equal(scripts.at(-1), 'globalThis.dshConversationRenderingController?.dispose(); globalThis.dshSidebarToolsController?.dispose()')
})
