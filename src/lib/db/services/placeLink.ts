// DRIZZLE
import { and, eq, isNull, or } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// DOMAIN
import { preserveFeaturePlaceBaseline } from '#lib/places/baseline.js'
import { PlaceFactsSchema } from '#lib/places/validation.js'
// SERVICES
import { readFeaturePlaceBaseline } from './placeBaseline'
import { prepareFeaturePlaceAssociationWrite } from './placeAssociation'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceBaselineResult } from './placeBaseline'

export type InitialPlaceLinkResult =
  | { status: 'linked'; revision: string }
  | { status: 'conflict' | 'place-unavailable' }
  | Exclude<PlaceBaselineResult, { status: 'ready' }>

/**
 * Link an existing Feature to a verified Place revision, preserving persisted values.
 * @param db Request-local database.
 * @param input Authorized persisted Feature/project scope and an explicitly selected revision.
 * @returns New association token or a conflict/exclusion/review result without partial writes.
 * @remarks Internal migration/linking service; caller must authorize full Feature editing
 * and verify the selected establishment identity. No client-supplied baseline is accepted.
 * Existing effective columns and timestamps remain untouched. Normal forms use atomic
 * linked/unlinked saves so association cannot interleave with relation replacement.
 */
export async function linkInitialFeaturePlace(
  db: Database,
  input: {
    featureId: string
    projectId: string
    placeId: string
    revisionId: string
    expectedFeatureModifiedAt: string
    actorId: string
  },
): Promise<InitialPlaceLinkResult> {
  const baseline = await readFeaturePlaceBaseline(db, input.featureId, input.projectId)
  if (baseline.status !== 'ready') return baseline
  if (baseline.baseline.modifiedAt !== input.expectedFeatureModifiedAt)
    return { status: 'conflict' }
  // Private source evidence is scoped before loading any revision facts.
  const selected = await db
    .select({ facts: placeRevision.facts })
    .from(placeRevision)
    .innerJoin(place, eq(place.id, placeRevision.placeId))
    .where(
      and(
        eq(place.id, input.placeId),
        eq(placeRevision.id, input.revisionId),
        or(isNull(place.ownerProjectId), eq(place.ownerProjectId, input.projectId)),
      ),
    )
    .get()
  if (!selected) return { status: 'place-unavailable' }
  const facts = PlaceFactsSchema.parse(selected.facts)
  const overrides = preserveFeaturePlaceBaseline(
    baseline.baseline.effective,
    facts,
    facts.location,
  )
  const write = prepareFeaturePlaceAssociationWrite(db, {
    ...input,
    expectedRevision: null,
    factsRevisionId: input.revisionId,
    locationRevisionId: input.revisionId,
    overrides,
  })
  const rows = await write.query
  return rows.length
    ? { status: 'linked', revision: write.revision }
    : { status: 'conflict' }
}
