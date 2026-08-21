import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceRoot = new URL('../src/', import.meta.url)
const uiRoot = new URL('../src/ui/', import.meta.url)

test('terminal preload exposes only the fixed session lifecycle and bounded streams', async () => {
  const preload = await readFile(new URL('preload-terminal.cjs', sourceRoot), 'utf8')
  assert.match(preload, /contextBridge\.exposeInMainWorld\('dshTerminal'/u)
  for (const channel of [
    'dsh:terminal:start',
    'dsh:terminal:write',
    'dsh:terminal:resize',
    'dsh:terminal:restart',
    'dsh:terminal:close',
    'dsh:terminal:output',
    'dsh:terminal:exited',
    'dsh:terminal:error',
  ]) assert.match(preload, new RegExp(channel))
  assert.doesNotMatch(preload, /require\(['"](?:node:)?(?:child_process|fs|path|node-pty)['"]\)|desktop:action|extensions:|openExternal/u)
  assert.doesNotMatch(preload, /invoke\([^'"]/u)
})

test('terminal page loads only packaged xterm assets and contains no remote execution surface', async () => {
  const [html, renderer, css] = await Promise.all([
    readFile(new URL('terminal.html', uiRoot), 'utf8'),
    readFile(new URL('terminal.mjs', uiRoot), 'utf8'),
    readFile(new URL('terminal.css', uiRoot), 'utf8'),
  ])
  assert.match(html, /connect-src 'none'/u)
  assert.match(html, /object-src 'none'/u)
  assert.match(html, /@xterm\/xterm\/lib\/xterm\.js/u)
  assert.match(html, /@xterm\/addon-fit\/lib\/addon-fit\.js/u)
  assert.match(html, /@xterm\/xterm\/css\/xterm\.css/u)
  assert.doesNotMatch(html, /https?:|webview|iframe/u)
  assert.match(renderer, /window\.Terminal/u)
  assert.match(renderer, /window\.FitAddon\?\.FitAddon/u)
  assert.match(renderer, /window\.dshTerminal\.start/u)
  assert.match(renderer, /window\.dshTerminal\.write/u)
  assert.match(renderer, /window\.dshTerminal\.resize/u)
  assert.match(renderer, /window\.dshTerminal\.close/u)
  assert.match(renderer, /onOutput/u)
  assert.match(renderer, /beforeunload/u)
  assert.doesNotMatch(renderer, /innerHTML|eval\(|Function\(|window\.open|location\s*=/u)
  assert.match(css, /\.terminal-host/u)
  assert.match(css, /font-family:.*Consolas/u)
})
