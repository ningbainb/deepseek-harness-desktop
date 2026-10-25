export default {
  test: { include: ['tests/**/*.spec.ts'], environment: 'node', fileParallelism: false, maxWorkers: 1 },
}
