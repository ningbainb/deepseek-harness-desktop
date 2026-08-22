import { lstat, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

const RESULT_STATUSES = new Set(['candidate-ready', 'model-unavailable', 'failed', 'timed-out'])

function assertIncidentPaths(jobPath, resultPath) {
  if (typeof jobPath !== 'string' || typeof resultPath !== 'string'
    || !isAbsolute(jobPath) || !isAbsolute(resultPath)) {
    throw new TypeError('repair job and result paths must be absolute')
  }
  const job = resolve(jobPath)
  const result = resolve(resultPath)
  if (dirname(job) !== dirname(result)) {
    throw new TypeError('repair job and result must share one incident directory')
  }
  return { jobPath: job, resultPath: result }
}

function validateResult(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !RESULT_STATUSES.has(value.status)) {
    throw new TypeError('repair Runtime result is invalid')
  }
  for (const field of ['changedFiles', 'checksRequested', 'attempts', 'actions']) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      throw new TypeError('repair Runtime result is invalid')
    }
  }
  return Object.freeze({ ...value })
}

async function defaultWaitForResult({ resultPath, pollIntervalMs, schedule, cancelSchedule }) {
  while (true) {
    try {
      const stat = await lstat(resultPath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) {
        throw new Error('repair Runtime result is not a bounded regular file')
      }
      return validateResult(JSON.parse(await readFile(resultPath, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await new Promise((resolveWait) => {
      const timer = schedule(resolveWait, pollIntervalMs)
      timer?.unref?.()
    })
    // The outer job timeout owns cancellation. Polling never reads outside the
    // already validated incident directory and persists no Runtime output.
    void cancelSchedule
  }
}

export class RepairRuntimeController {
  constructor({
    ensureProfile,
    createController,
    waitForResult = defaultWaitForResult,
    timeoutMs = 90_000,
    stopTimeoutMs = 7_500,
    pollIntervalMs = 100,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
  } = {}) {
    if (typeof ensureProfile !== 'function' || typeof createController !== 'function'
      || typeof waitForResult !== 'function') {
      throw new TypeError('repair Runtime profile, controller, and result reader are required')
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 90_000
      || !Number.isInteger(stopTimeoutMs) || stopTimeoutMs < 1 || stopTimeoutMs > 60_000
      || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 5_000) {
      throw new TypeError('repair Runtime timeout configuration is invalid')
    }
    this.ensureProfile = ensureProfile
    this.createController = createController
    this.waitForResult = waitForResult
    this.timeoutMs = timeoutMs
    this.stopTimeoutMs = stopTimeoutMs
    this.pollIntervalMs = pollIntervalMs
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
  }

  async #stop(controller) {
    let timer
    let stopFailed = false
    const timeout = new Promise((resolveTimeout) => {
      timer = this.schedule(() => resolveTimeout('timeout'), this.stopTimeoutMs)
    })
    const stopped = Promise.resolve()
      .then(() => controller.stop())
      .then(() => 'stopped', () => {
        stopFailed = true
        return 'failed'
      })
    const outcome = await Promise.race([stopped, timeout])
    this.cancelSchedule(timer)
    if ((outcome === 'timeout' || stopFailed) && typeof controller.forceStop === 'function') {
      await controller.forceStop()
    }
  }

  async run({ jobPath, resultPath } = {}) {
    const paths = assertIncidentPaths(jobPath, resultPath)
    await this.ensureProfile()
    const controller = this.createController({
      profileName: 'desktop-repair',
      preferredPort: 0,
      patchFiles: [],
      environment: Object.freeze({
        DSH_DESKTOP_REPAIR_JOB: paths.jobPath,
        DSH_DESKTOP_REPAIR_MODE: '1',
        DSH_DESKTOP_BACKGROUND_AUTOMATION: '0',
      }),
    })
    if (controller === null || typeof controller !== 'object'
      || typeof controller.start !== 'function' || typeof controller.stop !== 'function') {
      throw new TypeError('repair Runtime controller is invalid')
    }

    let timeout
    let statusHandler
    try {
      await controller.start()
      const crashed = new Promise((resolveCrash, rejectCrash) => {
        statusHandler = (status) => {
          if (status?.state === 'crashed' || status?.state === 'stopped') {
            rejectCrash(new Error('repair Runtime exited before producing a result'))
          }
        }
        controller.on?.('status', statusHandler)
        if (controller.status?.state === 'crashed' || controller.status?.state === 'stopped') {
          statusHandler(controller.status)
        }
        void resolveCrash
      })
      const timedOut = new Promise((resolveTimeout, rejectTimeout) => {
        timeout = this.schedule(
          () => rejectTimeout(new Error('repair Runtime did not produce a result before its timeout')),
          this.timeoutMs,
        )
        void resolveTimeout
      })
      const result = await Promise.race([
        this.waitForResult({
          resultPath: paths.resultPath,
          pollIntervalMs: this.pollIntervalMs,
          schedule: this.schedule,
          cancelSchedule: this.cancelSchedule,
        }),
        crashed,
        timedOut,
      ])
      return validateResult(result)
    } finally {
      if (timeout !== undefined) this.cancelSchedule(timeout)
      if (statusHandler !== undefined) controller.off?.('status', statusHandler)
      await this.#stop(controller)
    }
  }
}
