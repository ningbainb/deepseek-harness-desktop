import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u
const DESKTOP_TAG_PREFIX = 'refs/tags/desktop-v'

export function classifyDesktopReleaseMetadata({ eventName, ref, version } = {}) {
  if (typeof version !== 'string' || !STABLE_VERSION.test(version)) {
    throw new Error('Desktop package version must be an exact stable version')
  }
  if (eventName !== 'push' || typeof ref !== 'string' || !ref.startsWith(DESKTOP_TAG_PREFIX)) {
    return Object.freeze({ version, publish: false })
  }
  const tagVersion = ref.slice(DESKTOP_TAG_PREFIX.length)
  if (!STABLE_VERSION.test(tagVersion)) throw new Error('Desktop push tag must contain an exact stable version')
  if (tagVersion !== version) throw new Error('Desktop push tag version must match the package version')
  return Object.freeze({ version, publish: true })
}

async function main() {
  const { version } = JSON.parse(await readFile(new URL('../apps/dsh-desktop/package.json', import.meta.url), 'utf8'))
  const metadata = classifyDesktopReleaseMetadata({ eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, version })
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required for Desktop release metadata')
  await appendFile(process.env.GITHUB_OUTPUT, `version=${metadata.version}\npublish=${metadata.publish}\n`, 'utf8')
  console.log(JSON.stringify(metadata))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
