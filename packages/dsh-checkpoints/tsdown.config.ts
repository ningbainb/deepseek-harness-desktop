import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@ningbainb/dsh-checkpoints', ['src/index.ts'], {
  libExternal: ['@deepseek-ai/dsh-atomic-write', '@deepseek-ai/dsh-home-paths'],
  companions: [{
    name: 'checkpoint-renderer', entry: { 'checkpoint-renderer': 'src/client/pierre-renderer.ts' },
    outDir: 'lib', format: 'esm', platform: 'browser', target: 'es2022', fixedExtension: false,
    dts: false, clean: false, minify: true, outputOptions: { codeSplitting: false, entryFileNames: 'checkpoint-renderer.js' },
    deps: { alwaysBundle: [/.*/] },
  }],
})
