import {
  targetLocationKinds,
  type TargetContext,
} from '#lib/features/locationPolicy.js'
// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  featureIntentPolicy,
  featureIntentPolicyRevision,
} from '../schema/featureIntentPolicy'
// DOMAIN
import { expandLocationMatchingTypes } from '#lib/locations/taxonomy.js'
import {
  DEFAULT_FEATURE_TYPES,
  FeatureTypesSchema,
  requireFeatureType,
  resolveFeatureTypes,
  type FeatureType,
} from '#lib/features/intents.js'
// SERVICES
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import type { BatchItem } from 'drizzle-orm/batch'
import {
  FeatureIntentSettingsPatchSchema,
  type FeatureIntentSettingsPatch,
} from '#lib/features/intents.js'
// TYPES
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Policy scope and inherited configuration
// 2. Authorized policy writes
// 3. Feature authoring and association validation

export type FeatureIntentScope = { type: 'hub' | 'project' | 'layer'; id: string }
export type FeatureIntentPolicy = {
  types: FeatureType[]
  inheritedTypes: FeatureType[]
  definition: FeatureType[] | string[] | null
  version: number
  fingerprint: string
  lineage: { scope: FeatureIntentScope; version: number }[]
}

/** Read one configuration without materializing inherited defaults.
 * @param db Request database. @param scope Persisted owner.
 * @returns Optional override and its optimistic version.
 */
async function readOverride(
  db: Database,
  scope: FeatureIntentScope,
): Promise<{ definition: string | null; version: number }> {
  return (
    (await db.get<{ definition: string | null; version: number }>(
      sql`SELECT definition,version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}`,
    )) ?? { definition: null, version: 0 }
  )
}

/** Resolve ownership through the stored hierarchy, including the core hub fallback.
 * @param db Request database. @param scope Settings owner or selected layer.
 * @returns Effective catalogue, source configuration and hierarchy version fingerprint.
 */
export async function readFeatureIntentPolicy(
  db: Database,
  scope: FeatureIntentScope,
): Promise<FeatureIntentPolicy> {
  const own = await readOverride(db, scope)
  let inheritedTypes = DEFAULT_FEATURE_TYPES
  let parentFingerprint = ''
  let lineage: FeatureIntentPolicy['lineage'] = []
  if (scope.type !== 'hub') {
    const parent =
      scope.type === 'layer'
        ? await db.get<{ id: string }>(
            sql`SELECT projectId id FROM layer WHERE id=${scope.id}`,
          )
        : await db.get<{ id: string }>(
            sql`SELECT coalesce(o.hubId,(SELECT id FROM hub WHERE code='core')) id FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${scope.id}`,
          )
    if (!parent) throw new Error('Feature policy owner no longer exists')
    if (parent.id) {
      const resolved = await readFeatureIntentPolicy(db, {
        type: scope.type === 'layer' ? 'project' : 'hub',
        id: parent.id,
      })
      inheritedTypes = resolved.types
      parentFingerprint = resolved.fingerprint
      lineage = resolved.lineage
    }
  }
  const definition =
    own.definition === null
      ? null
      : (JSON.parse(own.definition) as FeatureType[] | string[])
  const types =
    scope.type === 'layer'
      ? definition === null
        ? inheritedTypes
        : definition.every(value => typeof value === 'string')
          ? resolveFeatureTypes(inheritedTypes, null, definition as string[])
          : FeatureTypesSchema.parse(definition)
      : definition === null
        ? inheritedTypes
        : FeatureTypesSchema.parse(definition)
  return {
    types,
    inheritedTypes,
    definition,
    version: own.version,
    fingerprint: JSON.stringify([scope, own.version, parentFingerprint]),
    lineage: [...lineage, { scope, version: own.version }],
  }
}

/** Save an attributed settings revision without rewriting any Feature or Location.
 * @param db Request database. @param input Validated configuration and ancestry guard.
 * @returns Whether the complete conditional batch committed.
 */
export async function saveFeatureIntentPolicy(
  db: Database,
  input: {
    scope: FeatureIntentScope
    definition: FeatureType[] | string[] | null
    version: number
    actorId: string
    guard: SQL
  },
): Promise<boolean> {
  const definition = input.definition === null ? null : JSON.stringify(input.definition)
  const guard = sql`${input.guard} AND coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${input.scope.type} AND scopeId=${input.scope.id}),0)=${input.version}`
  const values = {
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    definition,
    version: input.version + 1,
    actorId: input.actorId,
  }
  const result = await executeRevisionBatch(db, guard, [
    db
      .insert(featureIntentPolicy)
      .values(values)
      .onConflictDoUpdate({
        target: [featureIntentPolicy.scopeType, featureIntentPolicy.scopeId],
        set: values,
      }),
    db.insert(featureIntentPolicyRevision).values({
      ...values,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }),
  ])
  return Boolean(result)
}

/** Enforce current rules for an explicit new association, leaving existing links untouched.
 * @param db Request database. @param featureId Authorized Feature. @param locationId Target Location, or null for unlink.
 * @returns Nothing when compatible; throws before a mutation otherwise.
 */
export async function assertFeatureIntentLocation(
  db: Database,
  featureId: string,
  locationId: string | null,
): Promise<void> {
  // Unlinking remains possible even when a former feature type has been retired.
  if (locationId === null) return
  const identity = await db.get<{
    featureType: string | null
    targetContext: TargetContext | null
  }>(sql`SELECT featureType,targetContext FROM feature WHERE id=${featureId}`)
  if (!identity?.featureType) return
  const row = await db.get<{ layerId: string }>(
    sql`SELECT layerId FROM feature WHERE id=${featureId}`,
  )
  if (!row) throw new Error('Feature no longer exists')
  const policy = await readFeatureIntentPolicy(db, { type: 'layer', id: row.layerId })
  const type = requireFeatureType(policy.types, identity.featureType, true)
  const location = await db.get<{ kind: string }>(
    sql`SELECT matchingType AS kind FROM location WHERE id=${locationId}`,
  )
  if (
    !location ||
    !expandLocationMatchingTypes(
      identity.targetContext
        ? targetLocationKinds(identity.targetContext)
        : type.locationKinds,
    ).some(kind => kind === location.kind)
  )
    throw new Error(
      'This Location kind is not permitted for the selected feature type.',
    )
}

/** Preserve the publication hook while allowing unresolved Location associations.
 * @param db Request database. @param featureId Authorized publication target.
 * @returns Nothing; association completeness is surfaced by index filters.
 */
export async function assertFeatureIntentPublication(
  db: Database,
  featureId: string,
): Promise<void> {
  // Missing associations are data-quality work, never a publication gate.
  void db
  void featureId
}

/** A model-tab validation failure presented by the centralized resource form. */
export class FeatureIntentPolicyError extends Error {}

/** Prepare the model tab for the parent's atomic form transaction.
 * @param db Request database. @param input Authenticated parent scope and staged policy.
 * @returns Guarded writes, or null when the policy ancestry has changed.
 * @remarks The parent owns authorization, its revision guard and transaction execution.
 */
export async function prepareFeatureIntentPolicySave(
  db: Database,
  input: FeatureIntentSettingsPatch & {
    scope: FeatureIntentScope
    actorId: string
    nameProperties?: readonly {
      id?: string
      dataType?: string | null
      audience?: string | null
    }[]
  },
): Promise<BatchItem<'sqlite'>[] | null> {
  const patch = FeatureIntentSettingsPatchSchema.parse(input)
  const current = await readFeatureIntentPolicy(db, input.scope)
  if (current.version !== patch.version || current.fingerprint !== patch.fingerprint)
    return null
  // Validate naming dependencies before composing any writes.
  if (patch.definition?.some(type => type.nameRule?.conditions.length)) {
    const projectId =
      input.scope.type === 'project'
        ? input.scope.id
        : input.scope.type === 'layer'
          ? (
              await db.get<{ id: string }>(
                sql`SELECT projectId id FROM layer WHERE id=${input.scope.id}`,
              )
            )?.id
          : null
    const { listResolvedProjectProperties } = await import('./property.js')
    const properties =
      input.nameProperties ??
      (projectId ? await listResolvedProjectProperties(db, projectId) : [])
    assertNameDependencies(patch.definition ?? [], properties)
  }
  const values = {
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    definition: patch.definition === null ? null : JSON.stringify(patch.definition),
    version: patch.version + 1,
    actorId: input.actorId,
  }
  // Recheck every inherited revision within the same batch as the parent update.
  return [
    ...current.lineage.map(({ scope, version }) =>
      prepareRevisionCheck(
        db,
        sql`coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}),0)=${version}`,
      ),
    ),
    db
      .insert(featureIntentPolicy)
      .values(values)
      .onConflictDoUpdate({
        target: [featureIntentPolicy.scopeType, featureIntentPolicy.scopeId],
        set: values,
      }),
    db.insert(featureIntentPolicyRevision).values({
      ...values,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }),
  ]
}

/** Validate naming references without changing unrelated policy definitions.
 * @param types Effective model. @param properties Submitted field catalogue.
 * @returns Nothing; invalid dependencies are attached to the model tab by the parent form.
 */
function assertNameDependencies(
  types: readonly FeatureType[],
  properties: readonly {
    id?: string
    dataType?: string | null
    audience?: string | null
  }[],
): void {
  for (const type of types)
    for (const condition of type.nameRule?.conditions ?? []) {
      if (
        !properties.some(
          property =>
            property.id === condition.propertyId &&
            property.dataType === 'boolean' &&
            property.audience !== 'internal',
        )
      )
        throw new FeatureIntentPolicyError(
          'Name conditions require an available public boolean property.',
        )
    }
}

/** Fence dependencies when the Fields tab changes without rewriting the model.
 * @param db Request database. @param projectId Authorized project. @param properties Submitted catalogue.
 * @returns Policy ancestry checks for the parent's existing transaction.
 */
export async function prepareFeatureNameDependencyChecks(
  db: Database,
  projectId: string,
  properties: readonly {
    id?: string
    dataType?: string | null
    audience?: string | null
  }[],
): Promise<BatchItem<'sqlite'>[]> {
  const current = await readFeatureIntentPolicy(db, { type: 'project', id: projectId })
  assertNameDependencies(current.types, properties)
  return current.lineage.map(({ scope, version }) =>
    prepareRevisionCheck(
      db,
      sql`coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}),0)=${version}`,
    ),
  )
}
