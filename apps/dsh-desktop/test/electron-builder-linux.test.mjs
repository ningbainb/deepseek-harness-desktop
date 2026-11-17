import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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

test('Linux browser component carrier runs after build and before upload using the actual packaged main', async () => {
  const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
  const steps = workflow.jobs.build.steps
  const build = steps.findIndex(step => step.run?.includes('pnpm --filter @linxin666/dsh-desktop pack:linux'))
  const tests = steps.filter(step => step.run?.includes('node --test apps/dsh-desktop/test/browser-component.test.mjs apps/dsh-desktop/test/runtime-browser-component.test.mjs'))
  assert.equal(tests.length, 1, 'Retain exactly one complete component and adapter test invocation')
  const index = steps.indexOf(tests[0])
  const upload = steps.findIndex(step => step.uses === 'actions/upload-artifact@v4')
  assert.ok(build >= 0 && index > build, 'The real carrier test requires the packaged application from the build')
  assert.ok(index < upload, 'A carrier failure must block every upload')
  assert.equal(tests[0].env.DSH_BROWSER_COMPONENT_CARRIER, '${{ github.workspace }}/apps/dsh-desktop/dist/linux-unpacked/deepseek-harness-desktop')
  assert.doesNotMatch(tests[0].run, /--test-name-pattern|--test-skip-pattern/u)
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

for (const scenario of ['unique', 'none', 'duplicate']) {
  test(`installed executable selector executes source fixture with same-name docs and alias: ${scenario}`, async t => {
    const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
    const step = workflow.jobs['validate-ubuntu24'].steps.find(step => step.name === 'Extract the same deb for Ubuntu 24 acceptance')
    const selector = /node --input-type=module - linux-ubuntu24-qa\/installed-files\.txt <<'NODE' > linux-ubuntu24-qa\/installed-executables\.txt\n([\s\S]+?)\nNODE/u.exec(step.run)?.[1]
    assert.ok(selector, 'Run the actual portable source selector, without simulating Linux installation or changing process.platform')
    const root = await mkdtemp(join(tmpdir(), 'dsh-installed-executable-selector-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const doc = join(root, 'usr', 'share', 'doc', 'deepseek-harness-desktop')
    const app = join(root, 'opt', 'DeepSeek Harness Desktop')
    const alias = join(root, 'usr', 'bin', 'deepseek-harness-desktop')
    const binary = join(app, 'deepseek-harness-desktop')
    await Promise.all([mkdir(doc, { recursive: true }), mkdir(app, { recursive: true }), mkdir(dirname(alias), { recursive: true })])
    await writeFile(binary, Buffer.from('source selector fixture, never executed'))
    await chmod(binary, 0o755)
    await symlink(app, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const paths = [doc, alias, ...(scenario === 'none' ? [] : [binary])]
    if (scenario === 'duplicate') {
      const second = join(root, 'another', 'deepseek-harness-desktop')
      await mkdir(dirname(second)); await writeFile(second, 'another source fixture'); await chmod(second, 0o755)
      paths.push(second)
    }
    const list = join(root, 'installed-files.txt')
    await writeFile(list, paths.map(path => path.replaceAll('\\', '/')).join('\n') + '\n')
    const result = spawnSync(process.execPath, ['--input-type=module', '-', list], { input: selector, encoding: 'utf8', windowsHide: true })
    assert.match(result.stderr, /"kind":"directory"/u, 'The real same-name doc directory must be classified')
    assert.match(result.stderr, /"kind":"symbolic-link"/u, 'The real alias must be rejected without following it')
    if (scenario === 'unique') {
      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(result.stdout.trim().split(/\r?\n/u), [binary.replaceAll('\\', '/')])
    } else {
      assert.notEqual(result.status, 0, 'Zero or multiple regular executable files must block native acceptance')
      assert.match(result.stderr, /Expected exactly one installed regular non-link executable/u)
    }
  })
}

test('Ubuntu 24 installation assertions diagnose failure and match the pinned builder AppArmor template and hook', async () => {
  const workflow = YAML.parse(await readFile(join(repositoryDirectory, '.github', 'workflows', 'linux-preview.yml'), 'utf8'))
  const step = workflow.jobs['validate-ubuntu24'].steps.find(step => step.name === 'Extract the same deb for Ubuntu 24 acceptance')
  assert.match(step.run, /set -Eeuo pipefail/u)
  assert.match(step.run, /trap .*BASH_COMMAND.* ERR/u)
  assert.match(step.run, /checkpoint 'loaded exact AppArmor profile'/u)
  assert.match(step.run, /checkpoint 'compare installed ELF with the same extracted deb'/u)
  assert.match(step.run, /test -f "\$\{installedExecutables\[0\]\}"/u)
  assert.match(step.run, /test ! -L "\$\{installedExecutables\[0\]\}"/u)
  assert.match(step.run, /test -x "\$\{installedExecutables\[0\]\}"/u)
  const appRequire = createRequire(join(appDirectory, 'package.json'))
  const builderRequire = createRequire(appRequire.resolve('electron-builder/package.json'))
  const builderRoot = dirname(builderRequire.resolve('app-builder-lib/package.json'))
  const template = await readFile(join(builderRoot, 'templates', 'linux', 'apparmor-profile.tpl'), 'utf8')
  const hook = await readFile(join(builderRoot, 'templates', 'linux', 'after-install.tpl'), 'utf8')
  assert.match(template, /profile "\$\{executable\}" "\/opt\/\$\{sanitizedProductName\}\/\$\{executable\}" flags=\(unconfined\)/u)
  assert.match(hook, /APPARMOR_PROFILE_SOURCE='\/opt\/\$\{sanitizedProductName\}\/resources\/apparmor-profile'/u)
  assert.match(hook, /APPARMOR_PROFILE_TARGET='\/etc\/apparmor\.d\/\$\{executable\}'/u)
  assert.match(hook, /apparmor_parser --replace --write-cache --skip-read-cache "\$APPARMOR_PROFILE_TARGET"/u)
})
