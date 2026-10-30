import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['tests/**/*.spec.ts'], pool: 'threads', maxWorkers: 1, fileParallelism: false } })
