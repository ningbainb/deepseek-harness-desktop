import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle(
  '@linxin666/dsh-live-stats',
  ['src/index.ts', 'src/invariant.ts'],
  {
    lib: {
      // 宿主侧会在运行时从 dsh 配置树解析 dsh-settings，而不是本地安装；
      // 其内置声明带有 rolldown 无法跟随的 .ts 后缀相对引用，因此保持外部。
      deps: {
        neverBundle: [
          '@deepseek-ai/cordis',
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-ui-conversation',
          '@deepseek-ai/dsh-client-ui-settings',
          '@deepseek-ai/dsh-client-ui-slots',
          '@deepseek-ai/dsh-credentials',
          '@deepseek-ai/dsh-host-webserver',
          '@deepseek-ai/dsh-invariants',
          '@deepseek-ai/dsh-llm',
          '@deepseek-ai/dsh-session',
          '@deepseek-ai/dsh-session-projection',
          '@deepseek-ai/dsh-settings',
          '@deepseek-ai/dsh-token-meter',
        ],
      },
    },
  },
)
