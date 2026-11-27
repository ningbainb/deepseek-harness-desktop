import { clientBundle } from '../../shared/tsdown.client.ts'
import { copyPdfAssets } from './scripts/copy-pdf-assets.mjs'

export default clientBundle('@ningbainb/dsh-doc-ingest', ['src/index.ts', 'src/host/parse-worker.ts'], {
  hostPhase: true,
  libExternal: [/^@deepseek-ai\//, 'defuddle/full', 'linkedom', 'ipaddr.js', 'yauzl'],
  libOnlyBundle: [/^officeparser(?:\/|$)/, /^unpdf(?:\/|$)/],
  lib: {
    entry: { index: 'src/index.ts', 'parse-worker': 'src/host/parse-worker.ts' },
    deps: { alwaysBundle: [/^officeparser(?:\/|$)/, /^unpdf(?:\/|$)/] },
    plugins: [{ name: 'dsh-doc-ingest-pdf-assets', writeBundle: copyPdfAssets }],
  },
})
