// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientBundle, mobileBundle } from '../tsdown.client.ts'

const originalWorkingDirectory = process.cwd()
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

beforeAll(() => {
  process.chdir(resolve(repositoryRoot, 'packages', 'dsh-remote-web-ui'))
})

afterAll(() => {
  process.chdir(originalWorkingDirectory)
})

function configNamed(configs: ReturnType<ReturnType<typeof clientBundle>>, name: string) {
  const config = configs.find(candidate => candidate.name === name)
  expect(config, `missing build config ${name}`).toBeDefined()
  return config
}

describe('tsdown bundle dependency policy', () => {
  it('defaults host and browser plugin faces to no bundled packages', () => {
    const build = clientBundle('@test/default-deny', ['src/index.ts'])
    const configs = build({ env: {} })

    expect(configNamed(configs, '@test/default-deny')?.deps?.onlyBundle).toEqual([])
    expect(configNamed(configs, '@test/default-deny/client')?.deps?.onlyBundle).toEqual([])
  })

  it('keeps host and browser allowlists independent', () => {
    const build = clientBundle('@test/explicit', ['src/index.ts'], {
      libOnlyBundle: ['schemastery'],
      clientOnlyBundle: ['clsx'],
    })
    const configs = build({ env: {} })

    expect(configNamed(configs, '@test/explicit')?.deps?.onlyBundle).toEqual(['schemastery'])
    expect(configNamed(configs, '@test/explicit/client')?.deps?.onlyBundle).toEqual(['clsx'])
  })

  it('locks the standalone mobile page to its reviewed dependency set', () => {
    expect(mobileBundle('@test/mobile', 'src/mobile/index.tsx').deps?.onlyBundle).toEqual([
      'react',
      'scheduler',
      'react-dom',
      'zod',
    ])
  })
})
