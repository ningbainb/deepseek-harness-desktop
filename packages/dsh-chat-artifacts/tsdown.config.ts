import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle(
  '@ningbainb/dsh-chat-artifacts',
  ['src/index.ts', 'src/invariant.ts'],
  {
    libExternal: [
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
    ],
  },
)
