// NODE
import { writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { exit, stderr, stdout } from 'node:process'
// DOMAIN
import { preserveHubDomainRoutes } from './hub-domain-deploy'

type DeployTarget = 'preview' | 'production'

const DEPLOY_TARGETS: Record<
  DeployTarget,
  { name: string; env: string; toleratedHostnames: string[] }
> = {
  preview: {
    name: 'hype-preview',
    env: 'preview',
    toleratedHostnames: []
  },
  production: {
    name: 'hype-prod',
    env: 'production',
    toleratedHostnames: []
  }
}

/**
 * Determines whether a Wrangler deploy failure is safe to tolerate because the
 * worker upload completed and only custom-domain DNS attachment failed.
 *
 * @param output Combined Wrangler stdout and stderr output.
 * @param target Deployment target being executed.
 * @returns True when the failure matches the known externally managed DNS case.
 */
export const shouldTreatDeployErrorAsSuccess = (
  output: string,
  target: DeployTarget
): boolean => {
  const { name, toleratedHostnames } = DEPLOY_TARGETS[target]

  if (!output.includes(`Uploaded ${name}`)) {
    return false
  }

  if (!output.includes('[code: 100117]')) {
    return false
  }

  if (!output.includes('already has externally managed DNS records')) {
    return false
  }

  return toleratedHostnames.some(hostname =>
    output.includes(`Hostname '${hostname}'`)
  )
}

/** Deploy both database consumers before the application can enqueue new work.
 * @param target Explicit deployment environment.
 * @param run Command executor, injectable for fail-closed orchestration tests.
 * @returns First failing exit code, or zero when both consumers deployed.
 * @remarks Schema/data migrations must already have passed the release gate. This does
 * not apply migrations or claim that deploying a worker drains its queue.
 */
export async function deployDatabaseConsumers(
  target: DeployTarget,
  run: (command: string[]) => Promise<number> = async command => {
    const child = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' })
    return child.exited
  },
): Promise<number> {
  for (const consumer of ['division-refresh', 'location-refresh']) {
    const status = await run([
      'bun', 'wrangler', 'deploy', '--config',
      `workers/${consumer}/wrangler.jsonc`, '--env', target,
    ])
    if (status !== 0) return status
  }
  return 0
}

/**
 * Runs a Wrangler worker deployment for the requested environment.
 *
 * @param target Deployment target being executed.
 * @returns Process exit code.
 */
export const deployWorker = async (target: DeployTarget): Promise<number> => {
  const { name, env } = DEPLOY_TARGETS[target]

  // Wrangler replaces domain registrations: preserve live assignments before any deployment.
  const config = Bun.TOML.parse(await Bun.file('wrangler.toml').text()) as {
    env: Record<string, { routes?: Array<string | { pattern: string; custom_domain?: boolean }> }>
  }
  config.env[env].routes = await preserveHubDomainRoutes({
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    HUB_DOMAINS_API_TOKEN: process.env.HUB_DOMAINS_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
  }, name, config.env[env].routes ?? [])
  // Keep the temporary config beside wrangler.toml so relative asset paths remain valid.
  const configPath = `.hub-deploy-${randomUUID()}.json`
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 })
  try {
    // Keep both database consumers compatible with the application release.
    const refreshExitCode = await deployDatabaseConsumers(target)
    if (refreshExitCode !== 0) return refreshExitCode

    const command = ['bun', 'wrangler', 'deploy', '--config', configPath, '--name', name, '--env', env]

    const process = Bun.spawn(command, {
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const [stdoutText, stderrText, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited
    ])

    stdout.write(stdoutText)
    stderr.write(stderrText)

    const output = [stdoutText, stderrText].filter(Boolean).join('\n')

    if (exitCode === 0) {
      return exitCode
    }

    // Allow deploy success when Wrangler only failed while re-attaching a known
    // future domain that still has external DNS in place.
    if (shouldTreatDeployErrorAsSuccess(output, target)) {
      console.warn(
        `Wrangler deployed ${name} but could not attach a tolerated custom domain. Continuing with success.`
      )
      return 0
    }

    return exitCode
  } finally {
    await unlink(configPath)
  }
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  const targetArg = Bun.argv[2]

  if (targetArg !== 'preview' && targetArg !== 'production') {
    console.error(
      'Usage: bun run scripts/cloud/deploy-worker.ts <preview|production>'
    )
    exit(1)
  }

  exit(await deployWorker(targetArg))
}
