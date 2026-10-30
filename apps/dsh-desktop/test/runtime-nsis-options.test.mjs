import assert from 'node:assert/strict'
import test from 'node:test'

test('an old adapter without mandatory restoration accounting cannot build a new installer', async () => {
  const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
  assert.throws(() => configureNormalNsisBuild({}, { schemaVersion: 1, directory: 'E:/payload',
    manifestSHA256: 'a'.repeat(64) }), /adapter|identity|restor/iu)
})

test('restored bytes increase both NSIS space estimates upward exactly once', async () => {
  const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
  const configured = configureNormalNsisBuild({}, { schemaVersion: 2, directory: 'E:/payload',
    manifestSHA256: 'a'.repeat(64), restorationBytes: 1025 })
  const defines = { APP_64_UNPACKED_SIZE: '100', ESTIMATED_SIZE: 100 }
  await configured.effectiveOptionComputed([defines, {}])
  assert.equal(Number(defines.APP_64_UNPACKED_SIZE), 102)
  assert.equal(Number(defines.ESTIMATED_SIZE), 102)
  await configured.effectiveOptionComputed([defines, {}])
  assert.equal(Number(defines.APP_64_UNPACKED_SIZE), 102)
  assert.equal(Number(defines.ESTIMATED_SIZE), 102)
})

for (const restorationBytes of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid restored byte count is refused: ${restorationBytes}`, async () => {
    const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
    assert.throws(() => configureNormalNsisBuild({}, { schemaVersion: 2, directory: 'E:/payload',
      manifestSHA256: 'a'.repeat(64), restorationBytes }), /restor|size|bytes/iu)
  })
}

test('zero restoration retains the upward compact estimate rather than the rounded-down registry size', async () => {
  const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
  const configured = configureNormalNsisBuild({}, { schemaVersion: 2, directory: 'E:/payload',
    manifestSHA256: 'a'.repeat(64), restorationBytes: 0 })
  const defines = { APP_64_UNPACKED_SIZE: '101', ESTIMATED_SIZE: 100 }
  await configured.effectiveOptionComputed([defines, {}])
  assert.equal(Number(defines.APP_64_UNPACKED_SIZE), 101)
  assert.equal(defines.ESTIMATED_SIZE, 101)
})
test('offline reconstruction preserves the normal NSIS lifecycle and all existing compiler commands', async () => {
  const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
  const args = { publish: 'never', config: { nsis: { include: 'build/installer.nsh' } } }
  const configured = configureNormalNsisBuild(args, { schemaVersion: 2, directory: 'E:/payload', manifestSHA256: 'a'.repeat(64), restorationBytes: 0 })
  const defines = { APP_ID: 'unchanged' }, commands = { SetCompressor: 'zlib', OutFile: 'setup.exe' }
  assert.equal(await configured.effectiveOptionComputed([defines, commands]), false)
  assert.equal(defines.APP_ID, 'unchanged')
  assert.equal(defines.DSH_RUNTIME_MANIFEST_SHA256, 'a'.repeat(64))
  assert.equal(commands.SetCompressor, 'zlib')
  assert.equal(commands['!addincludedir'], '"E:/payload"')
  assert.equal(configured.config.nsis.script, undefined)
  assert.equal(args.effectiveOptionComputed, undefined)
})
test('normal lifecycle adapter refuses custom scripts and invalid compiler paths', async () => {
  const { configureNormalNsisBuild } = await import('../scripts/runtime-nsis-options.mjs')
  const adapter = { schemaVersion: 2, directory: 'E:/payload', manifestSHA256: 'a'.repeat(64), restorationBytes: 0 }
  assert.throws(() => configureNormalNsisBuild({ config: { nsis: { script: 'custom.nsi' } } }, adapter), /custom/u)
  assert.throws(() => configureNormalNsisBuild({}, { ...adapter, directory: 'E:/bad$path' }), /path/u)
})
