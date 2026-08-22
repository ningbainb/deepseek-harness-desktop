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

test('startup surface is status-only and exposes no recovery decisions', async () => {
  const [html, renderer] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.mjs', uiRoot), 'utf8'),
  ])
  assert.doesNotMatch(html, /recovery-summary|data-action=|data-tool-action=|<button|<dialog/u)
  assert.match(renderer, /STARTUP_STALL_NOTICE_MS = 30_000/u)
  assert.doesNotMatch(renderer, /\.action\(|\.toolAction\(|safe-mode|disable-plugin|export-diagnostics/u)
  for (const copy of ['正在启动全部插件', '正在自动恢复', '正在自动修复插件', '正在验证修复']) {
    assert.match(renderer, new RegExp(copy, 'u'))
  }
})

test('startup surface never asks new or existing users about migration', async () => {
  const [html, renderer] = await Promise.all([
    readFile(new URL('startup.html', uiRoot), 'utf8'),
    readFile(new URL('startup.mjs', uiRoot), 'utf8'),
  ])
  assert.doesNotMatch(html, /迁移|升级|隔离|恢复会话/u)
  assert.doesNotMatch(renderer, /migration/u)
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
