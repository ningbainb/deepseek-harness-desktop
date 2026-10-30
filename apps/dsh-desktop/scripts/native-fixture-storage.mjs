import { appendFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'

const absolute = value => typeof value === 'string' && !/[\0\r\n]/u.test(value)
  && (/^[a-z]:[\\/]/iu.test(value) || /^\\\\[^\\]+\\[^\\]+[\\/]?/u.test(value))
const within = (root, value) => {
  const relative = win32.relative(root, value)
  return relative === '' || (!relative.startsWith('..\\') && relative !== '..' && !win32.isAbsolute(relative))
}

/** This policy controls fixture storage only; it never authorizes production Setup. */
export function nativeFixtureStoragePolicy({ env = process.env, temporaryDirectory = tmpdir(), outputDirectory = temporaryDirectory } = {}) {
  if (!absolute(temporaryDirectory) || !absolute(outputDirectory)) throw new Error('Native fixture paths must be fully qualified absolute paths')
  const hosted = env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Windows'
    && env.RUNNER_ENVIRONMENT === 'github-hosted' && /^GitHub Actions(?:\s|$)/u.test(env.RUNNER_NAME ?? '')
    && absolute(env.RUNNER_TEMP) && absolute(env.GITHUB_WORKSPACE)
  const root = hosted ? win32.join(env.RUNNER_TEMP, 'dsh-native-fixtures') : 'E:\\'
  const temporary = win32.normalize(temporaryDirectory), output = win32.normalize(outputDirectory)
  if (!within(root, temporary) || !within(root, output)) {
    throw new Error(hosted ? 'Native fixtures require the dedicated RUNNER_TEMP child' : 'Local native fixtures require E: storage')
  }
  return { mode: hosted ? 'github-hosted-windows' : 'local-e-drive', root, temporaryDirectory: temporary, outputDirectory: output,
    ...(hosted ? { runnerRoot: win32.normalize(env.RUNNER_TEMP) } : {}) }
}

async function resolvedDestination(path) {
  try {
    await lstat(path)
    return await realpath(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    // A dangling link is not an absent output directory.
    const entry = await lstat(path).catch(failure => { if (failure.code === 'ENOENT') return undefined; throw failure })
    if (entry?.isSymbolicLink()) throw new Error('Native fixture destination contains a dangling link')
    const parent = win32.dirname(path)
    if (parent === path) throw error
    return win32.join(await resolvedDestination(parent), win32.basename(path))
  }
}

export async function assertNativeFixtureStorage(options = {}) {
  const policy = nativeFixtureStoragePolicy(options)
  const entry = await lstat(policy.root)
  if (entry.isSymbolicLink()) throw new Error('Native fixture root escapes its dedicated identity through a link')
  if (!entry.isDirectory()) throw new Error('Native fixture storage root must be a directory')
  const root = await realpath(policy.root)
  if (policy.runnerRoot && !within(await realpath(policy.runnerRoot), root)) throw new Error('Native fixture root escapes RUNNER_TEMP through a link')
  for (const path of [policy.temporaryDirectory, policy.outputDirectory]) {
    if (!within(root, await resolvedDestination(path))) throw new Error('Native fixture destination escapes its storage root through a link')
  }
  return policy
}

/** Export only QA paths to the current hosted Windows job's command file. */
export async function prepareNativeFixtureStorage({ env = process.env } = {}) {
  if (process.platform !== 'win32') throw new Error('Fixture preparation requires native hosted Windows')
  if (!absolute(env.RUNNER_TEMP) || !absolute(env.GITHUB_ENV)) throw new Error('Fixture preparation requires an absolute runner command file')
  const policy = nativeFixtureStoragePolicy({ env, temporaryDirectory: win32.join(env.RUNNER_TEMP, 'dsh-native-fixtures') })
  if (policy.mode !== 'github-hosted-windows') throw new Error('Fixture preparation requires complete hosted Windows context')
  const runner = await realpath(env.RUNNER_TEMP)
  const entry = await lstat(env.GITHUB_ENV).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if ((entry && (!entry.isFile() || entry.isSymbolicLink())) || !within(runner, await resolvedDestination(env.GITHUB_ENV))) {
    throw new Error('Runner command file must be a regular file within RUNNER_TEMP')
  }
  const rootEntry = await lstat(policy.root).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (rootEntry?.isSymbolicLink()) throw new Error('Dedicated fixture root must not be a link')
  await mkdir(policy.root, { recursive: true })
  await assertNativeFixtureStorage({ env, temporaryDirectory: policy.root })
  const previous = await readFile(env.GITHUB_ENV, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
  const separator = previous && !previous.endsWith('\n') ? '\n' : ''
  await appendFile(env.GITHUB_ENV, separator + ['TEMP', 'TMP', 'TMPDIR'].map(name => `${name}=${policy.root}`).join('\n') + '\n', 'utf8')
  return policy
}
