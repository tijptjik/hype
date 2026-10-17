// NODE
import { spawn } from 'node:child_process'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// LOCAL DEVELOPMENT
import { getDevPersona } from './config'
import { seedDevPersonas } from './seed'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

const args = process.argv.slice(2)
if (args[0] && !args[0].startsWith('-') && args[0] !== 'admin' && args[0] !== 'user') {
  throw new Error('Usage: bun run dev:agent [admin|user] [Vite options]')
}
const persona = args[0] === 'user' || args[0] === 'admin' ? args.shift()! : 'admin'
const env: NodeJS.ProcessEnv = {
  ...process.env,
  HYPE_DEV_PERSONA: persona,
  HYPE_LOCAL_R2: '1',
}
getDevPersona(env)
// Open the same persisted binding as the adapter, with every remote binding disabled.
const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
  ...(env.HYPE_DEV_STATE ? { persist: { path: env.HYPE_DEV_STATE } } : {}),
})
try {
  await seedDevPersonas(proxy.env.DB)
} finally {
  await proxy.dispose()
}
console.info(`Local development persona: ${persona}. Both reserved accounts are ready.`)
const child = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', ...args], {
  env,
  stdio: 'inherit',
  detached: true,
})
/**
 * Stops the entire Vite process group when the launcher receives a terminal signal.
 * @param signal - Signal received by the launcher.
 * @returns Nothing after forwarding the signal to development processes.
 */
function stop(signal: NodeJS.Signals): void {
  if (child.pid) process.kill(-child.pid, signal)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
child.on('error', error => {
  console.error(error)
  process.exit(1)
})
child.on('exit', code => process.exit(code ?? 1))
