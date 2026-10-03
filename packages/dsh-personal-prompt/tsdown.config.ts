import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@ningbainb/dsh-personal-prompt', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-workspace',
    '@deepseek-ai/schemastery',
    '@ningbainb/dsh-user-scope',
    'schemastery',
  ],
})
