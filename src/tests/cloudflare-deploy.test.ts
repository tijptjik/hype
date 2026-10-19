import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  deployWorker,
  shouldTreatDeployErrorAsSuccess,
} from '../../scripts/cloud/deploy-worker'

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

describe('division worker deployment', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stops before deploying the app when the division worker fails', async () => {
    const spawn = vi.fn().mockReturnValue({ exited: Promise.resolve(1) })
    vi.stubGlobal('Bun', { spawn })
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

  it('deploys the matching division worker before the preview app', async () => {
    const spawn = vi
      .fn()
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
    vi.stubGlobal('Bun', { spawn })
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
      ['bun', 'wrangler', 'deploy', '--name', 'hype-preview', '--env', 'preview'],
    ])
  })
})
