// BUN
import { SQL } from 'bun'

const REQUIRED_BREADLINE_ENV = [
  'BREADLINE_HOST',
  'BREADLINE_DB',
  'BREADLINE_USER',
  'BREADLINE_PORT',
  'BREADLINE_PASSWORD',
] as const

const TLS_MODES = [
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
] as const

type TlsMode = (typeof TLS_MODES)[number]

/** Connection settings loaded from `.dev.vars`. */
export interface BreadlineDatabaseConfig {
  hostname: string
  database: string
  username: string
  port: number
  password: string
  tls: TlsMode
}

/**
 * Load and validate the Breadline PostgreSQL connection settings.
 * @param env Environment variables, normally `process.env`.
 * @returns Validated connection settings without logging any secret values.
 */
export function loadBreadlineDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): BreadlineDatabaseConfig {
  const missing = REQUIRED_BREADLINE_ENV.filter(name => !env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing Breadline database settings in .dev.vars: ${missing.join(', ')}`,
    )
  }

  const hostname = readRequiredEnvironment(env, 'BREADLINE_HOST')
  const database = readRequiredEnvironment(env, 'BREADLINE_DB')
  const username = readRequiredEnvironment(env, 'BREADLINE_USER')
  const password = readRequiredEnvironment(env, 'BREADLINE_PASSWORD')
  const port = Number.parseInt(readRequiredEnvironment(env, 'BREADLINE_PORT'), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BREADLINE_PORT must be an integer between 1 and 65535')
  }

  const requestedTls = env.BREADLINE_TLS?.trim() || 'require'
  if (!TLS_MODES.includes(requestedTls as TlsMode)) {
    throw new Error(`BREADLINE_TLS must be one of: ${TLS_MODES.join(', ')}`)
  }

  return {
    hostname,
    database,
    username,
    port,
    password,
    tls: requestedTls as TlsMode,
  }
}

/**
 * Narrow a previously validated environment value to a string.
 * @param env Environment variable collection.
 * @param name Required Breadline variable name.
 * @returns Trimmed environment value.
 */
function readRequiredEnvironment(
  env: NodeJS.ProcessEnv,
  name: (typeof REQUIRED_BREADLINE_ENV)[number],
): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing Breadline database setting: ${name}`)
  return value
}

/**
 * Create a small read-only-oriented PostgreSQL connection pool.
 * @param config Validated Breadline database settings.
 * @returns A Bun SQL client. Call `close()` after use.
 */
export function createBreadlineSource(config: BreadlineDatabaseConfig): SQL {
  return new SQL({
    adapter: 'postgres',
    hostname: config.hostname,
    database: config.database,
    username: config.username,
    port: config.port,
    password: config.password,
    tls: config.tls,
    max: 2,
    connectionTimeout: 15,
    idleTimeout: 10,
    connection: {
      application_name: 'hype-breadline-mirror',
      statement_timeout: 120_000,
      lock_timeout: 10_000,
    },
  })
}

/**
 * Remove configured secret values from an error before displaying it.
 * @param error Unknown thrown value.
 * @param env Environment containing secrets to redact.
 * @returns Bounded, redacted error message.
 */
export function formatBreadlineError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let message = error instanceof Error ? error.message : String(error)
  for (const name of Object.keys(env).filter(name => name.startsWith('BREADLINE_'))) {
    const secret = env[name]
    if (secret) message = message.replaceAll(secret, '<redacted>')
  }
  return message.slice(0, 2_000)
}
