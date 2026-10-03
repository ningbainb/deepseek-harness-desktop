import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep, win32 } from 'node:path'

import { controlToolApprovalDecision, installAgentWslTool } from '@linxin666/dsh-desktop-compat'
import { AgentShellPermissionStore } from '../src/agent-shell-permission.mjs'

if (process.platform !== 'win32') throw new Error('real Agent WSL acceptance runs only on Windows')

const root = resolve('E:/DeepSeekHarnessDesktop-Build')
const temporaryRoot = join(root, 'temp')
const evidencePath = join(root, 'artifacts', 'agent-wsl-real-acceptance.json')
const distro = process.env.DSH_AGENT_WSL_TEST_DISTRIBUTION ?? 'dsh-agent-acceptance'
if (win32.parse(root).root.toLowerCase() !== 'e:\\') throw new Error('WSL acceptance must use the E: build root')
await mkdir(temporaryRoot, { recursive: true })
const testDir = await mkdtemp(join(temporaryRoot, 'agent-wsl-real-'))
if (!resolve(testDir).toLowerCase().startsWith(`${resolve(temporaryRoot).toLowerCase()}${sep}`)) {
  throw new Error('test directory escaped the dedicated E: temporary root')
}
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = testDir

try {
  const store = new AgentShellPermissionStore({ dshHome: testDir })
  assert.deepEqual(await store.status(), { mode: 'ask', valid: true })
  const registered = new Map()
  installAgentWslTool({ tools: { register: tool => registered.set(tool.name, tool) } })
  const list = registered.get('desktop_wsl_list')
  const tool = registered.get('desktop_wsl')
  assert.ok(list && tool, 'the Agent-facing WSL tools must register')
  const execution = {
    signal: new AbortController().signal,
    agent: { session: { header: { cwd: testDir } } },
  }
  const inventory = await list.execute({}, execution)
  assert.ok(inventory.distributions.includes(distro), 'test WSL distribution must be installed')
  assert.ok(!inventory.distributions.includes('docker-desktop'), 'Docker Desktop is not an Agent terminal')

  assert.equal(controlToolApprovalDecision('desktop_wsl', 'ask')?.kind, 'ask')
  const result = await tool.execute({
    command: "printf 'agent-wsl-verified' > acceptance.txt; pwd",
    distribution: distro,
  }, execution)
  assert.equal(result.exitCode, 0)
  assert.equal(result.timedOut, false)
  assert.equal(result.truncated, false)
  assert.match(result.stdout, /^\/mnt\/e\//u)
  assert.equal(await readFile(join(testDir, 'acceptance.txt'), 'utf8'), 'agent-wsl-verified')

  await store.setMode('allow')
  assert.equal(controlToolApprovalDecision('desktop_wsl', 'allow')?.kind, 'allow')
  const trusted = await tool.execute({ command: 'cat acceptance.txt', distribution: distro }, execution)
  assert.equal(trusted.stdout, 'agent-wsl-verified')
  const cancelled = new AbortController()
  const pending = tool.execute({ command: 'sleep 17', distribution: distro }, {
    ...execution,
    signal: cancelled.signal,
  })
  setTimeout(() => cancelled.abort(), 500)
  await assert.rejects(pending, /已取消/u)
  await store.setMode('off')
  assert.equal(controlToolApprovalDecision('desktop_wsl', 'off')?.kind, 'deny')
  await assert.rejects(tool.execute({ command: 'pwd', distribution: distro }, execution), /已由用户关闭/u)

  await mkdir(join(root, 'artifacts'), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify({
    passed: true,
    distribution: distro,
    drive: 'E:',
    checks: ['real-wsl-list', 'real-command', 'workspace-mapping', 'windows-file-roundtrip', 'ask-policy', 'allow-policy', 'off-policy', 'command-cancellation'],
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')
  console.log(`Agent WSL real acceptance passed; evidence: ${evidencePath}`)
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(testDir, { recursive: true, force: true })
}
