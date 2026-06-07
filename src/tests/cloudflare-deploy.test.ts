import { describe, expect, it } from 'vitest'

import { shouldTreatDeployErrorAsSuccess } from '../../scripts/cloud/deploy-worker'

describe('shouldTreatDeployErrorAsSuccess', () => {
  it('accepts the known production breadline.hk DNS collision after upload', () => {
    const output = `
Uploaded hype-prod (20.60 sec)

✘ [ERROR] A request to the Cloudflare API (/accounts/***/workers/scripts/hype-prod/domains/records) failed.

  Hostname 'breadline.hk' already has externally managed DNS records (A, CNAME, etc). Either delete them, try a different hostname, or use the option 'override_existing_dns_record' to override. [code: 100117]
`

    expect(shouldTreatDeployErrorAsSuccess(output, 'production')).toBe(true)
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
})
