// DRIZZLE
import { and, eq, isNull, ne, or } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// DOMAIN
import { preserveFeatureLocationBaseline } from '#lib/locations/baseline.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// SERVICES
import { readFeatureLocationBaseline } from './locationBaseline'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
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
          isNull(locationTable.ownerOrganisationId),
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
  const overrides = preserveFeatureLocationBaseline(
    baseline.baseline.effective,
    facts,
    facts.location,
  )
  const write = prepareFeatureLocationAssociationWrite(db, {
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
