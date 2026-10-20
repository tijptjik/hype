// TABLE OF CONTENTS
// - Cloudflare request and paginated inventory
// - Authorized hub hostname provisioning

// DOMAIN
import { HUB_CODE_PATTERN, isReservedHubCode } from '../hub-domains'

export interface HubDomainEnvironment {
  ENVIRONMENT?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  HUB_DOMAINS_API_TOKEN?: string
  HUB_DOMAINS_ZONE_ID?: string
}
export interface WorkerDomain {
  hostname: string
  service: string
  environment: string
  zone_id: string
}
export interface DnsRecord {
  name: string
  type: string
}

/**
 * Calls the Cloudflare control plane without exposing credentials or response bodies.
 * @param env - Dedicated domain-management credentials.
 * @param path - Relative Cloudflare API path.
 * @param init - Optional mutation request.
 * @returns Validated API response envelope.
 */
export async function cloudflareDomainsRequest<T>(
  env: HubDomainEnvironment,
  path: string,
  init: RequestInit = {},
): Promise<{ result: T; result_info?: { total_pages: number } }> {
  if (!env.HUB_DOMAINS_API_TOKEN)
    throw new Error('Hub domain management is not configured')
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.HUB_DOMAINS_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(`Cloudflare domain request failed (${response.status})`)
  const body = (await response.json()) as {
    success: boolean
    result: T
    result_info?: { total_pages: number }
  }
  if (!body.success) throw new Error('Cloudflare domain request failed')
  return body
}

/**
 * Lists all DNS owner names for the configured zone.
 * @param env - Zone and read credentials.
 * @returns Every record across all pages.
 */
export async function listHubDnsRecords(
  env: HubDomainEnvironment,
): Promise<DnsRecord[]> {
  if (!env.HUB_DOMAINS_ZONE_ID) throw new Error('Hub DNS zone is not configured')
  const records: DnsRecord[] = []
  for (let page = 1; ; page++) {
    const response = await cloudflareDomainsRequest<DnsRecord[]>(
      env,
      `zones/${env.HUB_DOMAINS_ZONE_ID}/dns_records?per_page=100&page=${page}`,
    )
    records.push(...response.result.map(({ name, type }) => ({ name, type })))
    if (!response.result_info || page >= response.result_info.total_pages)
      return records
  }
}

/**
 * Lists account Worker domain assignments for collision checks and deployment preservation.
 * @param env - Account credentials.
 * @returns Current custom-domain registrations.
 */
export async function listWorkerDomains(
  env: HubDomainEnvironment,
): Promise<WorkerDomain[]> {
  if (!env.CLOUDFLARE_ACCOUNT_ID)
    throw new Error('Hub domain account is not configured')
  return (
    await cloudflareDomainsRequest<WorkerDomain[]>(
      env,
      `accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`,
    )
  ).result
}

/**
 * Provisions a hub's managed hostname before its authorized database write.
 * @param env - Request environment; local writes never change Cloudflare.
 * @param code - Validated hub code.
 * @param currentCode - Existing code, permitting unchanged reserved legacy hubs.
 * @returns Nothing once the hostname is registered to the correct Worker.
 * @remarks Never deletes or takes over records. A failed database write may leave an
 * unused domain pointing to Hype's unknown-hub 404; retrying is idempotent.
 */
export async function ensureHubDomain(
  env: HubDomainEnvironment,
  code: string,
  currentCode?: string,
): Promise<void> {
  if (!HUB_CODE_PATTERN.test(code)) throw new Error('Invalid hub subdomain')
  if (code !== currentCode && isReservedHubCode(code))
    throw new Error('Hub subdomain is reserved')
  if (code === 'core' && currentCode === 'core') return
  if (env.ENVIRONMENT === 'local') return
  if (env.ENVIRONMENT !== 'production' && env.ENVIRONMENT !== 'preview') {
    throw new Error('Unknown hub domain environment')
  }
  if (!env.HUB_DOMAINS_ZONE_ID) throw new Error('Hub DNS zone is not configured')
  const hostname = `${code}.${env.ENVIRONMENT === 'preview' ? 'preview.' : ''}hype.hk`
  const service = env.ENVIRONMENT === 'production' ? 'hype-prod' : 'hype-preview'
  const domains = await listWorkerDomains(env)
  const existing = domains.find(domain => domain.hostname.toLowerCase() === hostname)
  if (existing) {
    if (
      existing.service === service &&
      existing.environment === 'production' &&
      existing.zone_id === env.HUB_DOMAINS_ZONE_ID
    )
      return
    throw new Error('Hub hostname belongs to another Worker')
  }
  // Recheck live DNS so newly added infrastructure is protected between snapshots.
  const records = await listHubDnsRecords(env)
  if (
    records.some(record => {
      const name = record.name.toLowerCase().replace(/\.$/, '')
      return name === hostname || name.endsWith(`.${hostname}`)
    })
  )
    throw new Error('Hub hostname has existing DNS records')
  await cloudflareDomainsRequest(
    env,
    `accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`,
    {
      method: 'PUT',
      body: JSON.stringify({
        hostname,
        service,
        environment: 'production',
        zone_id: env.HUB_DOMAINS_ZONE_ID,
        zone_name: 'hype.hk',
      }),
    },
  )
}
