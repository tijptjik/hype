import { exit, stderr, stdout } from 'node:process'

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

/**
 * Runs a Wrangler worker deployment for the requested environment.
 *
 * @param target Deployment target being executed.
 * @returns Process exit code.
 */
const deployWorker = async (target: DeployTarget): Promise<number> => {
  const { name, env } = DEPLOY_TARGETS[target]
  const command = ['bun', 'wrangler', 'deploy', '--name', name, '--env', env]

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
