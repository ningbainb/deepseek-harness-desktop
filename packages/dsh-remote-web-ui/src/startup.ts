/**
 * Remote-web-ui's explicit LAN startup provider.
 *
 * The official web-app provider/runtime intentionally rejects the
 * all-interface host for safety. This app-owned provider can parse and publish
 * an explicit request through the public seam, but it does not bypass the
 * official guard. It is installed only by this bundle's Cordis patch, so the
 * default remains the official loopback posture when the remote bundle is
 * absent.
 */

import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name shared with the official web provider. */
export const name = 'web-startup'

/** Service required before the invocation can be parsed. */
export const inject = ['cmdlineArgs']

/** Service consumed by the official webserver/web-runtime rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** The only host literals accepted by the official host-webserver schema. */
export const WEB_HOSTS = Object.freeze(['127.0.0.1', '0.0.0.0'] as const)

export type WebHost = (typeof WEB_HOSTS)[number]

/** Parsed values consumed by the web bundle rows. */
export interface WebStartupValues {
  openBrowser: boolean
  host?: WebHost
  port?: number
  trustedHosts: string[]
}

/** Validate a host before the value reaches the official schema. */
export function validateWebHost(value: unknown): WebHost | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !WEB_HOSTS.includes(value as WebHost)) {
    throw new TypeError('web host must be 127.0.0.1 or 0.0.0.0')
  }
  return value as WebHost
}

/** Build a fresh command so one process can parse one immutable invocation. */
export function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
  dsh --profile web --host 0.0.0.0           request LAN exposure when the official runtime permits it
`)
}

/**
 * Parse and publish the app-owned web invocation.
 *
 * The all-interface host is recorded only because the user explicitly
 * supplied it. The official runtime may still reject it for safety; this
 * provider does not bypass that guard. The remote bundle's default
 * mobile-only mode and pairing gate remain the access boundary for any
 * non-loopback requests that the runtime does accept.
 */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts() as {
      open: boolean
      host?: unknown
      port?: unknown
      trustedHost?: string[]
    }
    let host: WebHost | undefined
    try {
      host = validateWebHost(options.host)
    } catch (error) {
      program.error(`error: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (options.port !== undefined && !/^\d+$/u.test(String(options.port))) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...(host === undefined ? {} : { host }),
      ...(options.port === undefined ? {} : { port: Number(options.port) }),
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
