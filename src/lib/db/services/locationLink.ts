// DRIZZLE
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
// SCHEMA
import {
  location as locationTable,
  locationRevision,
  featureLocation,
} from '../schema/location'
// DOMAIN
import { preserveFeatureLocationBaseline } from '#lib/locations/baseline.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// SERVICES
import { readFeatureLocationBaseline } from './locationBaseline'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { readProjectLocationOwner } from './locationScope'
import { prepareLinkedLocationProjection } from './locationLinkProjection'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationBaselineResult } from './locationBaseline'

export type InitialLocationLinkResult =
  | { status: 'linked'; revision: string }
  | { status: 'conflict' | 'place-unavailable' }
  | Exclude<LocationBaselineResult, { status: 'ready' }>

/**
 * Link an existing Feature to a verified Location revision, preserving persisted values.
 * @param db Request-local database.
 * @param input Authorized persisted Feature/project scope and an explicitly selected revision.
 * @returns New association token or a conflict/exclusion/review result without partial writes.
 * @remarks Internal migration/linking service; caller must authorize full Feature editing
 * and verify the selected establishment identity. No client-supplied baseline is accepted.
 * Existing effective columns and timestamps remain untouched. Normal forms use atomic
 * linked/unlinked saves so association cannot interleave with relation replacement.
 */
export async function linkInitialFeatureLocation(
  db: Database,
  input: {
    featureId: string
    projectId: string
    locationId: string
    revisionId: string
    expectedFeatureModifiedAt: string
    actorId: string
    authorizeLocationCorrection?: () => Promise<void>
  },
): Promise<InitialLocationLinkResult> {
  const baseline = await readFeatureLocationBaseline(
    db,
    input.featureId,
    input.projectId,
  )
  if (baseline.status !== 'ready') return baseline
  if (baseline.baseline.modifiedAt !== input.expectedFeatureModifiedAt)
    return { status: 'conflict' }
  if (
    await db
      .select({ id: featureLocation.featureId })
      .from(featureLocation)
      .where(eq(featureLocation.featureId, input.featureId))
      .get()
  )
    return { status: 'conflict' }
  // Private source evidence is scoped before loading any revision facts.
  const selected = await db
    .select({ facts: locationRevision.facts })
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationTable.id, input.locationId),
        ne(locationTable.state, 'redirect'),
        eq(locationRevision.id, input.revisionId),
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(
            locationTable.ownerOrganisationId,
            locationOwnerForProject(input.projectId),
          ),
        ),
      ),
    )
    .get()
  if (!selected) return { status: 'place-unavailable' }
  const facts = LocationFactsSchema.parse(selected.facts)
  const organisationId = await readProjectLocationOwner(db, input.projectId)
  const corrections = await readOrganisationLocation(
    db,
    organisationId,
    input.locationId,
  )
  const overrides =
    corrections?.overrides ??
    preserveFeatureLocationBaseline(baseline.baseline.effective, facts, facts.location)
  if (!corrections && Object.keys(overrides).length)
    await input.authorizeLocationCorrection?.()
  // Seed preserved values once at Organisation scope; subsequent Features reuse that head.
  const fence = sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND projectId=${input.projectId} AND modifiedAt=${input.expectedFeatureModifiedAt}) AND NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${input.featureId})`
  const correction = await prepareOrganisationLocationWrite(db, {
    organisationId,
    locationId: input.locationId,
    actorId: input.actorId,
    overrides,
    guard: fence,
  })
  const write = prepareFeatureLocationAssociationWrite(db, {
    ...input,
    expectedRevision: null,
    factsRevisionId: input.revisionId,
    locationRevisionId: input.revisionId,
    overrides,
    factsOrganisationRevision: correction.revision,
    locationOrganisationRevision: correction.revision,
    additionalGuard: correction.guard,
  })
  const projections = corrections
    ? await prepareLinkedLocationProjection(db, {
        ...input,
        revision: write.revision,
        facts,
        overrides,
      })
    : []
  const results = await db.batch([
    ...correction.queries,
    write.query,
    ...projections,
  ] as [
    import('drizzle-orm/batch').BatchItem<'sqlite'>,
    ...import('drizzle-orm/batch').BatchItem<'sqlite'>[],
  ])
  const rows = results[correction.queries.length] as Array<{ revision: string }>
  return rows.length
    ? { status: 'linked', revision: write.revision }
    : { status: 'conflict' }
}
