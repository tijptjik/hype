// NODE
import { writeFile } from 'node:fs/promises'
// DOMAIN
import { reservedHubNames } from '../../src/lib/hub-domains'
import {
  cloudflareDomainsRequest,
  listHubDnsRecords,
  listWorkerDomains,
} from '../../src/lib/server/hub-domains'

/**
 * Refreshes the public-safe reserved-name snapshot from every live DNS record.
 * @returns Nothing after an atomic successful inventory fetch and file write.
 * @remarks Use an operator token with Zone Read, DNS Read and Workers Scripts Read.
 * No record contents or credentials are written to the repository.
 */
async function main(): Promise<void> {
  const env = {
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    HUB_DOMAINS_API_TOKEN:
      process.env.HUB_DOMAINS_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
    HUB_DOMAINS_ZONE_ID: process.env.HUB_DOMAINS_ZONE_ID,
  }
  if (!env.HUB_DOMAINS_ZONE_ID) {
    const zones = await cloudflareDomainsRequest<Array<{ id: string; name: string }>>(
      env,
      'zones?name=hype.hk',
    )
    if (zones.result.length !== 1 || zones.result[0].name !== 'hype.hk')
      throw new Error('Expected exactly one hype.hk zone')
    env.HUB_DOMAINS_ZONE_ID = zones.result[0].id
  }
  const records = await listHubDnsRecords(env)
  const domains = await listWorkerDomains(env)
  const names = reservedHubNames([
    ...records.map(record => record.name),
    ...domains.map(domain => domain.hostname),
  ])
  await writeFile(
    new URL('../../src/lib/data/hub-domain-reservations.json', import.meta.url),
    `${JSON.stringify(
      {
        source: 'Cloudflare hype.hk DNS owner names and Worker custom domains',
        retrievedAt: new Date().toISOString(),
        names,
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    `Reserved ${names.length} hub names from ${records.length} DNS records and ${domains.length} Worker domains.`,
  )
}

if (import.meta.main) await main()
