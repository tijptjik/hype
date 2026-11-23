// NODE
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
// DOMAIN
import {
  searchSaanSeoiPlacesPage,
  readSaanSeoiPlacePage,
} from '../../src/lib/locations/sourceClient'
import { discoverLocationPublication } from '../../src/lib/locations/publication'
import { hydrateSaanSeoiPlaceAddress } from '../../src/lib/locations/sourceAddress'
import { mtrShopCode } from './mtr-shop-codes'

/** Discover MTR address candidates and retain full pinned records for later human review.
 * @returns A resumable local evidence file; never changes identities or upstream data.
 * @remarks Exact shop codes create candidates only. Different tenant names may be historical occupancy.
 */
async function main(): Promise<void> {
  const output = '.local/places/mtr-network/upstream-candidates.json'
  const client = {
    baseUrl: 'http://api.atlas.localhost',
    apiKey: 'local-development',
    fetch,
  }
  const publication = await discoverLocationPublication(client)
  const shops = readFileSync('.research/mtr-shops/2026-11-14/records.ndjson', 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line)) as Array<{
    sourceRecordId: string
    properties: { shopNumber: string }
  }>
  const prior = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null
  const result =
    prior?.matcherVersion === 4 &&
    JSON.stringify(prior.publication.pin) === JSON.stringify(publication.pin)
      ? prior
      : {
          matcherVersion: 4,
          publication,
          candidates: [],
          searched: [],
          previews: [],
          complete: false,
        }
  const catalogue = JSON.parse(
    readFileSync('src/lib/routing/mtr-catalog.json', 'utf8'),
  ) as { stations: Array<{ id: string; name: string; nameZh: string }> }
  const seen = new Set<string>(result.searched)
  const searches = ['MTR', '港鐵', '地鐵']
  for (const q of searches) {
    let cursor: string | undefined
    do {
      const page = await searchSaanSeoiPlacesPage(client, {
        q,
        limit: 20,
        cursor,
        filters: { operatingStatus: 'any' },
      })
      for (const candidate of page.candidates) {
        if (seen.has(candidate.placeId)) continue
        const preview = candidate.preview as
          | { i18n?: Record<string, { freeformAddress?: string }> }
          | undefined
        const addresses = Object.values(preview?.i18n ?? {})
          .map(v => v.freeformAddress ?? '')
          .join(' ')
        result.previews.push(candidate)
        const matches = /MTR|港鐵|地鐵/i.test(
          `${addresses} ${candidate.nameText ?? ''}`,
        )
          ? shops.filter(shop => {
              const code = mtrShopCode(shop.properties.shopNumber)
              if (code.length <= 3) return false
              const escaped = [...code]
                .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('\\s*')
              if (
                new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, 'i').test(addresses)
              )
                return true
              const station = catalogue.stations.find(s => s.id === code.slice(0, 3))
              if (
                !station ||
                ![station.name, station.nameZh].some(name =>
                  addresses.toLowerCase().includes(name.toLowerCase()),
                )
              )
                return false
              const unit = [...code.slice(3)]
                .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('\\s*')
              return new RegExp(
                `\\b(?:shop|kiosk)(?:\\s+no\\.?)?\\s*${unit}(?![A-Z0-9])`,
                'i',
              ).test(addresses)
            })
          : []
        if (matches.length) {
          const source = await readSaanSeoiPlacePage(client, publication.pin, 0, {
            id: candidate.placeId,
          })
          if (source.places.length !== 1)
            throw new Error(`Source disappeared: ${candidate.placeId}`)
          const projection = await hydrateSaanSeoiPlaceAddress(client, source.places[0])
          result.candidates.push({
            sourceRecordIds: matches.map(r => r.sourceRecordId),
            addresses,
            projection,
          })
        }
        seen.add(candidate.placeId)
        result.searched = [...seen]
        writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
      }
      console.log(
        JSON.stringify({
          q,
          searched: seen.size,
          candidates: result.candidates.length,
          hasMore: Boolean(page.nextCursor),
        }),
      )
      cursor = page.nextCursor ?? undefined
    } while (cursor)
  }
  result.complete = true
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
}
await main()
