export function start() {
  const error = new Error('deterministic startup throw')
  error.code = 'PLUGIN_STARTUP_THROW'
  throw error
}
