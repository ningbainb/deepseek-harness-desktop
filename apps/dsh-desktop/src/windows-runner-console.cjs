// Desktop-only bootstrap adapter. Keep the official Job runner, IPC, environment,
// termination and command arguments intact; only attach its GUI-subsystem process
// to the hidden console already owned by the Desktop runtime.
const { createRequire, syncBuiltinESMExports } = require('node:module')
const { resolve } = require('node:path')
const childProcess = require('node:child_process')
const installed = Symbol.for('dsh.desktop.hidden-runner-console')

function runnerIdentity(path) {
  // Desktop materializes SDK paths outside ASAR for the official loader;
  // require.resolve in this preload can still name their virtual ASAR alias.
  return resolve(path).replace(/([\\/])app\.asar([\\/])/iu, '$1app.asar.unpacked$2').toLowerCase()
}

function officialRunnerPath() {
  const runtimeRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
  const baseRequire = createRequire(runtimeRequire.resolve('@deepseek-ai/dsh-base/package.json'))
  return baseRequire.resolve('@deepseek-ai/dsh-subprocess-local/runner')
}

function runnerConsoleInvocation(command, args, options, {
  executable = process.execPath,
  preloadPath = resolve(__dirname, 'windows-console-preload.cjs'),
  resolveRunner = officialRunnerPath,
} = {}) {
  if (typeof command !== 'string' || command.toLowerCase() !== executable.toLowerCase()
    || !Array.isArray(args) || args.length < 3 || args[1] !== '--'
    || options?.env?.DSH_SUBPROCESS_RUNNER !== 'windows') return undefined
  // Resolve the trusted SDK entry, not a user-supplied similarly named script.
  // A changed SDK layout should keep ordinary launching intact, not crash it.
  let runner
  try { runner = resolveRunner() } catch { return undefined }
  if (typeof args[0] !== 'string' || runnerIdentity(args[0]) !== runnerIdentity(runner)) return undefined
  return {
    args: ['--require', preloadPath, ...args],
    options: { ...options, windowsHide: true },
  }
}

function installRunnerConsolePropagation() {
  if (process.platform !== 'win32' || childProcess[installed]) return
  const original = childProcess.spawn
  childProcess.spawn = function (command, args, options) {
    const invocation = runnerConsoleInvocation(command, args, options)
    return invocation
      ? original.call(this, command, invocation.args, invocation.options)
      : original.apply(this, arguments)
  }
  Object.defineProperty(childProcess, installed, { value: true })
  syncBuiltinESMExports()
}

module.exports = { runnerConsoleInvocation, installRunnerConsolePropagation }
