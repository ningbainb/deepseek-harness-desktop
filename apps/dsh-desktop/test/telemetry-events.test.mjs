import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProductEvent,
  normalizeProductContext,
  sessionDurationBucket,
  startupDurationBucket,
} from '../src/telemetry-events.mjs'

test('normalizes only coarse product context dimensions', () => {
  assert.deepEqual(normalizeProductContext({
    version: '2.5.0',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  }), {
    appVersion: '2.5.0',
    channel: 'stable',
    os: 'windows-11',
    language: 'zh',
  })
  assert.deepEqual(normalizeProductContext({
    version: '2.6.0-beta.1',
    platform: 'win32',
    osRelease: '10.0.19045',
    locale: 'en-US',
  }), {
    appVersion: '2.6.0-beta.1',
    channel: 'prerelease',
    os: 'windows-10',
    language: 'en',
  })
})

test('classifies macOS as its own coarse operating system family', () => {
  assert.deepEqual(normalizeProductContext({
    version: '3.0.1',
    platform: 'darwin',
    osRelease: '24.6.0',
    locale: 'zh-CN',
  }), {
    appVersion: '3.0.1',
    channel: 'stable',
    os: 'macos',
    language: 'zh',
  })
  // 与 Windows 不同，macOS 不按版本细分，避免维护 Darwin 内核版本到 macOS 版本的映射表
  assert.equal(normalizeProductContext({
    version: '3.0.1',
    platform: 'darwin',
    osRelease: '27.0.0',
    locale: 'en-US',
  }).os, 'macos')
  // 缺少 osRelease 时也必须归到 macos，不能退化成 windows-other
  assert.equal(normalizeProductContext({
    version: '3.0.1',
    platform: 'darwin',
    osRelease: undefined,
    locale: 'en-US',
  }).os, 'macos')
  // 其余非 Windows 平台的既有归类保持不变（当前没有对应发布目标）
  assert.equal(normalizeProductContext({
    version: '3.0.1',
    platform: 'linux',
    osRelease: '6.8.0',
    locale: 'en-US',
  }).os, 'windows-other')
})

test('creates exact fixed-shape events and rejects content-like fields', () => {
  const context = normalizeProductContext({
    version: '2.5.0',
    platform: 'win32',
    osRelease: '10.0.22631',
    locale: 'zh-CN',
  })
  assert.deepEqual(createProductEvent(context, 'surface_opened', {
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
  }), {
    name: 'surface_opened',
    appVersion: '2.5.0',
    channel: 'stable',
    os: 'windows-11',
    language: 'zh',
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
  })
  assert.throws(() => createProductEvent(context, 'surface_opened', {
    outcome: 'opened',
    detail: 'settings',
    bucket: 'none',
    path: 'C:\\Users\\secret',
  }), /invalid product event dimensions/u)
  assert.throws(() => createProductEvent(context, 'runtime_start_result', {
    outcome: 'failed',
    detail: 'raw exception text',
    bucket: 'unknown',
  }), /invalid product event dimensions/u)
})

test('buckets startup and session durations without sending exact values', () => {
  assert.equal(startupDurationBucket(1_999), 'under-2s')
  assert.equal(startupDurationBucket(2_000), '2-5s')
  assert.equal(startupDurationBucket(5_000), '5-15s')
  assert.equal(startupDurationBucket(60_000), 'over-60s')
  assert.equal(startupDurationBucket(Number.NaN), 'unknown')
  assert.equal(sessionDurationBucket(299_999), 'under-5m')
  assert.equal(sessionDurationBucket(300_000), '5-30m')
  assert.equal(sessionDurationBucket(7_200_000), 'over-120m')
})
