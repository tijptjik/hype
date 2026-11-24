import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deployWorker,
  shouldTreatDeployErrorAsSuccess,
} from '../../scripts/cloud/deploy-worker'

const mocks = vi.hoisted(() => ({
  preserveRoutes: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}))
vi.mock('../../scripts/cloud/hub-domain-deploy', () => ({
  preserveHubDomainRoutes: mocks.preserveRoutes,
}))
vi.mock('node:fs/promises', () => ({
  writeFile: mocks.writeFile,
  unlink: mocks.unlink,
}))

/**
 * Supplies only local configuration and an injected process executor for deployment tests.
 * @param spawn Mock process executor; never starts a real deployment.
 * @param target Environment of the simulated build.
 * @returns Nothing.
 */
function mockRuntime(spawn: ReturnType<typeof vi.fn>, target = 'preview'): void {
  vi.stubGlobal('Bun', {
    spawn,
    file: () => ({
      json: async () => ({
        name: target === 'preview' ? 'hype-preview' : 'hype-prod',
        main: 'index.js',
        assets: { directory: '../client', binding: 'ASSETS' },
        vars: { ENVIRONMENT: target },
        d1_databases: [
          {
            binding: 'DB',
            database_name: target === 'preview' ? 'hype-db-preview' : 'hype-db-prod',
          },
        ],
        routes: [],
      }),
    }),
  })
}

describe('shouldTreatDeployErrorAsSuccess', () => {
  it('rejects the old breadline.hk DNS collision after upload', () => {
    const output = `
Uploaded hype-prod (20.60 sec)

✘ [ERROR] A request to the Cloudflare API (/accounts/***/workers/scripts/hype-prod/domains/records) failed.

  Hostname 'breadline.hk' already has externally managed DNS records (A, CNAME, etc). Either delete them, try a different hostname, or use the option 'override_existing_dns_record' to override. [code: 100117]
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'production')).toBe(false)
  })

  it('rejects the same DNS collision before the worker upload completes', () => {
    const output = `
✘ [ERROR] A request to the Cloudflare API (/accounts/***/workers/scripts/hype-prod/domains/records) failed.

  Hostname 'breadline.hk' already has externally managed DNS records (A, CNAME, etc). Either delete them, try a different hostname, or use the option 'override_existing_dns_record' to override. [code: 100117]
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'production')).toBe(false)
  })

  it('rejects unrelated domain failures', () => {
    const output = `
Uploaded hype-prod (20.60 sec)

✘ [ERROR] A request to the Cloudflare API (/accounts/***/workers/scripts/hype-prod/domains/records) failed.

  Hostname 'hype.hk' already has externally managed DNS records (A, CNAME, etc). Either delete them, try a different hostname, or use the option 'override_existing_dns_record' to override. [code: 100117]
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'production')).toBe(false)
  })

  it('rejects generic production domain trigger failures after upload', () => {
    const output = `
✘ [ERROR] Some triggers failed to deploy for hype-prod:
    - A request to the Cloudflare API (/accounts/***/workers/scripts/hype-prod/domains/records) failed.

Uploaded hype-prod (11.93 sec)
Deployed hype-prod triggers (1.96 sec)
  Producer for hype-map-render-jobs-prod
  Producer for hype-asset-render-jobs-prod
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'production')).toBe(false)
  })

  it('rejects generic preview domain trigger failures', () => {
    const output = `
✘ [ERROR] Some triggers failed to deploy for hype-preview:
    - A request to the Cloudflare API (/accounts/***/workers/scripts/hype-preview/domains/records) failed.

Uploaded hype-preview (11.93 sec)
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'preview')).toBe(false)
  })
})

describe('database worker deployment', () => {
  beforeEach(() => {
    mocks.preserveRoutes
      .mockReset()
      .mockResolvedValue([{ pattern: 'retained.example.test', custom_domain: true }])
    mocks.writeFile.mockReset().mockResolvedValue(undefined)
    mocks.unlink.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stops before deploying the app when the division worker fails', async () => {
    const spawn = vi.fn().mockReturnValue({ exited: Promise.resolve(1) })
    mockRuntime(spawn, 'production')
    expect(await deployWorker('production')).toBe(1)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0][0]).toEqual([
      'bun',
      'wrangler',
      'deploy',
      '--config',
      'workers/division-refresh/wrangler.jsonc',
      '--env',
      'production',
    ])
  })

  it('deploys both matching database workers before the preview app', async () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ exited: Promise.resolve(0) })
      .mockReturnValueOnce({ exited: Promise.resolve(0) })
      .mockReturnValueOnce({
        exited: Promise.resolve(0),
        stdout: new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
      })
    mockRuntime(spawn)
    expect(await deployWorker('preview')).toBe(0)
    expect(spawn.mock.calls.map(call => call[0])).toEqual([
      [
        'bun',
        'wrangler',
        'deploy',
        '--config',
        'workers/division-refresh/wrangler.jsonc',
        '--env',
        'preview',
      ],
      [
        'bun',
        'wrangler',
        'deploy',
        '--config',
        'workers/location-refresh/wrangler.jsonc',
        '--env',
        'preview',
      ],
      [
        'bun',
        'wrangler',
        'deploy',
        '--config',
        expect.stringMatching(
          /^\.svelte-kit\/cloudflare\/worker\/\.hub-deploy-.*\.json$/,
        ),
        '--name',
        'hype-preview',
      ],
    ])
    expect(JSON.parse(mocks.writeFile.mock.calls[0][1]).routes).toEqual([
      { pattern: 'retained.example.test', custom_domain: true },
    ])
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(
      mocks.writeFile.mock.calls[0][0],
    )
  })

  it('rejects a preview build selected for production before any Worker is deployed', async () => {
    const spawn = vi.fn()
    mockRuntime(spawn, 'preview')
    await expect(deployWorker('production')).rejects.toThrow('deployment target')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('does not start deployment when domain inventory cannot be preserved', async () => {
    const spawn = vi.fn()
    mockRuntime(spawn)
    mocks.preserveRoutes.mockRejectedValue(new Error('Inventory unavailable'))
    await expect(deployWorker('preview')).rejects.toThrow('Inventory unavailable')
    expect(spawn).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})
