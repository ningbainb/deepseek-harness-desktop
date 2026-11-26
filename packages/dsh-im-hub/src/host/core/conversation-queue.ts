interface QueueLane {
  tail: Promise<void>
  depth: number
  busy: boolean
}

export class ConversationQueue {
  private readonly lanes = new Map<string, QueueLane>()
  private readonly maxQueued: number

  constructor(maxQueued = 16) {
    this.maxQueued = Math.max(1, maxQueued)
  }

  depth(key: string): number {
    return this.lanes.get(key)?.depth ?? 0
  }

  isBusy(key: string): boolean {
    return this.lanes.get(key)?.busy ?? false
  }

  clear(key: string): void {
    this.lanes.delete(key)
  }

  async enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    let lane = this.lanes.get(key)
    if (!lane) {
      lane = { tail: Promise.resolve(), depth: 0, busy: false }
      this.lanes.set(key, lane)
    }
    if (lane.depth >= this.maxQueued) {
      throw new Error(`conversation queue full (${this.maxQueued}) for ${key}`)
    }
    lane.depth += 1

    const run = lane.tail.then(async () => {
      lane.busy = true
      try {
        return await task()
      } finally {
        lane.busy = false
        lane.depth = Math.max(0, lane.depth - 1)
        if (lane.depth === 0 && !lane.busy && this.lanes.get(key) === lane) {
          this.lanes.delete(key)
        }
      }
    })

    lane.tail = run.then(
      () => undefined,
      () => undefined,
    )

    return run
  }
}
