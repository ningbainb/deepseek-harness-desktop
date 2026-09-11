/** Fence asynchronous UI work across quit, failed quit, and update recovery. */
export function createRuntimePresentationGuard() {
  let active = true
  let generation = 0
  const setActive = value => {
    if (active === value) return
    active = value
    generation += 1
  }
  return Object.freeze({
    get active() { return active },
    suspend: () => setActive(false),
    resume: () => setActive(true),
    capture() {
      const allowed = active
      const captured = generation
      return () => allowed && active && captured === generation
    },
  })
}
