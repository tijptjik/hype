import { afterEach, describe, expect, it, vi } from 'vitest'
import { HUB_CODE_PATTERN, reservedHubNames } from '../lib/hub-domains'
import { ensureHubDomain, listHubDnsRecords } from '../lib/server/hub-domains'
import { preserveHubDomainRoutes } from '../../scripts/cloud/hub-domain-deploy'

const env = {
  ENVIRONMENT: 'production',
  CLOUDFLARE_ACCOUNT_ID: 'account',
  HUB_DOMAINS_API_TOKEN: 'test-token',
  HUB_DOMAINS_ZONE_ID: 'zone',
}
const response = (result: unknown, total_pages = 1): Response =>
  Response.json({ success: true, result, result_info: { total_pages } })
afterEach(() => vi.unstubAllGlobals())

describe('hub namespace protection', () => {
  it('reserves nested DNS namespaces case-insensitively without treating wildcard as a code', () => {
    expect(
      reservedHubNames(['TXT.API.HYPE.HK.', '*.hype.hk', 'outside.example', 'hype.hk']),
    ).toEqual(['admin', 'api', 'core', 'mail', 'preview', 'www'])
  })
  it('only accepts valid lowercase DNS labels', () => {
    for (const code of ['ab', 'my-hub', 'a1'])
      expect(HUB_CODE_PATTERN.test(code)).toBe(true)
    for (const code of [
      'AHub',
      'my_hub',
      '$hub',
      '-hub',
      'hub-',
      'a',
      'a'.repeat(25),
      'a.b',
    ])
      expect(HUB_CODE_PATTERN.test(code)).toBe(false)
  })
  it('reads every DNS page', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([{ name: 'one.hype.hk', type: 'A' }], 2))
      .mockResolvedValueOnce(response([{ name: 'two.hype.hk', type: 'TXT' }], 2))
    vi.stubGlobal('fetch', fetcher)
    expect(await listHubDnsRecords(env)).toHaveLength(2)
    expect(fetcher.mock.calls[1][0]).toContain('page=2')
  })
})

describe('hub registration', () => {
  it('does not contact Cloudflare locally', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await ensureHubDomain({ ENVIRONMENT: 'local' }, 'new-hub')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('fails closed without runtime credentials', async () => {
    await expect(
      ensureHubDomain({ ENVIRONMENT: 'production' }, 'new-hub'),
    ).rejects.toThrow('not configured')
  })
  it('blocks a newly claimed reserved name while permitting unchanged core', async () => {
    await expect(ensureHubDomain(env, 'preview')).rejects.toThrow('reserved')
    await expect(ensureHubDomain(env, 'core', 'core')).resolves.toBeUndefined()
  })
  it('never takes over another Worker', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response([{ hostname: 'new-hub.hype.hk', service: 'other' }]))
    vi.stubGlobal('fetch', fetcher)
    await expect(ensureHubDomain(env, 'new-hub')).rejects.toThrow('another Worker')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('never overwrites existing DNS or nested namespaces', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response([{ name: '_verify.new-hub.hype.hk', type: 'TXT' }]),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(ensureHubDomain(env, 'new-hub')).rejects.toThrow('existing DNS')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('is idempotent for domains already on the correct Worker', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response([
        {
          hostname: 'new-hub.hype.hk',
          service: 'hype-prod',
          environment: 'production',
          zone_id: 'zone',
        },
      ]),
    )
    vi.stubGlobal('fetch', fetcher)
    await ensureHubDomain(env, 'new-hub')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('registers preview hostnames only on the preview Worker', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({}))
    vi.stubGlobal('fetch', fetcher)
    await ensureHubDomain({ ...env, ENVIRONMENT: 'preview' }, 'new-hub')
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      hostname: 'new-hub.preview.hype.hk',
      service: 'hype-preview',
      zone_id: 'zone',
    })
  })
  it('does not report successful registration when Cloudflare fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    await expect(ensureHubDomain(env, 'new-hub')).rejects.toThrow('403')
  })
  it('preserves live deployment domains and does not import another Worker domains', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response([
          {
            hostname: 'new-hub.hype.hk',
            service: 'hype-prod',
            environment: 'production',
          },
          { hostname: 'other.hype.hk', service: 'other', environment: 'production' },
        ]),
      ),
    )
    expect(
      await preserveHubDomainRoutes(env, 'hype-prod', [
        { pattern: 'hype.hk', custom_domain: true },
      ]),
    ).toEqual([
      { pattern: 'hype.hk', custom_domain: true },
      { pattern: 'new-hub.hype.hk', custom_domain: true },
    ])
  })
})
