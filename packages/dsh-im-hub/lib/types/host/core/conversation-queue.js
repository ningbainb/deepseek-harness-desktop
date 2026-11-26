export class ConversationQueue {
    lanes = new Map();
    maxQueued;
    constructor(maxQueued = 16) {
        this.maxQueued = Math.max(1, maxQueued);
    }
    depth(key) {
        return this.lanes.get(key)?.depth ?? 0;
    }
    isBusy(key) {
        return this.lanes.get(key)?.busy ?? false;
    }
    clear(key) {
        this.lanes.delete(key);
    }
    async enqueue(key, task) {
        let lane = this.lanes.get(key);
        if (!lane) {
            lane = { tail: Promise.resolve(), depth: 0, busy: false };
            this.lanes.set(key, lane);
        }
        if (lane.depth >= this.maxQueued) {
            throw new Error(`conversation queue full (${this.maxQueued}) for ${key}`);
        }
        lane.depth += 1;
        const run = lane.tail.then(async () => {
            lane.busy = true;
            try {
                return await task();
            }
            finally {
                lane.busy = false;
                lane.depth = Math.max(0, lane.depth - 1);
                if (lane.depth === 0 && !lane.busy && this.lanes.get(key) === lane) {
                    this.lanes.delete(key);
                }
            }
        });
        lane.tail = run.then(() => undefined, () => undefined);
        return run;
    }
}
