import {
  targetLocationKinds,
  isFeatureNameBooleanField,
  isFeatureNameTextField,
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
  FeatureNamingRulesSchema,
  type FeatureNamingRules,
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
  namingRules?: FeatureNamingRules
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
): Promise<{ definition: string | null; namingRules: string; version: number }> {
  return (
    (await db.get<{ definition: string | null; namingRules: string; version: number }>(
      sql`SELECT definition,namingRules,version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}`,
    )) ?? { definition: null, namingRules: '{}', version: 0 }
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
  const catalogue =
    scope.type === 'layer'
      ? definition === null
        ? inheritedTypes
        : definition.every(value => typeof value === 'string')
          ? resolveFeatureTypes(inheritedTypes, null, definition as string[])
          : FeatureTypesSchema.parse(definition)
      : definition === null
        ? inheritedTypes
        : FeatureTypesSchema.parse(definition)
  // Naming follows its own per-type inheritance, even when the catalogue is customized.
  const namingRules = FeatureNamingRulesSchema.parse({
    ...Object.fromEntries(
      (definition ?? []).flatMap(type =>
        typeof type !== 'string' && type.nameRule ? [[type.id, type.nameRule]] : [],
      ),
    ),
    ...JSON.parse(own.namingRules ?? '{}'),
  })
  const types = catalogue.map(type => {
    const { nameRule: _stored, ...rest } = type
    const rule =
      (Object.hasOwn(namingRules, type.id) ? namingRules[type.id] : undefined) ??
      inheritedTypes.find(parent => parent.id === type.id)?.nameRule
    return { ...rest, ...(rule ? { nameRule: rule } : {}) }
  })
  return {
    types,
    inheritedTypes,
    namingRules,
    definition,
    version: own.version,
    fingerprint: JSON.stringify([scope, own.version, parentFingerprint]),
    lineage: [...lineage, { scope, version: own.version }],
  }
}

/** Separate legacy embedded naming rules from catalogue edits.
 * @param definition Authored catalogue or inheritance marker. @param rules Explicit per-type overrides.
 * @param retained Existing independent overrides when an older caller omits the field.
 * @returns Independent storage values; explicit empty rules reset all naming overrides.
 */
function separateNaming(
  definition: FeatureType[] | string[] | null,
  rules: FeatureNamingRules | undefined,
  retained: FeatureNamingRules,
): { definition: FeatureType[] | string[] | null; namingRules: FeatureNamingRules } {
  const embedded = Object.fromEntries(
    (definition ?? []).flatMap(type =>
      typeof type !== 'string' && type.nameRule ? [[type.id, type.nameRule]] : [],
    ),
  )
  return {
    definition:
      (definition?.map(type => {
        if (typeof type === 'string') return type
        const { nameRule: _rule, ...rest } = type
        return rest
      }) as FeatureType[] | string[] | null) ?? null,
    namingRules: FeatureNamingRulesSchema.parse(rules ?? { ...retained, ...embedded }),
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
    namingRules?: FeatureNamingRules
    version: number
    actorId: string
    guard: SQL
  },
): Promise<boolean> {
  const current = await readFeatureIntentPolicy(db, input.scope)
  const prepared = separateNaming(
    input.definition,
    input.namingRules,
    current.namingRules ?? {},
  )
  const definition =
    prepared.definition === null ? null : JSON.stringify(prepared.definition)
  const guard = sql`${input.guard} AND coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${input.scope.type} AND scopeId=${input.scope.id}),0)=${input.version}`
  const values = {
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    definition,
    namingRules: JSON.stringify(prepared.namingRules),
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
      component?: string | null
      audience?: string | null
    }[]
  },
): Promise<BatchItem<'sqlite'>[] | null> {
  const patch = FeatureIntentSettingsPatchSchema.parse(input)
  const current = await readFeatureIntentPolicy(db, input.scope)
  if (current.version !== patch.version || current.fingerprint !== patch.fingerprint)
    return null
  const prepared = separateNaming(
    patch.definition,
    patch.namingRules,
    current.namingRules ?? {},
  )
  const catalogue = prepared.definition ?? current.inheritedTypes
  const effectiveTypes = (catalogue as FeatureType[]).map(type => ({
    ...type,
    nameRule:
      (Object.hasOwn(prepared.namingRules, type.id)
        ? prepared.namingRules[type.id]
        : undefined) ??
      current.inheritedTypes.find(parent => parent.id === type.id)?.nameRule,
  }))
  if (
    Object.keys(prepared.namingRules).some(
      id => !effectiveTypes.some(type => type.id === id),
    )
  )
    throw new FeatureIntentPolicyError(
      'Naming overrides must belong to an available feature type.',
    )
  // Validate all effective naming dependencies before composing any writes.
  let dependencyChecks: BatchItem<'sqlite'>[] = []
  if (
    effectiveTypes.some(type => type.nameRule?.conditions.length) ||
    (input.scope.type === 'project' && input.nameProperties)
  ) {
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
    assertNameDependencies(effectiveTypes, properties)
    if (input.scope.type === 'project')
      dependencyChecks = await prepareFeatureNameDependencyChecks(
        db,
        input.scope.id,
        properties,
        effectiveTypes,
      )
  }
  // Immutable central versions must belong to the consumer's Organisation or the community.
  const templateChecks: BatchItem<'sqlite'>[] = []
  for (const type of effectiveTypes) {
    const reference = type.nameRule?.registry
    if (!reference) continue
    const owner =
      input.scope.type === 'hub'
        ? sql`NULL`
        : input.scope.type === 'project'
          ? sql`(SELECT organisationId FROM project WHERE id=${input.scope.id})`
          : sql`(SELECT p.organisationId FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=${input.scope.id})`
    const guard = sql`EXISTS(SELECT 1 FROM displayTemplate t JOIN displayTemplateRevision r ON r.templateId=t.id
      WHERE t.id=${reference.id} AND r.version=${reference.version} AND (t.organisationId IS NULL OR t.organisationId IS ${owner}))`
    const available = await db.get<{ ok: number }>(sql`SELECT ${guard} ok`)
    if (!available?.ok)
      throw new FeatureIntentPolicyError(
        'The selected template version is unavailable in this scope.',
      )
    templateChecks.push(prepareRevisionCheck(db, guard))
  }
  const values = {
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    definition:
      prepared.definition === null ? null : JSON.stringify(prepared.definition),
    namingRules: JSON.stringify(prepared.namingRules),
    version: patch.version + 1,
    actorId: input.actorId,
  }
  // Recheck every inherited revision within the same batch as the parent update.
  return [
    ...dependencyChecks,
    ...templateChecks,
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
    component?: string | null
    audience?: string | null
  }[],
): void {
  for (const type of types)
    for (const condition of type.nameRule?.registry
      ? []
      : (type.nameRule?.conditions ?? [])) {
      if (
        !properties.some(
          property =>
            property.id === condition.propertyId &&
            (condition.test === 'hasValue'
              ? isFeatureNameTextField(property)
              : isFeatureNameBooleanField(property)),
        )
      )
        throw new FeatureIntentPolicyError(
          'Name conditions require an available boolean or toggle property, or a short-text or phone property for a presence condition.',
        )
    }
}

/** Fence dependencies when the Fields tab changes without rewriting the model.
 * @param db Request database. @param projectId Authorized project. @param properties Submitted catalogue.
 * @param projectTypes Proposed effective project types when Fields and Model change together.
 * @returns Policy ancestry checks for the parent's existing transaction.
 */
export async function prepareFeatureNameDependencyChecks(
  db: Database,
  projectId: string,
  properties: readonly {
    id?: string
    dataType?: string | null
    component?: string | null
    audience?: string | null
  }[],
  projectTypes?: FeatureType[],
): Promise<BatchItem<'sqlite'>[]> {
  const current = await readFeatureIntentPolicy(db, { type: 'project', id: projectId })
  const proposed = projectTypes ?? current.types
  assertNameDependencies(proposed, properties)
  const lineage = [...current.lineage]
  // A project field may also be referenced by a layer's independent naming override.
  const layers = await db.all<{ id: string }>(
    sql`SELECT id FROM layer WHERE projectId=${projectId}`,
  )
  for (const layer of layers) {
    const policy = await readFeatureIntentPolicy(db, { type: 'layer', id: layer.id })
    const definition = policy.definition
    const catalogue =
      definition === null
        ? proposed
        : definition.every(type => typeof type === 'string')
          ? resolveFeatureTypes(proposed, null, definition as string[])
          : (definition as FeatureType[])
    const rules = policy.namingRules ?? {}
    assertNameDependencies(
      catalogue.map(type => ({
        ...type,
        nameRule:
          (Object.hasOwn(rules, type.id) ? rules[type.id] : undefined) ??
          proposed.find(parent => parent.id === type.id)?.nameRule,
      })),
      properties,
    )
    lineage.push(...policy.lineage)
  }
  const unique = new Map(
    lineage.map(entry => [`${entry.scope.type}:${entry.scope.id}`, entry]),
  )
  return [...unique.values()].map(({ scope, version }) =>
    prepareRevisionCheck(
      db,
      sql`coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${scope.type} AND scopeId=${scope.id}),0)=${version}`,
    ),
  )
}
