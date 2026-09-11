// A GUI-subsystem Electron executable does not automatically inherit the
// console of the hidden PowerShell process that launches the DSH Node-mode
// runtime. Attach explicitly so restricted-token command children can share
// that hidden console instead of allocating a visible one.
if (process.platform === 'win32') {
  require('./windows-runner-console.cjs').installRunnerConsolePropagation()
  try {
    const koffi = require('koffi')
    const kernel32 = koffi.load('kernel32.dll')
    const attachConsole = kernel32.func('__stdcall', 'AttachConsole', 'int', ['uint32'])
    attachConsole(0xFFFF_FFFF)
  } catch {
    // Best effort: runtime startup and its existing per-spawn hiding remain
    // functional if the optional console attachment is unavailable.
  }
}
