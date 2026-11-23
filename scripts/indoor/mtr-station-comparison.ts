// DOMAIN
import { mtrShopUnitKey } from './mtr-shop-codes'

export type StationShop = {
  sourceRecordId: string
  businessName: string
  properties: { shopNumber: string; station: string }
}
export type StationCandidate = {
  id: string
  resourceReleaseId: string
  names: string[]
  addresses: string[]
}

export type StationComparison = StationShop & {
  matches: Array<{
    ssId: string
    resourceReleaseId: string
    names: string[]
    addresses: string[]
    evidence: 'code-and-name' | 'code-tenant-unconfirmed' | 'station-and-name'
    conflictingCode: boolean
  }>
  status: 'review' | 'unmatched'
}

/** Normalize names for exact secondary comparison without fuzzy identity claims.
 * @param value Publisher label. @returns Case- and punctuation-insensitive label.
 */
function nameKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** Compare a station's directory shops with discovered upstream establishments.
 * @param station Station identity and bilingual labels.
 * @param shops Complete directory records for this station.
 * @param candidates Upstream previews; spatial proximity alone is not containment.
 * @returns Every shop and ranked evidence, including conflicting tenants and unmatched records.
 * @remarks These are review candidates, never automatic ssId assignments.
 */
export function compareStationShops(
  station: { id: string; name: string; nameZh: string },
  shops: StationShop[],
  candidates: StationCandidate[],
): StationComparison[] {
  return shops.map(shop => {
    const key = mtrShopUnitKey(shop.properties.shopNumber)
    const matches = candidates.flatMap<StationComparison['matches'][number]>(
      candidate => {
        const address = candidate.addresses.join(' ').normalize('NFKC').toUpperCase()
        const stationNamed = [station.name, station.nameZh].some(name =>
          address.includes(name.toUpperCase()),
        )
        const codes = [
          ...address.matchAll(
            /\b([A-Z]{3})\s*((?:ATM|VEM|APM|[A-Z])\s*)?([A-Z]?\d+[A-Z]?(?:\s*[-–—&,/]\s*\d+[A-Z]?)*)\b/g,
          ),
        ].map(match => mtrShopUnitKey(match[0]))
        if (stationNamed) {
          for (const match of address.matchAll(
            /(?:\b(?:SHOP|KIOSK)(?:\s+NO\.?)?\s*|舖\s*)([A-Z]?\d+[A-Z]?(?:\s*[-–—&,/]\s*\d+[A-Z]?)*)\b/g,
          )) {
            codes.push(mtrShopUnitKey(station.id + match[1]))
          }
        }
        const codeMatch = codes.includes(key)
        const nameMatch = candidate.names.some(
          name => nameKey(name) === nameKey(shop.businessName),
        )
        if (!codeMatch && !(stationNamed && nameMatch)) return []
        const conflictingCode = codes.some(
          code => code.startsWith(station.id) && code !== key,
        )
        return [
          {
            ssId: candidate.id,
            resourceReleaseId: candidate.resourceReleaseId,
            names: candidate.names,
            addresses: candidate.addresses,
            evidence: codeMatch
              ? nameMatch
                ? 'code-and-name'
                : 'code-tenant-unconfirmed'
              : 'station-and-name',
            conflictingCode,
          },
        ]
      },
    )
    const rank = {
      'code-and-name': 0,
      'code-tenant-unconfirmed': 1,
      'station-and-name': 2,
    }
    matches.sort(
      (a, b) =>
        rank[a.evidence as keyof typeof rank] - rank[b.evidence as keyof typeof rank] ||
        a.ssId.localeCompare(b.ssId),
    )
    return { ...shop, matches, status: matches.length ? 'review' : 'unmatched' }
  })
}
