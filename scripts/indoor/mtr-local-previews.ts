// BUN
import { Database } from 'bun:sqlite'
// TYPES
import type { StationCandidate } from './mtr-station-comparison'

type PreviewRow = {
  id: string
  scopeId: string
  resourceReleaseId: string
  name: string | null
  brandName: string | null
  freeformAddress: string | null
}

/** Read published local previews for identities already discovered through the API.
 * @param path Exact SQLite database backing the local SaanSeoi API.
 * @returns Batch reader and explicit connection cleanup.
 * @remarks Opens read-only; one JSON parameter avoids per-identity parameter limits.
 * Missing records, release differences and ambiguous current scopes fail the batch.
 */
export function openLocalPreviews(path: string): {
  read: (
    places: Array<{ placeId: string; resourceReleaseId: string }>,
  ) => Map<string, StationCandidate>
  close: () => void
} {
  const db = new Database(path, { readonly: true, strict: true })
  // Fix join order so each identity uses (scopeId,id), not a release-wide scan.
  const query = db.query<PreviewRow, [string]>(`
    SELECT p.id,p.scopeId,p.resourceReleaseId,i.name,i.brandName,i.freeformAddress
    FROM placePublicationState s
    CROSS JOIN json_each(?) wanted
    CROSS JOIN places p INDEXED BY sqlite_autoindex_places_1
      ON p.scopeId=s.scopeId AND p.id=json_extract(wanted.value,'$.placeId')
      AND p.resourceReleaseId=json_extract(wanted.value,'$.resourceReleaseId')
    LEFT JOIN placesI18n i ON i.scopeId=p.scopeId AND i.placeId=p.id
    WHERE s.status='current' AND s.preparedAt IS NOT NULL AND s.publicationToken<>''
    ORDER BY p.id,i.locale
  `)
  return {
    read(places) {
      const result = new Map<string, StationCandidate>()
      const scopes = new Map<string, string>()
      for (const row of query.all(JSON.stringify(places))) {
        if (scopes.has(row.id) && scopes.get(row.id) !== row.scopeId)
          throw new Error(`Ambiguous local publication: ${row.id}`)
        scopes.set(row.id, row.scopeId)
        const candidate = result.get(row.id) ?? {
          id: row.id,
          resourceReleaseId: row.resourceReleaseId,
          names: [],
          addresses: [],
        }
        for (const name of [row.name, row.brandName])
          if (name && !candidate.names.includes(name)) candidate.names.push(name)
        if (row.freeformAddress && !candidate.addresses.includes(row.freeformAddress))
          candidate.addresses.push(row.freeformAddress)
        result.set(row.id, candidate)
      }
      if (result.size !== new Set(places.map(place => place.placeId)).size)
        throw new Error('Local previews do not match API identities and releases')
      return result
    },
    close: () => db.close(),
  }
}
