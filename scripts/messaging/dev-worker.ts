// NODE
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '../..')
const workers = {
  whatsapp: { port: 8791, environment: 'local', state: 'WHATSAPP_STATE_DIR' },
  'whatsapp-calls': { port: 8793, environment: 'local', state: null },
  'whatsapp-relay': {
    port: 8792,
    environment: 'local',
    state: 'WHATSAPP_RELAY_STATE_DIR',
  },
  telegram: { port: 8794, environment: '', state: 'TELEGRAM_STATE_DIR' },
  'telegram-calls': { port: 8795, environment: '', state: null },
  'messaging-notifications': { port: 8796, environment: '', state: null },
} as const

/** Resolve existing parents so a symlink cannot put account state inside the checkout.
 * @param path Absolute private path, including a directory not created yet.
 * @returns Canonical path used for the repository-boundary check.
 */
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path)
  return resolve(canonical(dirname(path)), relative(dirname(path), path))
}

/** Build a local-only launch plan without reading credentials or starting an account.
 * @param name Workspace worker name.
 * @param env Explicit process environment; state paths may point at existing sessions.
 * @returns Argument vector and working directory for Wrangler.
 * @remarks Deployed names and external session directories survive the repository move.
 */
export function workerPlan(name: string, env: Record<string, string | undefined>) {
  if (!(name in workers)) throw new Error(`Unknown messaging worker: ${name}`)
  const config = workers[name as keyof typeof workers]
  const args = [
    'x',
    '--no',
    'wrangler',
    'dev',
    '--local',
    '--env',
    config.environment,
    '--ip',
    '127.0.0.1',
    '--port',
    String(config.port),
    '--inspector-port',
    String(config.port + 1000),
  ]
  if (config.state) {
    const state =
      env[config.state] ??
      (env.HYPE_MESSAGING_STATE_DIR
        ? resolve(env.HYPE_MESSAGING_STATE_DIR, name)
        : undefined)
    if (!state || !isAbsolute(state))
      throw new Error(
        `Set ${config.state} to the existing absolute private session directory, or HYPE_MESSAGING_STATE_DIR for new accounts.`,
      )
    const resolved = canonical(state)
    if (resolved === repository || resolved.startsWith(`${repository}/`))
      throw new Error('Messaging session state must stay outside the HYPE checkout')
    args.push('--persist-to', state)
  } else if (name === 'messaging-notifications') {
    args.push('--persist-to', resolve(repository, '.wrangler/state'))
  }
  if (env.HYPE_MESSAGING_ENV_FILE) {
    const file = env.HYPE_MESSAGING_ENV_FILE
    if (!isAbsolute(file) || !existsSync(file))
      throw new Error(
        'HYPE_MESSAGING_ENV_FILE must be an existing absolute private file',
      )
    const resolved = canonical(file)
    if (resolved.startsWith(`${repository}/`))
      throw new Error('Messaging credentials must stay outside the HYPE checkout')
    args.push('--env-file', file)
  }
  return { cwd: resolve(repository, 'workers', name), args }
}

if (import.meta.main) {
  const plan = workerPlan(process.argv[2] ?? '', process.env)
  if (process.argv.includes('--dry-run')) console.log(JSON.stringify(plan))
  else {
    const child = Bun.spawn(['bun', ...plan.args], {
      cwd: plan.cwd,
      env: process.env,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const stop = (signal: 'SIGINT' | 'SIGTERM') => {
      child.kill(signal)
    }
    process.on('SIGINT', () => stop('SIGINT'))
    process.on('SIGTERM', () => stop('SIGTERM'))
    process.exit(await child.exited)
  }
}
