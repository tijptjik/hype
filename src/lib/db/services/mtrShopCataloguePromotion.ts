// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

/** Retain an imported MTR catalogue association when a reviewed draft acquires upstream identity.
 * @param db Authorized identity transaction database.
 * @param input Draft identity, authenticated actor and the acceptance concurrency fence.
 * @returns Checks to run before identity changes and writes to run before source replacement.
 * @remarks No standalone draft correction is committed. Existing community brand choices win.
 */
export async function prepareMtrShopCataloguePromotion(
  db: Database,
  input: { locationId: string; actorId: string; guard: SQL },
): Promise<{ checks: BatchItem<'sqlite'>[]; writes: BatchItem<'sqlite'>[] }> {
  const draft = await db.get<{ id: string; facts: string }>(sql`
    SELECT r.id,r.facts FROM location l JOIN locationCanonicalDraft d ON d.locationId=l.id
    JOIN locationRevisionContent r ON r.locationId=l.id
    WHERE l.id=${input.locationId} AND l.state='unresolved' AND l.ssId IS NULL
      AND l.ownerOrganisationId IS NULL AND d.sourceKey LIKE 'mtr-shop:%'
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)`)
  if (!draft) return { checks: [], writes: [] }
  const facts = readLocationFacts(draft.facts)
  if (!facts.brandId) return { checks: [], writes: [] }
  const previous = await readSharedLocationCorrection(db, input.locationId)
  if (previous && JSON.parse(previous.corrections).brandId)
    return { checks: [], writes: [] }
  // Capture the reviewed catalogue choice before the new upstream facts replace the working copy.
  const correction = await prepareSharedLocationCorrection(db, {
    ...input,
    sourceRevisionId: draft.id,
    expectedRevision: previous?.id ?? null,
    draftWorkingCopy: true,
    patch: { brandId: { mode: 'override', value: facts.brandId } },
    rights: { canEdit: true, superAdmin: true },
    provenance: {
      kind: 'mtr-shop-catalogue-identity-promotion',
      sourceRevisionId: draft.id,
    },
  })
  // The shared correction plan checks its captured head before its single immutable insert.
  return { checks: correction.queries.slice(0, 1), writes: correction.queries.slice(1) }
}
