import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const testRequire = createRequire(new URL('../../../packages/dsh-pet/package.json', import.meta.url))
const root = fileURLToPath(new URL('../../../', import.meta.url))
const publishedRoot = resolve(process.env.DSH_PET_CLEARANCE_PACKAGE_ROOT
  ?? dirname(appRequire.resolve('@linxin666/dsh-pet/package.json')))
const packageRoot = name => dirname(testRequire.resolve(`${name}/package.json`))

export default {
  root,
  test: { include: ['apps/dsh-desktop/test/published-pet-clearance.test.tsx', 'apps/dsh-desktop/test/published-pet-display-sync.test.ts'], environment: 'jsdom', pool: 'threads', maxWorkers: 1 },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'published-pet-under-test': join(publishedRoot, 'src/client'),
      'published-pet-host-under-test': join(publishedRoot, 'src'),
      react: packageRoot('react'),
      'react-dom': packageRoot('react-dom'),
      '@testing-library/react': testRequire.resolve('@testing-library/react'),
      '@testing-library/dom': testRequire.resolve('@testing-library/dom'),
      vitest: join(packageRoot('vitest'), 'dist/index.js'),
    },
  },
  server: { fs: { allow: [root, publishedRoot] } },
}
