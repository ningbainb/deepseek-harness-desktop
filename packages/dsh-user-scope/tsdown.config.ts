import { clientBundle } from '../../shared/tsdown.client.ts'

/** Host-only bundle; the shared preset emits no browser artifact without src/client. */
export default clientBundle('@ningbainb/dsh-user-scope', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-atomic-write',
    '@deepseek-ai/dsh-home-paths',
  ],
})
