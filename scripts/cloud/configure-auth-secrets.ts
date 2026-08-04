import { randomBytes } from 'node:crypto'
import { exit, stderr, stdin, stdout } from 'node:process'

type DeploymentTarget = 'preview' | 'production'
type AppSecretName =
  | 'AUTH_SECRET'
  | 'AUTH_GOOGLE_ID'
  | 'AUTH_GOOGLE_SECRET'
  | 'ANONYMOUS_CLEANUP_TOKEN'
type PromptedSecretName = Exclude<AppSecretName, 'ANONYMOUS_CLEANUP_TOKEN'>

const APP_SECRET_NAMES = [
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET'
] as const
const SCHEDULER_WRANGLER_CONFIG = 'workers/maintenance-scheduler/wrangler.toml'

/**
 * Converts the optional command-line environment argument into deployment targets.
 *
 * @param args Arguments after the script name.
 * @returns The environments whose secrets should be configured.
 * @remarks Omitting the environment configures preview and production.
 */
export const parseDeploymentTargets = (args: string[]): DeploymentTarget[] => {
  if (args.length === 0) return ['preview', 'production']

  if (args.length === 1 && (args[0] === 'preview' || args[0] === 'production')) {
    return [args[0]]
  }

  throw new Error('Usage: bun run auth:secrets:configure [preview|production]')
}

/**
 * Builds the Wrangler command that sends one secret value over standard input.
 *
 * @param secretName Cloudflare Worker secret binding name.
 * @param target Deployment environment.
 * @param configPath Optional non-root Wrangler configuration path.
 * @returns The command and arguments for Bun to execute.
 */
export const buildSecretPutCommand = (
  secretName: AppSecretName,
  target: DeploymentTarget,
  configPath?: string
): string[] => [
  'bun',
  'wrangler',
  'secret',
  'put',
  secretName,
  ...(configPath ? ['--config', configPath] : []),
  '--env',
  target
]

/**
 * Prompts for a secret without echoing the entered value in the terminal.
 *
 * @param secretName Secret binding being requested.
 * @param target Deployment environment receiving the value.
 * @returns The entered secret value.
 */
const promptForSecret = async (
  secretName: PromptedSecretName,
  target: DeploymentTarget
): Promise<string> => {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error('Secret configuration requires an interactive terminal.')
  }

  stderr.write(`Enter ${secretName} for ${target}: `)

  return new Promise((resolve, reject) => {
    let value = ''

    const restoreTerminal = (): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
    }

    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          restoreTerminal()
          stderr.write('\n')
          reject(new Error('Secret configuration cancelled.'))
          return
        }

        if (character === '\r' || character === '\n') {
          restoreTerminal()
          stderr.write('\n')
          if (!value) {
            reject(new Error(`${secretName} for ${target} cannot be empty.`))
          } else {
            resolve(value)
          }
          return
        }

        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1)
            stderr.write('\b \b')
          }
          continue
        }

        if (character >= ' ') {
          value += character
          stderr.write('*')
        }
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

/**
 * Uploads a secret to one Worker without placing its value in command arguments.
 *
 * @param secretName Cloudflare Worker secret binding name.
 * @param value Secret value to write to Wrangler's standard input.
 * @param target Deployment environment.
 * @param configPath Optional non-root Wrangler configuration path.
 * @returns Resolves after Cloudflare accepts the secret.
 */
const uploadSecret = async (
  secretName: AppSecretName,
  value: string,
  target: DeploymentTarget,
  configPath?: string
): Promise<void> => {
  const processHandle = Bun.spawn(
    buildSecretPutCommand(secretName, target, configPath),
    {
      stdin: new Blob([`${value}\n`]),
      stdout: 'inherit',
      stderr: 'inherit'
    }
  )
  const exitCode = await processHandle.exited

  if (exitCode !== 0) {
    throw new Error(`Uploading ${secretName} to ${target} failed (exit ${exitCode}).`)
  }
}

/**
 * Configures authentication secrets and the shared anonymous-cleanup credential.
 *
 * @param target Deployment environment to configure.
 * @returns Resolves when the app and maintenance scheduler share a cleanup token.
 */
const configureTarget = async (target: DeploymentTarget): Promise<void> => {
  const secrets = {} as Record<PromptedSecretName, string>

  // Prompt one at a time so each secret owns the terminal's raw input handler.
  for (const secretName of APP_SECRET_NAMES) {
    secrets[secretName] = await promptForSecret(secretName, target)
  }

  const cleanupToken = randomBytes(32).toString('base64url')

  // Upload application authentication values before synchronizing the cross-worker token.
  for (const secretName of APP_SECRET_NAMES) {
    await uploadSecret(secretName, secrets[secretName], target)
  }

  // Send the generated token over stdin to both Workers without ever printing or storing it.
  await uploadSecret(
    'ANONYMOUS_CLEANUP_TOKEN',
    cleanupToken,
    target,
    SCHEDULER_WRANGLER_CONFIG
  )
  await uploadSecret('ANONYMOUS_CLEANUP_TOKEN', cleanupToken, target)
}

/**
 * Configures the requested app and maintenance-scheduler environments.
 *
 * @param targets Deployment environments to configure.
 * @returns Resolves when all selected environments are complete.
 */
export const configureAuthSecrets = async (
  targets: DeploymentTarget[]
): Promise<void> => {
  for (const target of targets) {
    stdout.write(`Configuring authentication secrets for ${target}.\n`)
    await configureTarget(target)
  }
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  const args = Bun.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    stdout.write('Usage: bun run auth:secrets:configure [preview|production]\n')
    exit(0)
  }

  try {
    await configureAuthSecrets(parseDeploymentTargets(args))
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    exit(1)
  }
}
