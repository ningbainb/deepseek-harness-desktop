import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle(
  '@linxin666/dsh-particle-theme',
  ['src/index.ts'],
  {
    lib: {
      deps: {
        neverBundle: [
          '@deepseek-ai/cordis',
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-store',
          '@deepseek-ai/dsh-client-ui-conversation',
          '@deepseek-ai/dsh-client-ui-settings',
          '@deepseek-ai/dsh-client-ui-slots',
          '@deepseek-ai/dsh-settings',
        ],
      },
    },
  },
)
