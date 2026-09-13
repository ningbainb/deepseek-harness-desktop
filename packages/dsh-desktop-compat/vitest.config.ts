import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Recovery and skin-state fixtures perform real durable filesystem writes.
    // Avoid competing fsync-heavy files on hosted runners; each recovery test
    // still exercises its own concurrent readers and retains its timeout.
    fileParallelism: false,
  },
})
