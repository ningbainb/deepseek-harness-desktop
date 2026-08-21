import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { computeWhalePose } from '../src/ui/whale-particles.mjs'

const uiRoot = new URL('../src/ui/', import.meta.url)

test('startup branding contains no decorative blue circle', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.css', uiRoot), 'utf8'),
  ])
  assert.doesNotMatch(html, /brand-mark/u)
  assert.doesNotMatch(css, /\.brand-mark/u)
})

test('progress meter carries milestone ticks and a leading tip', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.css', uiRoot), 'utf8'),
  ])
  assert.match(html, /meter-tick meter-tick-1/u)
  assert.match(html, /meter-tick meter-tick-2/u)
  assert.match(html, /meter-tip/u)
  assert.match(css, /\.meter\[data-phase="2"\] \.meter-tick-2/u)
  assert.match(css, /@keyframes tip-swim/u)
})

test('startup surface keeps a diagnostics export path available before runtime readiness', async () => {
  const [html, renderer, css] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.mjs', uiRoot), 'utf8'),
    readFile(new URL('startup.css', uiRoot), 'utf8'),
  ])
  assert.match(html, /data-action="export-diagnostics"/u)
  assert.match(html, /data-tool-action="terminal"/u)
  assert.match(html, /打开内置终端/u)
  assert.match(html, /id="diagnostic-export-status"/u)
  assert.match(renderer, /STARTUP_STALL_NOTICE_MS = 30_000/u)
  assert.match(renderer, /启动耗时较长；可导出诊断日志/u)
  assert.match(renderer, /action === 'export-diagnostics'/u)
  assert.match(renderer, /window\.dshDesktop\.toolAction\('terminal'\)/u)
  assert.match(css, /\.startup-support/u)
})

test('startup surface reports automatic migration without exposing a migration decision button', async () => {
  const [html, renderer] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.mjs', uiRoot), 'utf8'),
  ])
  assert.match(html, /升级迁移会在后台自动完成/u)
  assert.doesNotMatch(html, /data-action="upgrade-migration"|migration-assistant-status/u)
  assert.doesNotMatch(renderer, /upgrade-migration|setMigrationAssistantStatus/u)
})

test('whale pose stays inside the right-side swim corridor', () => {
  const width = 1440
  const height = 900
  const samples = []
  for (let elapsed = 0; elapsed <= 180; elapsed += 0.25) {
    const pose = computeWhalePose(elapsed, width, height, false)
    samples.push(pose)
    assert.ok(pose.centerX >= width * 0.715 && pose.centerX <= width * 0.815)
    assert.ok(pose.centerY >= height * 0.345 && pose.centerY <= height * 0.49)
    assert.ok(Math.abs(pose.heading) <= 0.05)
    assert.ok(pose.breathe >= 0.985 && pose.breathe <= 1.015)
  }
  const horizontalTravel = Math.max(...samples.map(({ centerX }) => centerX)) - Math.min(...samples.map(({ centerX }) => centerX))
  const verticalTravel = Math.max(...samples.map(({ centerY }) => centerY)) - Math.min(...samples.map(({ centerY }) => centerY))
  assert.ok(horizontalTravel >= width * 0.065)
  assert.ok(verticalTravel >= height * 0.085)
  assert.ok(new Set(samples.map(({ finPhase }) => finPhase.toFixed(2))).size > 100)
})

test('reduced motion returns a stable final pose', () => {
  assert.deepEqual(
    computeWhalePose(1, 1200, 800, true),
    computeWhalePose(100, 1200, 800, true),
  )
})
