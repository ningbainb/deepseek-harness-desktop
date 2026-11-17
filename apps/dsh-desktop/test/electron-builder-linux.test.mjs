import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import YAML from 'yaml'

const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDirectory = join(appDirectory, '..', '..')

async function readPackagingConfig() {
  return YAML.parse(await readFile(join(appDirectory, 'electron-builder.yml'), 'utf8'))
}

async function readPackageManifest() {
  return JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
}

test('Linux packaging provides one x64 deb installer and retains legacy AppImage naming', async () => {
  const config = await readPackagingConfig()
  const manifest = await readPackageManifest()
  assert.equal(manifest.homepage, 'https://github.com/ningbainb/deepseek-harness-desktop')
  assert.equal(manifest.desktopName, config.appId)
  assert.equal(config.linux.icon, 'build/icon.png')
  assert.equal(config.linux.category, 'Development')
  assert.equal(config.linux.maintainer, 'ningbainb <ningbainb@users.noreply.github.com>')
  assert.equal(config.linux.vendor, 'ningbainb')
  assert.equal(config.linux.executableName, 'deepseek-harness-desktop')
  assert.equal(config.linux.syncDesktopName, true)
  assert.deepEqual(config.linux.target.map((entry) => entry.target), ['deb'])
  for (const entry of config.linux.target) assert.deepEqual(entry.arch, ['x64'])
  assert.equal(config.appImage.artifactName, 'DeepSeek-Harness-Desktop-${version}-x86_64.${ext}')
  assert.equal(config.deb.artifactName, 'DeepSeek-Harness-Desktop-${version}-amd64.${ext}')
  assert.equal(config.deb.packageCategory, 'devel')
})

for (const mutation of ['none', 'source-commit', 'installer-hash', 'version']) {
  test(`Ubuntu 24 executes the downloaded-installer identity guard: ${mutation}`, async t => {
    const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
    const step = workflow.jobs['validate-ubuntu24'].steps.find(candidate => candidate.name === 'Verify the candidate commit and installer bytes')
    const script = /node --input-type=module <<'NODE'\n([\s\S]+)\nNODE\s*$/u.exec(step.run)?.[1]
    assert.ok(script, 'candidate identity guard must be executable, not an inert workflow label')
    const root = await mkdtemp(join(tmpdir(), 'dsh-linux-artifact-'))
    t.after(async () => {
      assert.ok(root.startsWith(join(tmpdir(), 'dsh-linux-artifact-')))
      await rm(root, { recursive: true, force: true })
    })
    const directory = join(root, 'dist')
    await mkdir(directory)
    const version = '5.3.0-rc.1'
    const name = `DeepSeek-Harness-Desktop-${version}-amd64.deb`
    const payload = Buffer.from('same native installer fixture')
    const commit = 'a'.repeat(40)
    const receipt = { sourceCommit: commit, version, platform: 'linux', arch: 'x64', files: [{
      file: name, role: 'user-installer', size: payload.length, sha256: createHash('sha256').update(payload).digest('hex'),
    }] }
    if (mutation === 'source-commit') receipt.sourceCommit = 'b'.repeat(40)
    if (mutation === 'installer-hash') receipt.files[0].sha256 = '0'.repeat(64)
    if (mutation === 'version') receipt.version = '5.2.0'
    await writeFile(join(root, 'package.json'), JSON.stringify({ version }))
    await writeFile(join(directory, name), payload)
    await writeFile(join(directory, 'distribution-artifacts-linux-x64.json'), JSON.stringify(receipt))
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: directory, env: { ...process.env, GITHUB_SHA: commit }, encoding: 'utf8', windowsHide: true,
    })
    if (mutation === 'none') assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0, 'a different commit, version or installer must not reach native acceptance')
  })
}

test('Linux packaging uses system Git and never inherits bundled MinGit', async () => {
  const config = await readPackagingConfig()
  const topLevel = config.extraResources ?? []
  const linux = config.linux?.extraResources ?? []
  assert.equal(topLevel.some((entry) => entry.to === 'managed-git/current'), false)
  assert.equal(linux.some((entry) => entry.to === 'managed-git/current'), false)
  assert.equal(config.win.extraResources.some((entry) => entry.to === 'managed-git/current'), true)
})

test('Linux CI smoke keeps the Chromium sandbox enabled with installed permissions', async () => {
  const workflow = await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8')
  assert.match(workflow, /sudo chown root:root "\$sandbox"/u)
  assert.match(workflow, /sudo chmod 4755 "\$sandbox"/u)
  assert.match(workflow, /stat -c '%U:%G %a'/u)
  assert.doesNotMatch(workflow, /--no-sandbox/u)
})

test('Linux preview verifies the sole deb, its updater identity, and archive contents before upload', async () => {
  const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
  const run = workflow.jobs.build.steps.map(step => step.run ?? '').join('\n')
  assert.match(run, /verify-distribution-artifacts\.mjs linux/u)
  assert.match(run, /dpkg-deb --extract/u)
  assert.match(run, /package-type/u)
  assert.match(run, /pack:sandbox:linux/u)
  assert.match(run, /xvfb-run -a/u)
  const uploads = workflow.jobs.build.steps.filter(step => step.uses === 'actions/upload-artifact@v4')
  assert.equal(uploads.some(step => step.with.path.includes('.AppImage')), false)
  assert.equal(uploads.some(step => step.with.path.includes('*-amd64.deb')), true)
})

test('Linux preview builds once on Ubuntu 22 and verifies the same hashed deb on Ubuntu 24', async () => {
  const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
  assert.equal(workflow.jobs.build['runs-on'], 'ubuntu-22.04')
  assert.equal(workflow.jobs.build.strategy, undefined)
  const validation = workflow.jobs['validate-ubuntu24']
  assert.ok(validation, 'Ubuntu 24 native acceptance must remain')
  assert.equal(validation['runs-on'], 'ubuntu-24.04')
  assert.equal(validation.needs, 'build')
  const buildSteps = workflow.jobs.build.steps
  const validationSteps = validation.steps
  const buildCommands = buildSteps.map(step => step.run ?? '').join('\n')
  const validationCommands = validationSteps.map(step => step.run ?? '').join('\n')
  const allCommands = Object.values(workflow.jobs).flatMap(job => job.steps.map(step => step.run ?? '')).join('\n')
  assert.equal(allCommands.match(/pnpm --filter @linxin666\/dsh-desktop pack:linux(?:\s|$)/gu)?.length, 1)
  assert.doesNotMatch(validationCommands, /(?:pack:linux|electron-builder|pnpm\s+(?:-r\s+)?build)/u)
  for (const commands of [buildCommands, validationCommands]) {
    assert.match(commands, /pack:verify:linux/u)
    assert.match(commands, /verify-office-runtime\.mjs/u)
    assert.match(commands, /pack:sandbox:linux/u)
    assert.match(commands, /xvfb-run -a.*pack:smoke:linux/u)
    assert.match(commands, /sudo chown root:root "\$sandbox"/u)
    assert.match(commands, /sudo chmod 4755 "\$sandbox"/u)
    assert.match(commands, /stat -c '%U:%G %a'/u)
    assert.doesNotMatch(commands, /--no-sandbox/u)
  }
  assert.match(buildCommands, /pnpm typecheck/u)
  assert.match(buildCommands, /terminal-session\.test\.mjs/u)
  assert.match(buildCommands, /runtime-controller\.test\.mjs/u)
  const artifact = buildSteps.find(step => step.uses === 'actions/upload-artifact@v4')
  const download = validationSteps.find(step => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with.name, artifact.with.name)
  assert.equal(download.with.path, 'apps/dsh-desktop/dist')
  assert.match(validationCommands, /sha256sum -c SHA256SUMS-linux\.txt/u)
  assert.match(validationCommands, /receipt\.sourceCommit, process\.env\.GITHUB_SHA/u)
  assert.match(validationCommands, /digest\.digest\('hex'\), artifact\.sha256/u)
  assert.match(validationCommands, /dpkg-deb --extract/u)
  assert.match(validationCommands, /sudo apt-get install -y --no-install-recommends "\.\/\$deb"/u)
  assert.match(validationCommands, /dpkg-query -L "\$package"/u)
  assert.match(validationCommands, /cmp .*executables\[0\].*installedExecutables\[0\]/u)
  assert.match(validationCommands, /sudo apparmor_status --enabled/u)
  assert.match(validationCommands, /sudo grep -Fx 'deepseek-harness-desktop \(unconfined\)' \/sys\/kernel\/security\/apparmor\/profiles/u)
  assert.match(validationCommands, /app="\$\(dirname "\$\{installedExecutables\[0\]\}"\)"/u)
  assert.match(validationCommands, /test "\$app" = '\/opt\/DeepSeek Harness Desktop'/u)
  assert.match(validationCommands, /sudo cmp "\$app\/resources\/apparmor-profile" \/etc\/apparmor.d\/deepseek-harness-desktop/u)
  assert.doesNotMatch(validationCommands, /(?:sysctl|apparmor_restrict_unprivileged_userns|--disable-setuid-sandbox|--disable-namespace-sandbox)/u)
  assert.match(validationCommands, /ln -s .*linux-unpacked/u)
  const hashCheck = validationSteps.findIndex(step => step.name === 'Verify the candidate commit and installer bytes')
  const extraction = validationSteps.findIndex(step => step.name === 'Extract the same deb for Ubuntu 24 acceptance')
  const smoke = validationSteps.findIndex(step => step.run?.includes('pack:smoke:linux'))
  assert.ok(hashCheck >= 0 && extraction > hashCheck && smoke > extraction)
  const receipt = validationSteps.findIndex(step => step.name === 'Record Ubuntu 24 acceptance for the shared installer')
  assert.ok(receipt > smoke, 'success receipt follows every native acceptance step')
  assert.match(validationSteps[receipt].run, /installer: receipt\.files\[0\]/u)
  for (const upload of validationSteps.filter(step => step.uses === 'actions/upload-artifact@v4')) {
    assert.doesNotMatch(upload.with.path, /\.(?:deb|AppImage)/u, 'Ubuntu 24 uploads evidence only, never a second installer')
  }
})
