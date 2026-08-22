const query = new URLSearchParams(window.location.search)
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.dshDesktopTheme = theme

const terminalHost = document.querySelector('#terminal-host')
const status = document.querySelector('#terminal-status')
const context = document.querySelector('#terminal-context')
const restartButton = document.querySelector('#restart-terminal')
const clearButton = document.querySelector('#clear-terminal')
const closeButton = document.querySelector('#close-terminal')
const Terminal = window.Terminal
const FitAddon = window.FitAddon?.FitAddon

if (typeof Terminal !== 'function' || typeof FitAddon !== 'function') {
  status.dataset.state = 'error'
  status.textContent = '终端组件不可用'
  throw new Error('packaged xterm runtime is unavailable')
}

const terminal = new Terminal({
  allowProposedApi: false,
  convertEol: false,
  cursorBlink: true,
  cursorStyle: 'bar',
  fontFamily: 'Consolas, "Cascadia Mono", "Microsoft YaHei UI", monospace',
  fontSize: 13,
  lineHeight: 1.18,
  scrollback: 10_000,
  theme: {
    background: '#071017',
    foreground: '#d9e8ee',
    cursor: '#7dd8eb',
    cursorAccent: '#071017',
    selectionBackground: '#234b5c',
    black: '#101820',
    red: '#e78080',
    green: '#68cf9f',
    yellow: '#d8b768',
    blue: '#6da5ee',
    magenta: '#bd8ee4',
    cyan: '#67cbe1',
    white: '#d9e8ee',
  },
})
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
terminal.open(terminalHost)

let disposed = false
let resizeFrame
const subscriptions = []

function size() {
  return { cols: Math.max(2, terminal.cols), rows: Math.max(1, terminal.rows) }
}

function fitAndResize() {
  if (disposed) return
  fitAddon.fit()
  window.dshTerminal.resize(size())
}

function scheduleResize() {
  if (resizeFrame !== undefined) return
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = undefined
    fitAndResize()
  })
}

function setState(state, text) {
  status.dataset.state = state
  status.textContent = text
}

subscriptions.push(terminal.onData((data) => window.dshTerminal.write(data)))
subscriptions.push({ dispose: window.dshTerminal.onOutput((data) => {
  if (typeof data === 'string') terminal.write(data)
}) })
subscriptions.push({ dispose: window.dshTerminal.onExit((event) => {
  setState('exited', `会话已结束 (${Number.isInteger(event?.exitCode) ? event.exitCode : 0})`)
  terminal.options.disableStdin = true
}) })
subscriptions.push({ dispose: window.dshTerminal.onError(() => {
  setState('error', '终端操作失败')
}) })

const resizeObserver = new ResizeObserver(scheduleResize)
resizeObserver.observe(terminalHost)
window.addEventListener('resize', scheduleResize)

restartButton.addEventListener('click', async () => {
  restartButton.disabled = true
  try {
    terminal.options.disableStdin = false
    terminal.write('\r\n\x1b[90m[Desktop 正在重启终端会话]\x1b[0m\r\n')
    const info = await window.dshTerminal.restart(size())
    context.textContent = `${info.label} · ${info.cwd}`
    setState('ready', '运行中')
    terminal.focus()
  } catch {
    setState('error', '终端启动失败')
  } finally {
    restartButton.disabled = false
  }
})

clearButton.addEventListener('click', () => {
  terminal.clear()
  terminal.focus()
})

closeButton.addEventListener('click', () => {
  closeButton.disabled = true
  void window.dshTerminal.close().catch(() => {
    closeButton.disabled = false
    setState('error', '无法收起终端')
  })
})

window.addEventListener('beforeunload', () => {
  disposed = true
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeObserver.disconnect()
  window.removeEventListener('resize', scheduleResize)
  for (const subscription of subscriptions) subscription.dispose?.()
  terminal.dispose()
})

try {
  fitAddon.fit()
  const info = await window.dshTerminal.start(size())
  context.textContent = `${info.label} · ${info.cwd}`
  setState('ready', '运行中')
  terminal.focus()
} catch {
  setState('error', '终端启动失败')
  context.textContent = '请收起后重新打开；Desktop 和 DSH Runtime 不会因此退出。'
}
