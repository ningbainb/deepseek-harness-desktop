import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { runPackagedDesktop } from '../scripts/packaged-smoke-runner.mjs'

const qaRoot = new URL('../../../.tmp/release-qa/packaged-smoke/', import.meta.url)

async function diagnosticFixture(t) {
  await mkdir(qaRoot, { recursive: true })
  const root = await mkdtemp(new URL('test-', qaRoot))
  t.after(() => rm(root, { recursive: true, force: true }))
  return {
    root,
    options: {
      appPath: process.execPath, userData: join(root, 'user-data'), dshHome: join(root, 'dsh-home'),
      diagnosticsDirectory: root, seedPrimaryRuntimePermission: false, requireStartupTimings: false,
    },
  }
}

// A controlled child is needed to deliver bytes after exit, or deliberately
// withhold close, without leaving a real descendant holding Windows pipe handles.
function smokeChild(run) {
  return (_appPath, args, options) => {
    const child = new EventEmitter()
    Object.assign(child, { pid: 12345, exitCode: null, stdout: new PassThrough(), stderr: new PassThrough() })
    setImmediate(() => {
      Promise.resolve(run(child, args, options)).catch(error => child.emit('error', error))
    })
    return child
  }
}

function exitChild(child, code) {
  child.exitCode = code
  child.emit('exit', code, null)
}

function closeChild(child, code) {
  child.stdout.end()
  child.stderr.end()
  child.emit('close', code, null)
}

test('the total smoke deadline includes an observer still pending after exit and close', async t => {
  const { root, options } = await diagnosticFixture(t)
  await assert.rejects(runPackagedDesktop({
    ...options, timeoutMs: 30,
    onSpawn: async () => { await new Promise(resolve => setTimeout(resolve, 120)) },
    spawnProcess: smokeChild(child => { exitChild(child, 0); closeChild(child, 0) }),
  }), /timed out after 30ms/u)
  const [run] = await readdir(root)
  const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
  assert.equal(metadata.exit.code, 0)
  assert.equal(metadata.timedOut, true)
  assert.equal(metadata.success, false)
})

test('an observer error retains its original object and the killed real Node child exit diagnostics', async t => {
  const { options } = await diagnosticFixture(t)
  const original = new Error('review original observer failure')
  let processClosed
  await assert.rejects(runPackagedDesktop({
    ...options,
    spawnProcess: (_appPath, _args, options) => {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options)
      processClosed = new Promise(resolve => child.once('close', resolve))
      return child
    },
    onSpawn: () => { throw original },
  }), error => {
    assert.ok(error === original || error.cause === original || error.errors?.includes(original), 'the observer original must remain in the error chain')
    assert.match(error.message, /review original observer failure/u)
    assert.match(error.message, /exited code=.*signal=/u)
    return true
  })
  await processClosed
})

for (const [name, contents] of [
  ['multiline JSON', '{\n"apiKey":\n"review-synthetic-private-material"\n}\nordinary diagnostic\n'],
  ['PEM missing BEGIN in a truncated tail', `${'x'.repeat(65536)}\ncut first line\nreview-synthetic-private-material\n-----END PRIVATE KEY-----\nordinary diagnostic\n`],
  ['PEM missing END', '-----BEGIN PRIVATE KEY-----\nreview-synthetic-private-material\n'],
]) {
  test(`normal smoke evidence redacts ${name} without hiding a native exit`, async t => {
    const { root, options } = await diagnosticFixture(t)
    await mkdir(join(options.userData, 'logs'), { recursive: true })
    await writeFile(join(options.userData, 'logs', 'runtime.log'), contents)
    await assert.rejects(runPackagedDesktop({
      ...options,
      spawnProcess: smokeChild(async (child, args) => {
        await writeFile(args.find(arg => arg.startsWith('--log-file=')).slice('--log-file='.length), contents)
        child.stdout.write(contents)
        child.stderr.write(contents)
        exitChild(child, 2147483651)
        closeChild(child, 2147483651)
      }),
    }), error => {
      assert.match(error.message, /exited code=2147483651/u)
      assert.equal(error.message.includes('review-synthetic-private-material'), false)
      return true
    })
    const run = (await readdir(root)).find(name => name.startsWith('smoke-'))
    for (const file of ['stdout.log', 'stderr.log', 'runtime.log', 'electron.log']) {
      const contents = await readFile(join(root, run, file), 'utf8')
      assert.equal(contents.includes('review-synthetic-private-material'), false, `${file} retained synthetic private material`)
      if (name !== 'PEM missing END') assert.match(contents, /ordinary diagnostic/u)
    }
    const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
    assert.equal(metadata.exit.code, 2147483651)
    assert.equal(metadata.success, false)
  })
}

test('smoke keeps post-exit stdout, stderr and successful loader warnings in distinct run evidence', async t => {
  const { root, options } = await diagnosticFixture(t)
  const spawnProcess = smokeChild((child, args) => {
    const electronLog = args.find(arg => arg.startsWith('--log-file='))?.slice('--log-file='.length)
    assert.ok(args.includes('--enable-logging=file'))
    assert.ok(electronLog.startsWith(root))
    return writeFile(electronLog, 'native loader warning\n').then(() => {
      child.stdout.write('desktop smoke ready\n')
      exitChild(child, 0)
      setTimeout(() => {
        child.stdout.write('late stdout\n')
        child.stderr.write('late loader warning\n')
        closeChild(child, 0)
      }, 25)
    })
  })
  const first = await runPackagedDesktop({ ...options, spawnProcess })
  const second = await runPackagedDesktop({ ...options, spawnProcess })
  assert.notEqual(first.diagnosticsDirectory, second.diagnosticsDirectory)
  for (const result of [first, second]) {
    assert.match(await readFile(join(result.diagnosticsDirectory, 'stdout.log'), 'utf8'), /late stdout/u)
    assert.match(await readFile(join(result.diagnosticsDirectory, 'stderr.log'), 'utf8'), /late loader warning/u)
    assert.match(await readFile(join(result.diagnosticsDirectory, 'electron.log'), 'utf8'), /native loader warning/u)
    const metadata = JSON.parse(await readFile(join(result.diagnosticsDirectory, 'exit.json'), 'utf8'))
    assert.equal(metadata.exit.code, 0)
    assert.equal(metadata.closeObserved, true)
    assert.equal(metadata.stdioDrainTimedOut, false)
    assert.equal(metadata.success, true)
    assert.deepEqual((await readdir(result.diagnosticsDirectory)).sort(), ['electron.log', 'exit.json', 'runtime.log', 'stderr.log', 'stdout.log'])
  }
})

test('smoke failure retains native exit status and bytes arriving between exit and close', async t => {
  const { root, options } = await diagnosticFixture(t)
  await assert.rejects(runPackagedDesktop({
    ...options,
    spawnProcess: smokeChild(child => {
      exitChild(child, 2147483651)
      setTimeout(() => {
        child.stderr.write('native fatal tail\n')
        closeChild(child, 2147483651)
      }, 25)
    }),
  }), error => {
    assert.match(error.message, /exited code=2147483651 signal=null/u)
    assert.match(error.message, /native fatal tail/u)
    return true
  })
  const [run] = await readdir(root)
  const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
  assert.equal(metadata.exit.code, 2147483651)
  assert.equal(metadata.success, false)
})

for (const code of [0, 2147483651]) {
  test(`missing close is bounded by the existing deadline and never passes exit ${code}`, async t => {
    const { root, options } = await diagnosticFixture(t)
    const started = performance.now()
    await assert.rejects(runPackagedDesktop({
      ...options, timeoutMs: 150,
      spawnProcess: smokeChild(child => exitChild(child, code)),
    }), code === 0 ? /stdio close was not observed/u : /exited code=2147483651/u)
    assert.ok(performance.now() - started < 1500, 'close must not wait for a fresh smoke timeout')
    const [run] = await readdir(root)
    const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
    assert.equal(metadata.exit.code, code)
    assert.equal(metadata.closeObserved, false)
    assert.equal(metadata.stdioDrainTimedOut, true)
    assert.equal(metadata.success, false)
  })
}

test('diagnostic tails are bounded and redact synthetic credentials without copying profile data', async t => {
  const { root, options } = await diagnosticFixture(t)
  await mkdir(join(options.userData, 'logs'), { recursive: true })
  const sensitive = 'synthetic-credential-must-not-be-retained'
  const log = `${'x'.repeat(1000)}\n`.repeat(100) + `apiKey=${sensitive}\n"key": "${sensitive}"\nloader warning survives\n`
  await writeFile(join(options.userData, 'logs', 'runtime.log'), log)
  await writeFile(join(options.userData, 'do-not-copy.txt'), sensitive)
  const result = await runPackagedDesktop({
    ...options,
    spawnProcess: smokeChild(async (child, args) => {
      await writeFile(args.find(arg => arg.startsWith('--log-file=')).slice('--log-file='.length), log)
      // The credential crosses data chunks; redaction must run on the assembled tail.
      const splitAt = log.indexOf(sensitive) + 15
      child.stdout.write(log.slice(0, splitAt))
      child.stdout.write(log.slice(splitAt))
      child.stderr.write(`Authorization: Bearer ${sensitive}\nhttps://user:${sensitive}@example.test/path\nloader warning survives\n`)
      exitChild(child, 0)
      closeChild(child, 0)
    }),
  })
  for (const file of ['stdout.log', 'stderr.log', 'runtime.log', 'electron.log']) {
    const contents = await readFile(join(result.diagnosticsDirectory, file))
    assert.ok(contents.byteLength <= 65536, `${file} exceeds its byte cap`)
    assert.equal(contents.includes(Buffer.from(sensitive)), false, `${file} leaks a synthetic credential`)
    assert.match(contents.toString(), /loader warning survives/u)
  }
  const metadata = await readFile(join(result.diagnosticsDirectory, 'exit.json'), 'utf8')
  assert.equal(metadata.includes(options.userData), false)
  assert.equal(metadata.includes(options.dshHome), false)
  assert.equal((await readdir(root)).includes('do-not-copy.txt'), false)
})

test('diagnostic destinations reject traversal and directory links before spawning', async t => {
  const { root, options } = await diagnosticFixture(t)
  const linked = join(root, 'linked')
  await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir')
  for (const diagnosticsDirectory of [join(root, '..', '..', 'outside-smoke'), linked]) {
    await assert.rejects(runPackagedDesktop({
      ...options, diagnosticsDirectory,
      spawnProcess: () => { assert.fail('invalid diagnostic destinations must not spawn a process') },
    }), /confined|link/u)
  }
})

const permissionFailure = '[stderr] dsh-desktop: warning: 1 entry did not activate\n'
  + '[stderr] permission (@deepseek-ai/dsh-permission-presets): Error: permission: composed sandbox and approval defaults match no preset; configure defaultPreset explicitly\n'

for (const name of ['@deepseek-ai/dsh-permission-presets', 'file:///C:/Program%20Files/Desktop/src/runtime-permission-presets.mjs']) {
for (const requirePermissionPresets of [false, true]) {
  test(`permission preset loader failure (${name}) with exit zero is ${requirePermissionPresets ? 'rejected when required' : 'returned by default'}`, async t => {
    const { root, options } = await diagnosticFixture(t)
    await mkdir(join(options.userData, 'logs'), { recursive: true })
    const run = runPackagedDesktop({
      ...options,
      ...(requirePermissionPresets ? { requirePermissionPresets: true } : {}),
      spawnProcess: smokeChild(async child => {
        await writeFile(join(options.userData, 'logs', 'runtime.log'), permissionFailure.replace('@deepseek-ai/dsh-permission-presets', name))
        exitChild(child, 0)
        closeChild(child, 0)
      }),
    })
    if (requirePermissionPresets) {
      await assert.rejects(run, /permission presets did not activate.*@deepseek-ai\/dsh-permission-presets/u)
      const runDirectory = (await readdir(root)).find(name => name.startsWith('smoke-'))
      const metadata = JSON.parse(await readFile(join(root, runDirectory, 'exit.json'), 'utf8'))
      assert.equal(metadata.exit.code, 0)
      assert.equal(metadata.success, false)
      assert.match(await readFile(join(root, runDirectory, 'runtime.log'), 'utf8'), /composed sandbox and approval defaults match no preset/u)
    } else {
      assert.equal((await run).runtimeLog, permissionFailure.replace('@deepseek-ai/dsh-permission-presets', name))
    }
  })
}
}

test('required permission presets allow unrelated loader warnings', async t => {
  const { options } = await diagnosticFixture(t)
  const warnings = '[stderr] dsh-desktop: warning: 1 entry did not activate\n'
    + '[stderr] another-plugin (@deepseek-ai/unrelated): Error: unrelated plugin unavailable\n'
    + '[stderr] permission (@deepseek-ai/dsh-permission-presets): warning: diagnostic only\n'
  await mkdir(join(options.userData, 'logs'), { recursive: true })
  await writeFile(join(options.userData, 'logs', 'runtime.log'), warnings)
  const result = await runPackagedDesktop({
    ...options, requirePermissionPresets: true,
    spawnProcess: smokeChild(child => { exitChild(child, 0); closeChild(child, 0) }),
  })
  assert.equal(result.runtimeLog, warnings)
})

test('required permission presets do not reject an old launch warning left in runtime.log', async t => {
  const { options } = await diagnosticFixture(t)
  const runtimePath = join(options.userData, 'logs', 'runtime.log')
  await mkdir(join(options.userData, 'logs'), { recursive: true })
  await writeFile(runtimePath, permissionFailure)
  const result = await runPackagedDesktop({
    ...options, requirePermissionPresets: true,
    spawnProcess: smokeChild(async child => {
      await writeFile(runtimePath, '[startup] current launch ready\n', { flag: 'a' })
      exitChild(child, 0)
      closeChild(child, 0)
    }),
  })
  assert.equal(result.runtimeLog, `${permissionFailure}[startup] current launch ready\n`)
})

test('required permission presets cannot lose a loader failure to the diagnostic tail cap', async t => {
  const { options } = await diagnosticFixture(t)
  await mkdir(join(options.userData, 'logs'), { recursive: true })
  await assert.rejects(runPackagedDesktop({
    ...options, requirePermissionPresets: true,
    spawnProcess: smokeChild(async child => {
      await writeFile(join(options.userData, 'logs', 'runtime.log'), permissionFailure + 'ordinary startup progress\n'.repeat(5000))
      exitChild(child, 0)
      closeChild(child, 0)
    }),
  }), /permission presets did not activate/u)
})

test('permission preset requirement only accepts a boolean before any spawn', async () => {
  await assert.rejects(runPackagedDesktop({
    appPath: process.execPath, userData: 'unused', dshHome: 'unused', requirePermissionPresets: 'true',
    seedPrimaryRuntimePermission: false,
    spawnProcess: () => { assert.fail('invalid permission requirement must not spawn') },
  }), /requirePermissionPresets must be a boolean/u)
})

test('environment-configured diagnostics retain a real Node child stdout and stderr without a GUI', async t => {
  const { options } = await diagnosticFixture(t)
  // Windows closes the direct Node child's capture pipes at exit even when a
  // descendant inherited them. The controlled-child tests cover that event
  // ordering; this real process verifies environment opt-in and filesystem I/O.
  const launcher = `setTimeout(() => { process.stdout.write('real stdout\\n'); process.stderr.write('real stderr\\n') }, 25)`
  const previous = process.env.DSH_DESKTOP_SMOKE_DIAGNOSTICS
  process.env.DSH_DESKTOP_SMOKE_DIAGNOSTICS = options.diagnosticsDirectory
  try {
    const result = await runPackagedDesktop({
      ...options, diagnosticsDirectory: undefined,
      spawnProcess: (_appPath, _args, options) => spawn(process.execPath, ['-e', launcher], options),
    })
    assert.match(await readFile(join(result.diagnosticsDirectory, 'stdout.log'), 'utf8'), /real stdout/u)
    assert.match(await readFile(join(result.diagnosticsDirectory, 'stderr.log'), 'utf8'), /real stderr/u)
  } finally {
    if (previous === undefined) delete process.env.DSH_DESKTOP_SMOKE_DIAGNOSTICS
    else process.env.DSH_DESKTOP_SMOKE_DIAGNOSTICS = previous
  }
})

test('a real spawn failure retains failure evidence without inventing a successful exit', async t => {
  const { root, options } = await diagnosticFixture(t)
  await assert.rejects(runPackagedDesktop({ ...options, appPath: join(root, 'missing-executable') }), { code: 'ENOENT' })
  const [run] = await readdir(root)
  const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
  assert.equal(metadata.exit, null)
  assert.equal(metadata.closeObserved, true)
  assert.equal(metadata.success, false)
})

test('diagnostic write failure preserves the native exit code and still records exit metadata', async t => {
  const { root, options } = await diagnosticFixture(t)
  await assert.rejects(runPackagedDesktop({
    ...options,
    spawnProcess: smokeChild(async (child, args) => {
      const rawLog = args.find(arg => arg.startsWith('--log-file=')).slice('--log-file='.length)
      await mkdir(join(rawLog, '..', 'stdout.log'))
      exitChild(child, 2147483651)
      closeChild(child, 2147483651)
    }),
  }), error => {
    assert.match(error.message, /exited code=2147483651/u)
    assert.match(error.message, /diagnostics could not be saved/u)
    return true
  })
  const [run] = await readdir(root)
  const metadata = JSON.parse(await readFile(join(root, run, 'exit.json'), 'utf8'))
  assert.equal(metadata.exit.code, 2147483651)
  assert.equal(metadata.success, false)
  assert.ok(metadata.diagnosticErrors.includes('stdout.log:write-failed'))
  await access(join(root, run, 'stderr.log'))
})

test('packaged smoke runner exposes the spawned process only to an explicit external observer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-observer-'))
  try {
    let observed
    const result = await runPackagedDesktop({
      appPath: process.execPath,
      userData: join(root, 'user-data'),
      dshHome: join(root, 'dsh-home'),
      timeoutMs: 10_000,
      requireStartupTimings: false,
      diagnosticsDirectory: null, // Node is the stand-in executable, even with CI diagnostics enabled.
      onSpawn: (value) => { observed = value },
    })
    assert.equal(typeof result.elapsedMs, 'number')
    assert.equal(observed.appPath, process.execPath)
    assert.equal(observed.userData, join(root, 'user-data'))
    assert.equal(observed.dshHome, join(root, 'dsh-home'))
    assert.equal(Number.isInteger(observed.processId) && observed.processId > 0, true)
    assert.equal(observed.forceRendererAccessibility, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged smoke runner can preserve a genuinely empty user data root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-empty-root-'))
  const userData = join(root, 'user-data')
  try {
    await runPackagedDesktop({
      appPath: process.execPath,
      userData,
      dshHome: join(root, 'dsh-home'),
      timeoutMs: 10_000,
      requireStartupTimings: false,
      seedPrimaryRuntimePermission: false,
      diagnosticsDirectory: null,
    })
    await assert.rejects(access(userData), error => error?.code === 'ENOENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged smoke runner only accepts an explicit boolean Windows visibility setting', async () => {
  await assert.rejects(
    runPackagedDesktop({
      appPath: process.execPath,
      userData: 'test-user-data',
      dshHome: 'test-dsh-home',
      windowsHide: 'false',
    }),
    /windowsHide must be a boolean/u,
  )
})

test('packaged smoke runner only accepts an explicit boolean accessibility test switch', async () => {
  await assert.rejects(
    runPackagedDesktop({
      appPath: process.execPath,
      userData: 'test-user-data',
      dshHome: 'test-dsh-home',
      forceRendererAccessibility: 'true',
    }),
    /forceRendererAccessibility must be a boolean/u,
  )
})

test('packaged smoke runner only accepts an explicit boolean permission seed switch', async () => {
  await assert.rejects(
    runPackagedDesktop({
      appPath: process.execPath,
      userData: 'test-user-data',
      dshHome: 'test-dsh-home',
      seedPrimaryRuntimePermission: 'false',
    }),
    /seedPrimaryRuntimePermission must be a boolean/u,
  )
})
