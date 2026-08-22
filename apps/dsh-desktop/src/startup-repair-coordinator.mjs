const PROFILE_MODES = Object.freeze({
  desktop: 'full',
  'desktop-builtins': 'builtins',
})

function assertProvider(provider, profileName) {
  if (
    provider === null
    || typeof provider !== 'object'
    || provider.profileName !== profileName
    || typeof provider.dshHome !== 'string'
    || provider.dshHome.length === 0
    || typeof provider.ensureProfile !== 'function'
    || typeof provider.start !== 'function'
    || typeof provider.stop !== 'function'
  ) {
    throw new TypeError(`startup provider ${profileName} is invalid`)
  }
  return provider
}

export class StartupRepairCoordinator {
  constructor({
    createProvider,
    canRepair = async () => false,
    runRepair = async () => ({ status: 'unavailable' }),
    publishState = () => {},
    activateProvider = () => {},
    stopTimeoutMs = 7_500,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
  } = {}) {
    if (typeof createProvider !== 'function') throw new TypeError('startup provider factory is required')
    if (typeof canRepair !== 'function') throw new TypeError('startup repair availability callback must be a function')
    if (typeof runRepair !== 'function') throw new TypeError('startup repair callback must be a function')
    if (typeof publishState !== 'function' || typeof activateProvider !== 'function') {
      throw new TypeError('startup coordinator callbacks must be functions')
    }
    if (!Number.isInteger(stopTimeoutMs) || stopTimeoutMs < 1 || stopTimeoutMs > 60_000) {
      throw new TypeError('startup stop timeout must be between 1 and 60000 milliseconds')
    }
    this.createProvider = createProvider
    this.canRepair = canRepair
    this.runRepair = runRepair
    this.publishState = publishState
    this.activateProvider = activateProvider
    this.stopTimeoutMs = stopTimeoutMs
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.operation = undefined
  }

  start() {
    if (this.operation !== undefined) return this.operation
    this.operation = this.#run()
    return this.operation
  }

  async #provider(profileName) {
    const provider = await this.createProvider({ profileName, mode: PROFILE_MODES[profileName] })
    return assertProvider(provider, profileName)
  }

  async #publish(state) {
    await this.publishState(state)
  }

  async #startProvider(provider) {
    await this.activateProvider(provider)
    await provider.ensureProfile()
    await provider.start()
  }

  async #stopProvider(provider) {
    let timeout
    const timedOut = new Promise((resolve) => {
      timeout = this.schedule(() => resolve(true), this.stopTimeoutMs)
      timeout?.unref?.()
    })
    let stopFailed = false
    const stopped = Promise.resolve()
      .then(() => provider.stop())
      .then(() => false, () => { stopFailed = true; return false })
    const needsForce = await Promise.race([stopped, timedOut])
    this.cancelSchedule(timeout)
    if (needsForce === true || stopFailed) {
      if (typeof provider.forceStop !== 'function') {
        throw new Error('runtime provider could not be reclaimed after startup failure')
      }
      await provider.forceStop()
    }
  }

  async #run() {
    const full = await this.#provider('desktop')
    const failures = []
    await this.#publish('starting-full')
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.#startProvider(full)
        await this.#publish('ready-full')
        return Object.freeze({ state: 'ready-full', provider: full, fullAttempts: attempt })
      } catch (error) {
        failures.push(error)
        await this.#stopProvider(full)
        if (attempt === 1) await this.#publish('retrying-full')
      }
    }

    const repairInput = Object.freeze({
      fullAttempts: 2,
      failureCount: failures.length,
      failures: Object.freeze([...failures]),
    })
    const repairAvailable = await Promise.resolve()
      .then(() => this.canRepair(repairInput))
      .then(value => value === true, () => false)
    let repair = { status: 'unavailable', reason: 'model-unavailable' }
    if (repairAvailable) {
      await this.#publish('repairing')
      repair = await this.runRepair(repairInput).catch(() => ({ status: 'failed' }))
    }
    let rollbackFailed = false
    if (repair?.status === 'applied') {
      try {
        await this.#startProvider(full)
        if (typeof repair.commit === 'function') await repair.commit()
        await this.#publish('ready-full')
        return Object.freeze({ state: 'ready-full', provider: full, fullAttempts: 3, repaired: true })
      } catch {
        await this.#stopProvider(full)
        await this.#publish('rolling-back')
        try {
          if (typeof repair.rollback === 'function') await repair.rollback()
        } catch {
          rollbackFailed = true
        }
      }
    }

    const builtins = await this.#provider('desktop-builtins')
    if (builtins.dshHome !== full.dshHome) {
      throw new Error('fallback Runtime must use the same DSH Home')
    }
    await this.#publish('starting-builtins')
    await this.#startProvider(builtins)
    await this.#publish('ready-builtins')
    return Object.freeze({
      state: 'ready-builtins',
      provider: builtins,
      fullAttempts: 2,
      ...(rollbackFailed ? { rollbackFailed: true } : {}),
    })
  }
}
