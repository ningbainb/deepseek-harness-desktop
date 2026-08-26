export function start() {
  const error = new Error('The module was compiled against a different NODE_MODULE_VERSION')
  error.code = 'ERR_DLOPEN_FAILED'
  throw error
}
