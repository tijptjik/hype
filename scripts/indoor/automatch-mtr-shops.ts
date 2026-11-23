// NODE
import { writeFileSync, realpathSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { discoverLocationPublication } from '../../src/lib/locations/publication'
import { findSaanSeoiPlace } from '../../src/lib/locations/sourceLookup'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
  acceptLocationIdentityReview,
} from '../../src/lib/db/services/locationIdentityReview'
import { compareStationShops } from './mtr-station-comparison'
import evidence from '../../src/lib/locations/mtrMatchEvidence.json'

/** Revalidate and accept unique code-and-name MTR candidates in an explicitly selected local database.
 * @returns Durable per-shop receipt.
 * @remarks Preview is read-only. Apply requires --apply-local and a pre-existing backup path.
 * Occupied upstream identities, duplicate claims and changed evidence remain for manual review.
 */
async function main(): Promise<void> {
  const [database] = process.argv.slice(2)
  const apply = process.argv.includes('--apply-local')
  const backup = process.argv.find(value => value.startsWith('--backup='))?.slice(9)
  const path = realpathSync(database)
  if (!path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/'))
    throw new Error('Managed local database only')
  if (apply && (!backup || realpathSync(backup) === path))
    throw new Error('Separate existing backup required')
  const domain = openSqliteDomain(path)
  const client = {
    baseUrl: 'http://[::1]',
    apiKey: 'local-development',
    fetch: ((input, init) => {
      const headers = new Headers(init?.headers)
      headers.set('host', 'api.atlas.localhost')
      return fetch(input, { ...init, headers })
    }) as typeof fetch,
  }
  const receipt: Array<Record<string, unknown>> = []
  const output = `.local/places/mtr-network/automatch-${apply ? 'applied' : 'preview'}.json`
  try {
    const publication = await discoverLocationPublication(client)
    if (JSON.stringify(publication.pin) !== JSON.stringify(evidence.publication.pin))
      throw new Error('Discovery publication changed')
    const exact = evidence.rows.filter(row => row.category === 'exact')
    const claims = new Map<string, number>()
    for (const row of exact)
      for (const candidate of row.candidates.filter(
        m => m.evidence === 'code-and-name' && !m.conflictingCode,
      ))
        claims.set(candidate.ssId, (claims.get(candidate.ssId) ?? 0) + 1)
    for (const row of exact) {
      const result: Record<string, unknown> = {
        sourceKey: row.sourceKey,
        code: row.code,
      }
      try {
        const eligible = row.candidates.filter(
          m => m.evidence === 'code-and-name' && !m.conflictingCode,
        )
        if (eligible.length !== 1 || claims.get(eligible[0].ssId) !== 1)
          throw new Error('Ambiguous upstream claim')
        const candidate = eligible[0]
        const local = domain.sqlite
          .query(
            `SELECT l.id,l.ssId,l.state,r.facts,r.rawSource FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId JOIN locationRevisionContent r ON r.id=l.id||'_draft' WHERE d.sourceKey=? AND l.ownerOrganisationId IS NULL`,
          )
          .get(row.sourceKey) as {
          id: string
          ssId: string | null
          state: string
          facts: string
          rawSource: string
        } | null
        if (!local) throw new Error('Local shop absent')
        result.locationId = local.id
        result.ssId = candidate.ssId
        if (local.ssId === candidate.ssId) {
          result.status = 'already-matched'
          receipt.push(result)
          continue
        }
        if (local.ssId || local.state !== 'unresolved')
          throw new Error('Local identity changed')
        if (
          domain.sqlite
            .query('SELECT id FROM location WHERE ssId=?')
            .get(candidate.ssId)
        )
          throw new Error(
            'Merge required: upstream identity already has a Hype Location',
          )
        const baseline = await readLocationIdentityBaseline(domain.db, local.id, null)
        if (!baseline?.expectedLatestContentHash)
          throw new Error('Missing shared draft hash')
        const found = await findSaanSeoiPlace(client, publication.pin, candidate.ssId)
        if (!found || found.projection.releaseId !== candidate.resourceReleaseId)
          throw new Error('Upstream release changed')
        const currentFacts = readLocationFacts(local.facts)
        const source = JSON.parse(local.rawSource).record
        const upstream = found.projection.facts
        const addresses = Object.values(
          upstream.location.address.fallbackDisplay ?? {},
        ).filter((value): value is string => typeof value === 'string')
        const checked = compareStationShops(
          {
            id: row.station,
            name: source.properties.station,
            nameZh: source.properties.station,
          },
          [
            {
              sourceRecordId: source.sourceRecordId,
              businessName: Object.values(currentFacts.names).find(Boolean) ?? '',
              properties: source.properties,
            },
          ],
          [
            {
              id: candidate.ssId,
              resourceReleaseId: candidate.resourceReleaseId,
              names: Object.values(upstream.names).filter((value): value is string =>
                Boolean(value),
              ),
              addresses,
            },
          ],
        )[0]
        if (
          !checked.matches.some(
            m => m.evidence === 'code-and-name' && !m.conflictingCode,
          )
        )
          throw new Error('Current code/name evidence no longer agrees')
        if (!apply) result.status = 'eligible'
        else {
          // Freeze and accept in one transaction; domain fences reject concurrent draft edits.
          domain.sqlite.exec('BEGIN IMMEDIATE')
          try {
            const reviewId = await captureLocationIdentityReview(
              domain.db,
              baseline,
              found.projection,
              'hype-local-agent-admin',
            )
            if (!reviewId) throw new Error('Draft changed during discovery')
            const accepted = await acceptLocationIdentityReview(domain.db, {
              locationId: local.id,
              ownerOrganisationId: null,
              reviewId,
              actorId: 'hype-local-agent-admin',
              reason:
                'User-authorized MTR automatch: unique complete shop code and exact normalized name agree; no conflicting unit code; source publication revalidated.',
            })
            if (accepted.status !== 'applied')
              throw new Error(`Acceptance: ${accepted.status}`)
            domain.sqlite.exec('COMMIT')
            result.status = 'applied'
            result.reviewId = reviewId
          } catch (cause) {
            domain.sqlite.exec('ROLLBACK')
            throw cause
          }
        }
      } catch (cause) {
        result.status = 'review'
        result.reason = cause instanceof Error ? cause.message : String(cause)
      }
      receipt.push(result)
      writeFileSync(
        output,
        JSON.stringify({ publication, apply, backup, receipt }, null, 2) + '\n',
      )
      console.log(JSON.stringify(result))
    }
    writeFileSync(
      output,
      JSON.stringify({ publication, apply, backup, receipt }, null, 2) + '\n',
    )
  } finally {
    domain.close()
  }
}
await main()
