import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@ningbainb/dsh-fast-ops', ['src/index.ts'], {
  libExternal: ['@ast-grep/napi', /^@ast-grep\/lang-/u, 'ignore'],
})
