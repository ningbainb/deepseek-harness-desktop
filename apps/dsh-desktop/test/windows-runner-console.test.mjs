import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

const { runnerConsoleInvocation } = createRequire(import.meta.url)('../src/windows-runner-console.cjs')
const executable = 'D:\\Desktop\\desktop.exe'
const runner = resolve('sdk/subprocess/runner.js')
const preloadPath = resolve('desktop/windows-console-preload.cjs')
const seams = { executable, preloadPath, resolveRunner: () => runner }

test('only the official Electron Windows Job runner receives the console preload', () => {
  const args = [runner, '--', 'powershell.exe', '-Command', 'literal % & spaces 中文']
  const options = { env: { DSH_SUBPROCESS_RUNNER: 'windows' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc', 'pipe', 'pipe', 'pipe'], cwd: 'D:\\test' }
  const result = runnerConsoleInvocation(executable, args, options, seams)
  assert.deepEqual(result.args, ['--require', preloadPath, ...args])
  assert.deepEqual(result.options, { ...options, windowsHide: true })
  assert.equal(result.options.stdio, options.stdio)
  assert.equal(result.options.env, options.env)
  assert.equal(args[0], runner)
  assert.equal(options.windowsHide, undefined)
})

test('console propagation leaves terminals, other tools and untrusted lookalike entries unchanged', () => {
  const options = { env: { DSH_SUBPROCESS_RUNNER: 'windows' } }
  for (const [command, args, spawnOptions] of [
    ['powershell.exe', [runner, '--', 'cmd.exe'], options],
    [executable, [resolve('untrusted/runner.js'), '--', 'cmd.exe'], options],
    [executable, [runner, '--', 'cmd.exe'], { env: {} }],
    [executable, [runner, '--', 'cmd.exe'], undefined],
    [executable, [runner, '--'], options],
    [executable, ['--require', preloadPath, runner, '--', 'cmd.exe'], options],
  ]) assert.equal(runnerConsoleInvocation(command, args, spawnOptions, seams), undefined)
  assert.equal(runnerConsoleInvocation(executable, [runner, '--', 'cmd.exe'], options, {
    ...seams, resolveRunner: () => { throw new Error('unavailable') },
  }), undefined)
})

test('packaged ASAR and materialized SDK runner paths identify the same trusted entry', () => {
  const virtual = resolve('resources/app.asar/node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner.js')
  const physical = resolve('resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner.js')
  const options = { env: { DSH_SUBPROCESS_RUNNER: 'windows' } }
  const result = runnerConsoleInvocation(executable, [physical, '--', 'cmd.exe'], options, {
    ...seams, resolveRunner: () => virtual,
  })
  assert.deepEqual(result.args, ['--require', preloadPath, physical, '--', 'cmd.exe'])
  assert.equal(runnerConsoleInvocation(executable, [resolve('another-app/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner.js'), '--', 'cmd.exe'], options, {
    ...seams, resolveRunner: () => virtual,
  }), undefined)
})
