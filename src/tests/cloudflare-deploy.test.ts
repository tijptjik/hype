import { describe, expect, it } from 'vitest'

import { shouldTreatDeployErrorAsSuccess } from '../../scripts/cloud/deploy-worker'

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
