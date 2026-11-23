// NODE
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
// SPATIAL
import { polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from 'h3-js'
// DOMAIN
import { openLocalPreviews } from './mtr-local-previews'
import { searchSaanSeoiPlacesPage } from '../../src/lib/locations/sourceClient'
import { discoverLocationPublication } from '../../src/lib/locations/publication'
import {
  compareStationShops,
  type StationShop,
  type StationCandidate,
} from './mtr-station-comparison'

/** Discover upstream establishments station by station and write a resumable comparison report.
 * @returns Completion after every requested station has a receipt.
 * @remarks Read-only upstream access. Failed searches remain explicit; no identities are accepted.
 */
async function main(): Promise<void> {
  const directory = '.local/places/mtr-network/station-discovery'
  mkdirSync(directory, { recursive: true })
  const client = {
    baseUrl: process.env.SAANSEOI_API_URL ?? 'http://api.atlas.localhost',
    apiKey: process.env.SAANSEOI_API_KEY ?? 'local-development',
    fetch: ((input, init) => {
      const headers = new Headers(init?.headers)
      if (process.env.SAANSEOI_API_HOST)
        headers.set('host', process.env.SAANSEOI_API_HOST)
      return fetch(input, { ...init, headers })
    }) as typeof fetch,
  }
  const publication = await discoverLocationPublication(client)
  const shops: StationShop[] = readFileSync(
    '.research/mtr-shops/2026-11-14/records.ndjson',
    'utf8',
  )
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  const sourceHash = createHash('sha256').update(JSON.stringify(shops)).digest('hex')
  const catalogue = JSON.parse(
    readFileSync('src/lib/routing/mtr-catalog.json', 'utf8'),
  ) as {
    stations: Array<{
      id: string
      name: string
      nameZh: string
      coordinates: [number, number]
    }>
  }
  // The shop directory also covers West Kowloon, outside the 98-map station archive.
  const anchors = JSON.parse(
    readFileSync('scripts/indoor/mtr-shop-station-anchors.json', 'utf8'),
  ) as Record<string, { geometry: { coordinates: [number, number] } }>
  for (const shop of shops) {
    const id = shop.properties.shopNumber.slice(0, 3).toUpperCase()
    if (catalogue.stations.some(station => station.id === id)) continue
    const anchor = anchors[id]
    if (!anchor) throw new Error(`Missing station anchor: ${id}`)
    catalogue.stations.push({
      id,
      name: shop.properties.station,
      nameZh: id === 'WEK' ? '西九龍' : shop.properties.station,
      coordinates: anchor.geometry.coordinates,
    })
  }
  const localPath = process.argv
    .find(value => value.startsWith('--local-current='))
    ?.slice('--local-current='.length)
  const localPreviews = localPath ? openLocalPreviews(localPath) : null
  const includeText = process.argv.includes('--text')
  const selected = process.argv
    .slice(2)
    .filter(value => value !== '--text' && !value.startsWith('--local-current='))
  const stations = catalogue.stations.filter(
    station => !selected.length || selected.includes(station.id),
  )
  if (selected.some(id => !stations.some(station => station.id === id)))
    throw new Error('Unknown station code')
  console.log(JSON.stringify({ phase: 'publication', stations: stations.length }))
  const summaries: Array<{
    station: string
    shops: number
    discovered: number
    withCandidates: number
    complete: boolean
  }> = []
  /** Retain one station receipt without mutating Hype identities.
   * @param station Catalogue station. @returns Completion after its report is saved.
   */
  async function scanStation(station: (typeof stations)[number]): Promise<void> {
    const path = `${directory}/${station.id}.json`
    const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
    if (
      prior?.version === 5 &&
      prior.includeText === includeText &&
      prior.sourceHash === sourceHash &&
      prior.complete &&
      JSON.stringify(prior.publication.pin) === JSON.stringify(publication.pin)
    ) {
      summaries.push(prior.summary)
      return
    }
    if (prior) {
      mkdirSync(`${directory}/archive`, { recursive: true })
      writeFileSync(
        `${directory}/archive/${station.id}-${Date.now()}.json`,
        JSON.stringify(prior, null, 2),
      )
    }
    const candidates = new Map<string, StationCandidate>()
    const searches: Array<{ q: string; complete: boolean; error?: string }> = []
    // Use bilingual station names and the station code; exhaust each independently.
    for (const q of includeText
      ? [...new Set([station.name, station.nameZh, station.id])]
      : []) {
      const receipt = { q, complete: false, error: undefined as string | undefined }
      searches.push(receipt)
      console.log(JSON.stringify({ station: station.id, query: q, phase: 'search' }))
      try {
        let cursor: string | undefined
        const cursors = new Set<string>()
        do {
          const page = await searchSaanSeoiPlacesPage(client, {
            q,
            limit: 20,
            cursor,
            filters: { operatingStatus: 'any' },
            near: { coordinates: station.coordinates, radius: 1000 },
          })
          for (const row of page.candidates) {
            const preview = row.preview as
              | {
                  i18n?: Record<
                    string,
                    { name?: string; brandName?: string; freeformAddress?: string }
                  >
                }
              | undefined
            if (!preview?.i18n)
              throw new Error('Search preview missing; coverage incomplete')
            const values = Object.values(preview.i18n)
            candidates.set(row.placeId, {
              id: row.placeId,
              resourceReleaseId: row.resourceReleaseId,
              names: [
                ...new Set(
                  [
                    row.nameText,
                    row.brandText,
                    ...values.flatMap(value => [value.name, value.brandName]),
                  ].filter((value): value is string => Boolean(value)),
                ),
              ],
              addresses: [
                ...new Set(
                  values.flatMap(value =>
                    value.freeformAddress ? [value.freeformAddress] : [],
                  ),
                ),
              ],
            })
          }
          console.log(
            JSON.stringify({
              station: station.id,
              query: q,
              candidates: candidates.size,
              hasMore: Boolean(page.nextCursor),
            }),
          )
          cursor = page.nextCursor ?? undefined
          if (cursor && cursors.has(cursor)) throw new Error('Repeated cursor')
          if (cursor) cursors.add(cursor)
        } while (cursor)
        receipt.complete = true
      } catch (cause) {
        receipt.error = cause instanceof Error ? cause.message : String(cause)
      }
    }
    // Inspect all cells covering the station envelope, including shops absent from name search.
    const spatial = {
      q: 'station-envelope-350m',
      complete: false,
      error: undefined as string | undefined,
    }
    searches.push(spatial)
    try {
      const [lng, lat] = station.coordinates
      const dy = 350 / 110000,
        dx = dy / Math.cos((lat * Math.PI) / 180)
      const cells = polygonToCellsExperimental(
        [
          [lng - dx, lat - dy],
          [lng + dx, lat - dy],
          [lng + dx, lat + dy],
          [lng - dx, lat + dy],
        ],
        9,
        POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
        true,
      )
      for (const cell of cells) {
        let offset = 0
        while (true) {
          const url = new URL(`/places/v0.1/by-cell/9/${cell}`, client.baseUrl)
          url.search = new URLSearchParams({
            region: 'hk',
            limit: '100',
            offset: String(offset),
          }).toString()
          const response = await client.fetch(url, {
            headers: { 'x-api-key': client.apiKey },
            signal: AbortSignal.timeout(30000),
          })
          if (!response.ok)
            throw new Error(`Cell discovery failed (${response.status})`)
          const page = (await response.json()) as {
            places: Array<{ placeId: string; resourceReleaseId: string }>
            meta: { page: { offset: number; limit: number; hasMore: boolean } }
          }
          if (page.meta.page.offset !== offset || page.meta.page.limit !== 100)
            throw new Error('Cell pagination changed')
          // Keep API discovery authoritative, verifying one batch preview against the API.
          const localBatch = localPreviews?.read(page.places)
          const sampleId = page.places.find(
            place => !candidates.has(place.placeId),
          )?.placeId
          for (let i = 0; i < page.places.length; i += 4) {
            await Promise.all(
              page.places.slice(i, i + 4).map(async place => {
                if (candidates.has(place.placeId)) return
                const local = localBatch?.get(place.placeId)
                if (local && place.placeId !== sampleId) {
                  candidates.set(place.placeId, local)
                  return
                }
                const detail = new URL(
                  `/places/v0.1/${encodeURIComponent(place.placeId)}`,
                  client.baseUrl,
                )
                detail.searchParams.set('region', 'hk')
                const response = await client.fetch(detail, {
                  headers: { 'x-api-key': client.apiKey },
                  signal: AbortSignal.timeout(30000),
                })
                if (!response.ok) throw new Error(`Preview failed (${response.status})`)
                const preview = (await response.json()) as {
                  place: { id: string; resourceReleaseId: string }
                  i18n: Record<
                    string,
                    { name?: string; brandName?: string; freeformAddress?: string }
                  >
                }
                if (
                  preview.place.id !== place.placeId ||
                  preview.place.resourceReleaseId !== place.resourceReleaseId
                )
                  throw new Error('Preview identity changed')
                const values = Object.values(preview.i18n)
                candidates.set(place.placeId, {
                  id: place.placeId,
                  resourceReleaseId: place.resourceReleaseId,
                  names: [
                    ...new Set(
                      values
                        .flatMap(value => [value.name, value.brandName])
                        .filter((value): value is string => Boolean(value)),
                    ),
                  ],
                  addresses: [
                    ...new Set(
                      values.flatMap(value =>
                        value.freeformAddress ? [value.freeformAddress] : [],
                      ),
                    ),
                  ],
                })
                if (local) {
                  const actual = candidates.get(place.placeId)!
                  if (
                    JSON.stringify([...actual.names].sort()) !==
                      JSON.stringify([...local.names].sort()) ||
                    JSON.stringify([...actual.addresses].sort()) !==
                      JSON.stringify([...local.addresses].sort())
                  )
                    throw new Error('Local preview sample differs from API')
                }
              }),
            )
          }
          console.log(
            JSON.stringify({
              station: station.id,
              cell,
              offset,
              candidates: candidates.size,
            }),
          )
          if (!page.meta.page.hasMore) break
          offset += 100
          if (offset >= 10000)
            throw new Error('Cell safety limit reached; coverage incomplete')
        }
      }
      spatial.complete = true
    } catch (cause) {
      spatial.error = cause instanceof Error ? cause.message : String(cause)
    }
    const rows = compareStationShops(
      station,
      shops.filter(shop =>
        shop.properties.shopNumber.toUpperCase().startsWith(station.id),
      ),
      [...candidates.values()],
    )
    // Preserve partial evidence even when publication verification is unavailable.
    const publicationCheck = {
      q: 'publication-check',
      complete: false,
      error: undefined as string | undefined,
    }
    searches.push(publicationCheck)
    try {
      const currentPublication = await discoverLocationPublication(client)
      if (JSON.stringify(currentPublication.pin) !== JSON.stringify(publication.pin))
        throw new Error(
          'Publication changed during discovery; rerun against one publication',
        )
      publicationCheck.complete = true
    } catch (cause) {
      publicationCheck.error = cause instanceof Error ? cause.message : String(cause)
    }
    const summary = {
      station: station.id,
      shops: rows.length,
      discovered: candidates.size,
      withCandidates: rows.filter(row => row.matches.length).length,
      complete: searches.every(search => search.complete),
    }
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: 5,
          previewTransport: localPreviews ? 'local-readonly-api-sampled' : 'api',
          includeText,
          sourceHash,
          station,
          publication,
          searchedAt: new Date().toISOString(),
          complete: summary.complete,
          searches,
          summary,
          candidates: [...candidates.values()],
          rows,
        },
        null,
        2,
      ) + '\n',
    )
    summaries.push(summary)
    console.log(JSON.stringify(summary))
  }
  // Bound station concurrency as well as each station's detail request fan-out.
  for (let index = 0; index < stations.length; index += 3) {
    await Promise.all(stations.slice(index, index + 3).map(scanStation))
  }
  localPreviews?.close()
  summaries.sort((a, b) => a.station.localeCompare(b.station))
  writeFileSync(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        publication,
        coverage: { stationEnvelopeMetres: 350, includeText },
        totals: {
          stations: summaries.length,
          completeStations: summaries.filter(row => row.complete).length,
          shops: summaries.reduce((sum, row) => sum + row.shops, 0),
          shopsWithCandidates: summaries.reduce(
            (sum, row) => sum + row.withCandidates,
            0,
          ),
        },
        summaries,
      },
      null,
      2,
    ) + '\n',
  )
}
await main()
