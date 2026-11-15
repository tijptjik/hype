// DRIZZLE
import { and, eq, isNull } from 'drizzle-orm'
// SCHEMA
import { locationOperator, locationPremisesMap } from '../schema/operator'
// DOMAIN
import { premisesMap } from '../schema/premisesMap'
// TYPES
import type { Database } from '#lib/types.js'

/** Attach a reviewed operating body without silently replacing a prior assignment.
 * @param db Request-local database or transactional importer adapter.
 * @param input Exact Location and operator identities with the responsible actor.
 * @returns Nothing; throws if another operator is already assigned.
 * @remarks Trusted ingestion only; no public command exposes this write. The caller
 * must authorize the assignment. An operator never grants Location access or ownership.
 */
export async function assignLocationOperator(
  db: Database,
  input: {
    locationId: string
    operatorId: string
    actorId: string
    referenceCode?: string
  },
): Promise<void> {
  if (!input.actorId.trim()) throw new Error('Operator assignment requires an actor')
  if (
    input.referenceCode !== undefined &&
    (!input.referenceCode.trim() || input.referenceCode !== input.referenceCode.trim())
  )
    throw new Error('Operator code must be nonempty and trimmed')
  // Ignore a concurrent insert only when read-back confirms the exact same assignment.
  await db
    .insert(locationOperator)
    .values({
      locationId: input.locationId,
      operatorId: input.operatorId,
      createdBy: input.actorId,
      referenceCode: input.referenceCode,
    })
    .onConflictDoNothing()
  const retained = await db
    .select()
    .from(locationOperator)
    .where(eq(locationOperator.locationId, input.locationId))
    .get()
  if (retained?.operatorId !== input.operatorId)
    throw new Error(
      'Location already has a different operator; explicit review required',
    )
  if (input.referenceCode !== undefined) {
    if (retained.referenceCode && retained.referenceCode !== input.referenceCode)
      throw new Error('Location already has a different operator code')
    // Backfill only an absent code; the unique operator/code index also fences competing assignments.
    await db
      .update(locationOperator)
      .set({ referenceCode: input.referenceCode })
      .where(
        and(
          eq(locationOperator.locationId, input.locationId),
          isNull(locationOperator.referenceCode),
        ),
      )
    const current = await db
      .select()
      .from(locationOperator)
      .where(eq(locationOperator.locationId, input.locationId))
      .get()
    if (current?.referenceCode !== input.referenceCode)
      throw new Error('Operator code changed during assignment')
  }
}

/** Assign an explicit maintained map without replacing another map association.
 * @param db Authorized importer database. @param input Location, registry reference and actor.
 * @returns Nothing; throws for unknown maps or conflicting assignments.
 * @remarks Availability comes from the published database pointer; this does not grant access or infer containment.
 */
export async function assignLocationPremisesMap(
  db: Database,
  input: { locationId: string; mapId: string; actorId: string },
): Promise<void> {
  const map = await db
    .select({ id: premisesMap.id })
    .from(premisesMap)
    .where(eq(premisesMap.id, input.mapId))
    .get()
  if (!input.actorId.trim() || !map)
    throw new Error('Map assignment requires an actor and a known map reference')
  await db
    .insert(locationPremisesMap)
    .values({
      locationId: input.locationId,
      mapId: input.mapId,
      createdBy: input.actorId,
    })
    .onConflictDoNothing()
  const retained = await db
    .select()
    .from(locationPremisesMap)
    .where(eq(locationPremisesMap.locationId, input.locationId))
    .get()
  if (retained?.mapId !== input.mapId)
    throw new Error('Premises map assignment requires review')
}
