// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  featureIntentPolicy,
  featureIntentPolicyRevision,
} from '../schema/featureIntentPolicy'
// DOMAIN
import { equalRevisionValue } from '#lib/revisions/merge.js'
import {
  FeatureRevisionContentSchema,
  type FeatureRevisionContent,
} from '#lib/revisions/featureContent.js'
import {
  featureRevisionBaseName,
  featureRevisionNameOverride,
} from '#lib/revisions/featureNaming.js'
import {
  generateFeatureName,
  nameBooleanValue,
  featureNameTextValue,
  type FeatureNameRule,
} from '#lib/features/locationPolicy.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { DisplayTemplateDefinitionSchema } from '#lib/templates/registry.js'
import { featureTemplateTitles } from '#lib/templates/featureValues.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
// SERVICES
import {
  readFeatureIntentPolicy,
  FeatureIntentPolicyError,
  type FeatureIntentScope,
} from './featureIntentPolicy'
import { readLocationResetSources } from './locationReset'
import { prepareFeatureEdit } from './featureLifecycle'
import { prepareRevisionCheck } from './revisionBatch'
import { isDisplayTemplateAvailable } from './displayTemplateScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureIntentSettingsPatch, FeatureType } from '#lib/features/intents.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
import type { BatchItem } from 'drizzle-orm/batch'

// TABLE OF CONTENTS
// 1. Scope, eligibility and name previews
// 2. Reviewed atomic adoption

export type FeatureNamingUpdatePreview = {
  token: string
  resetScopes?: { type: string; id: string }[]
  rows: {
    id: string
    status: 'update' | 'override' | 'descendant' | 'unavailable'
    names: { locale: string; before: string; after: string }[]
  }[]
}
type Input = { scope: FeatureIntentScope; patch: FeatureIntentSettingsPatch }
type Row = {
  id: string
  layerId: string
  projectId: string
  organisationId: string
  featureType: string | null
  currentRevisionId: string | null
  revisionVersion: number
  content: string | null
  explicit: number
  retired: number
}

/** Restrict candidates to the authorized owner, including the core Hub fallback.
 * @param scope Authorized settings owner. @returns Predicate for the joined feature/project/organisation query.
 */
function scopePredicate(scope: FeatureIntentScope): SQL {
  switch (scope.type) {
    case 'layer':
      return sql`f.layerId=${scope.id}`
    case 'project':
      return sql`f.projectId=${scope.id}`
    case 'organisation':
      return sql`f.organisationId=${scope.id}`
    case 'hub':
      return sql`coalesce(o.hubId,(SELECT id FROM hub WHERE code='core'))=${scope.id}`
  }
}
/** Find all saved descendant rules, including scopes without existing Features.
 * @param scope Authorized ancestor. @returns Bounded-parameter descendant membership query.
 */
function descendantQuery(scope: FeatureIntentScope): SQL {
  const org =
    scope.type === 'hub'
      ? sql`coalesce(o.hubId,(SELECT id FROM hub WHERE code='core'))=${scope.id}`
      : scope.type === 'organisation'
        ? sql`o.id=${scope.id}`
        : sql`0`
  const project = scope.type === 'project' ? sql`p.id=${scope.id}` : org
  return sql`SELECT fp.scopeType,fp.scopeId,fp.definition,fp.namingRules,fp.version FROM featureIntentPolicy fp WHERE
    (fp.scopeType='organisation' AND ${scope.type === 'hub' ? sql`1` : sql`0`} AND fp.scopeId IN (SELECT o.id FROM organisation o WHERE ${org})) OR
    (fp.scopeType='project' AND ${scope.type === 'hub' || scope.type === 'organisation' ? sql`1` : sql`0`} AND fp.scopeId IN (SELECT p.id FROM project p JOIN organisation o ON o.id=p.organisationId WHERE ${org})) OR
    (fp.scopeType='layer' AND ${scope.type !== 'layer' ? sql`1` : sql`0`} AND fp.scopeId IN (SELECT l.id FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE ${project}))
    ORDER BY fp.scopeType,fp.scopeId`
}
type ResetPolicy = {
  scopeType: string
  scopeId: string
  definition: string | null
  namingRules: string
  version: number
}

/** Resolve the creation-time default, including represented Locations.
 * @param type Effective type. @returns Accepted default rule, or no generated name.
 */
function defaultRule(type: FeatureType | undefined): FeatureNameRule | null {
  return (
    type?.nameRule ??
    (type &&
    (type.relation === 'represents' ||
      (!type.relation && (type.kind === 'place' || type.id === 'business')))
      ? { base: 'location', conditions: [] }
      : null)
  )
}
/** Render using accepted inputs only, preserving exact localized manual overrides.
 * @param db Request database. @param row Candidate scope. @param content Accepted or proposed snapshot.
 * @returns Localized names matching the naming rule's renderer.
 */
async function titles(
  db: Database,
  row: Row,
  content: FeatureRevisionContent,
): Promise<Record<string, string>> {
  const association = content.placement.location
  const sources = association
    ? await readLocationResetSources(db, { ...association, projectId: row.projectId })
    : null
  if (association && !sources)
    throw new FeatureIntentPolicyError(
      'Accepted Location inputs are unavailable. Refresh before updating names.',
    )
  const location =
    sources && association
      ? resolveFeatureLocation(
          sources.facts,
          sources.locationFacts.location,
          association.acceptedOverrides as FeatureLocationOverrides,
        )
      : undefined
  const rule = content.profile.nameTemplate?.rule
  if (rule?.registry) {
    const template = await db.get<{ definition: string }>(
      sql`SELECT r.definition FROM displayTemplateRevision r JOIN displayTemplate t ON t.id=r.templateId WHERE r.templateId=${rule.registry.id} AND r.version=${rule.registry.version} AND (t.organisationId IS NULL OR t.organisationId=${row.organisationId})`,
    )
    if (!template)
      throw new FeatureIntentPolicyError(
        'The naming template is unavailable for an existing Feature.',
      )
    const definition = DisplayTemplateDefinitionSchema.parse(
      JSON.parse(template.definition),
    )
    if (
      definition.target !== 'feature' ||
      !(await isDisplayTemplateAvailable(db, definition, row))
    )
      throw new FeatureIntentPolicyError(
        'The naming template requires unavailable properties.',
      )
    return featureTemplateTitles(content, definition, location)
  }
  return Object.fromEntries(
    Object.keys(content.translations).map(locale => {
      const base = featureRevisionBaseName(content, locale)
      const properties = Object.fromEntries(
        Object.entries(content.properties).map(([id, value]) => {
          const field = value.selection.definition
          const raw =
            Object.entries(value.translations).find(
              ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
            )?.[1]?.value ?? value.selection.value
          return [
            id,
            field.dataType === 'boolean' || field.component === 'ToggleField'
              ? nameBooleanValue(raw)
              : featureNameTextValue(raw, field.component),
          ]
        }),
      )
      return [
        locale,
        rule
          ? generateFeatureName({
              rule,
              locale,
              featureName: base,
              locationName:
                Object.entries(location?.names ?? {}).find(
                  ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
                )?.[1] ?? '',
              properties,
              override: featureRevisionNameOverride(content, locale),
            })
          : base,
      ]
    }),
  )
}
/** Build a deterministic preview and concurrency fences without mutating defaults or Features.
 * @param db Request database. @param input Authorized scope and proposed default patch.
 * @returns Public preview plus private accepted candidates and guards for atomic save.
 * @remarks Explicit assignment history is retained even when it happens to equal the old default.
 */
async function inspect(
  db: Database,
  input: Input,
): Promise<{
  preview: FeatureNamingUpdatePreview
  updates: { row: Row; content: FeatureRevisionContent }[]
  guards: SQL[]
  resets: ResetPolicy[]
}> {
  const current = await readFeatureIntentPolicy(db, input.scope)
  if (
    current.version !== input.patch.version ||
    current.fingerprint !== input.patch.fingerprint
  )
    throw new FeatureIntentPolicyError(
      'Naming defaults changed. Reload and review again.',
    )
  const options = input.patch.namingUpdateOptions
  const proposal = {
    scope: input.scope,
    patch: input.patch,
    resetNamingTypes: options?.resetRules ? options.typeIds : undefined,
  }
  const proposed = await readFeatureIntentPolicy(db, input.scope, proposal)
  const changed =
    options?.typeIds ??
    current.types
      .filter(
        type =>
          !equalRevisionValue(
            defaultRule(type),
            defaultRule(proposed.types.find(next => next.id === type.id)),
          ),
      )
      .map(type => type.id)
  if (changed.some(id => !proposed.types.some(type => type.id === id)))
    throw new FeatureIntentPolicyError('The selected feature type is unavailable.')
  const descendantsQuery = descendantQuery(input.scope)
  const savedDescendants = options?.resetRules
    ? await db.all<ResetPolicy>(descendantsQuery)
    : []
  const resets: ResetPolicy[] = []
  for (const saved of savedDescendants) {
    const rules = JSON.parse(saved.namingRules ?? '{}')
    let modified = false
    for (const id of changed) {
      if (Object.hasOwn(rules, id)) {
        delete rules[id]
        modified = true
      }
    }
    const definition =
      saved.definition === null
        ? null
        : JSON.parse(saved.definition).map((type: FeatureType | string) => {
            if (
              typeof type === 'string' ||
              !changed.includes(type.id) ||
              !type.nameRule
            )
              return type
            modified = true
            const { nameRule: _rule, ...rest } = type
            return rest
          })
    if (modified)
      resets.push({
        ...saved,
        namingRules: JSON.stringify(rules),
        definition: definition === null ? null : JSON.stringify(definition),
      })
  }
  const predicate = sql`(${scopePredicate(input.scope)}) AND (f.featureType IN (SELECT value FROM json_each(${JSON.stringify(changed)})) OR f.featureType IS NULL)`
  const membership = sql`SELECT f.id,f.currentRevisionId,f.revisionVersion,f.layerId,f.projectId,f.organisationId FROM feature f JOIN organisation o ON o.id=f.organisationId WHERE ${predicate} ORDER BY f.id`
  const snapshot = await db.all(membership)
  const rows =
    await db.all<Row>(sql`SELECT f.id,f.layerId,f.projectId,f.organisationId,f.featureType,f.currentRevisionId,f.revisionVersion,r.content,
    coalesce((WITH RECURSIVE history AS (
      SELECT er.id,er.previousRevisionId,er.changeSetId,0 depth FROM featureRevision er WHERE er.id=f.currentRevisionId AND er.featureId=f.id
      UNION ALL SELECT er.id,er.previousRevisionId,er.changeSetId,h.depth+1 FROM featureRevision er JOIN history h ON er.id=h.previousRevisionId WHERE er.featureId=f.id
    ) SELECT c.reason='Change central display template' FROM history h JOIN revisionChangeSet c ON c.id=h.changeSetId WHERE c.reason IN ('Change central display template','Reset feature naming rule to default') ORDER BY h.depth LIMIT 1),0) explicit,
    EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=f.id AND i.role='input' AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.featureId=f.id AND o.role='output')) retired
    FROM feature f JOIN organisation o ON o.id=f.organisationId LEFT JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id WHERE ${predicate} ORDER BY f.id`)
  const guards: SQL[] = [
    sql`(SELECT json_group_array(json_object('id',id,'currentRevisionId',currentRevisionId,'revisionVersion',revisionVersion,'layerId',layerId,'projectId',projectId,'organisationId',organisationId)) FROM (${membership}))=${JSON.stringify(snapshot)}`,
  ]
  if (options?.resetRules)
    guards.push(
      sql`(SELECT json_group_array(json_object('scopeType',scopeType,'scopeId',scopeId,'definition',definition,'namingRules',namingRules,'version',version)) FROM (${descendantsQuery}))=${JSON.stringify(savedDescendants)}`,
    )
  const preview: FeatureNamingUpdatePreview = {
    token: '',
    rows: [],
    resetScopes: resets.map(row => ({ type: row.scopeType, id: row.scopeId })),
  }
  const updates: { row: Row; content: FeatureRevisionContent }[] = []
  const policies = new Map<
    string,
    Awaited<ReturnType<typeof readFeatureIntentPolicy>>
  >()
  const descendants = new Map<
    string,
    Awaited<ReturnType<typeof readFeatureIntentPolicy>>
  >()
  const nextPolicies = new Map<
    string,
    Awaited<ReturnType<typeof readFeatureIntentPolicy>>
  >()
  const signatures: unknown[] = [
    input.scope,
    input.patch.definition,
    input.patch.namingRules,
    options,
    savedDescendants,
    snapshot,
  ]
  for (const row of rows) {
    let policy = policies.get(row.layerId)
    if (!policy) {
      policy = await readFeatureIntentPolicy(db, { type: 'layer', id: row.layerId })
      policies.set(row.layerId, policy)
      signatures.push(policy.fingerprint)
      for (const item of policy.lineage)
        guards.push(
          sql`coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=${item.scope.type} AND scopeId=${item.scope.id}),0)=${item.version}`,
        )
    }
    const content = row.content
      ? FeatureRevisionContentSchema.parse(JSON.parse(row.content))
      : null
    // Older accepted records may have no type key. Only a unique matching default can identify their naming source.
    const matches = content
      ? policy.types.filter(type =>
          equalRevisionValue(
            content.profile.nameTemplate?.rule ?? null,
            defaultRule(type),
          ),
        )
      : []
    const featureType =
      row.featureType ??
      content?.profile.featureType ??
      (matches.length === 1 ? matches[0].id : null)
    if (featureType && !changed.includes(featureType)) continue
    const result: FeatureNamingUpdatePreview['rows'][number] = {
      id: row.id,
      status: featureType ? 'update' : 'unavailable',
      names: [],
    }
    preview.rows.push(result)
    // A nearer naming override shields its complete subtree, even when the rule is identical.
    const index = policy.lineage.findIndex(
      item => item.scope.type === input.scope.type && item.scope.id === input.scope.id,
    )
    for (const child of policy.lineage.slice(index + 1)) {
      const key = `${child.scope.type}:${child.scope.id}`
      let own = descendants.get(key)
      if (!own) {
        own = await readFeatureIntentPolicy(db, child.scope)
        descendants.set(key, own)
      }
      if (
        !options?.resetRules &&
        featureType &&
        Object.hasOwn(own.namingRules ?? {}, featureType)
      )
        result.status = 'descendant'
    }
    if (result.status === 'update' && (!content || row.retired))
      result.status = 'unavailable'
    if (
      content &&
      result.status === 'update' &&
      ((!options?.resetRules &&
        (row.explicit ||
          !equalRevisionValue(
            content.profile.nameTemplate?.rule ?? null,
            defaultRule(policy.types.find(type => type.id === featureType)),
          ))) ||
        (!options?.resetTitles &&
          !options?.resetRules &&
          Object.keys(content.translations).some(
            locale => featureRevisionNameOverride(content, locale) !== null,
          )))
    )
      result.status = 'override'
    const before = await db.all<{ locale: string; title: string }>(
      sql`SELECT locale,title FROM featureI18n WHERE featureId=${row.id} ORDER BY locale`,
    )
    result.names = before.map(value => ({
      locale: value.locale,
      before: value.title,
      after: value.title,
    }))
    if (result.status !== 'update' || !content) continue
    let nextPolicy = nextPolicies.get(row.layerId)
    if (!nextPolicy) {
      nextPolicy = await readFeatureIntentPolicy(
        db,
        { type: 'layer', id: row.layerId },
        proposal,
      )
      nextPolicies.set(row.layerId, nextPolicy)
    }
    const nextRule = defaultRule(nextPolicy.types.find(type => type.id === featureType))
    const next = structuredClone(content)
    // Preserve historical authored input maps; removing a template must retain those inputs too.
    // Retained dedicated titles stay visible even when the replacement has no template.
    for (const locale of Object.keys(next.translations))
      next.translations[locale].title.value =
        !nextRule && !options?.resetTitles
          ? (featureRevisionNameOverride(content, locale) ??
            featureRevisionBaseName(content, locale))
          : featureRevisionBaseName(content, locale)
    next.profile.nameTemplate = nextRule
      ? { ...next.profile.nameTemplate, rule: nextRule }
      : null
    // Reset only dedicated overrides; keep authored base names as inputs to the new template.
    if (options?.resetTitles) {
      for (const translation of Object.values(next.translations))
        translation.nameOverride = null
      if (next.profile.nameTemplate) next.profile.nameTemplate.overrides = {}
    }
    const after = await titles(db, row, next)
    result.names = Object.entries(after).map(([locale, after]) => ({
      locale,
      before: before.find(value => value.locale === locale)?.title ?? '',
      after,
    }))
    updates.push({ row, content: next })
  }
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([signatures, preview.rows])),
  )
  preview.token = Array.from(new Uint8Array(bytes), value =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  return { preview, updates, guards, resets }
}
/** Preview proposed default adoption without saving anything.
 * @param db Request database. @param input Authorized owner and draft policy.
 * @returns Before/after names and explicit exclusion reasons.
 */
export async function previewFeatureNamingUpdate(
  db: Database,
  input: Input,
): Promise<FeatureNamingUpdatePreview> {
  return (await inspect(db, input)).preview
}
/** Prepare reviewed naming changes inside the parent's atomic policy transaction.
 * @param db Request database. @param input Attributed policy save with the inspected token.
 * @returns Guarded, attributed Feature revisions; stale previews fail before any write.
 */
export async function prepareFeatureNamingUpdate(
  db: Database,
  input: FeatureIntentSettingsPatch & { scope: FeatureIntentScope; actorId: string },
): Promise<BatchItem<'sqlite'>[]> {
  const inspected = await inspect(db, { scope: input.scope, patch: input })
  if (inspected.preview.token !== input.namingUpdateToken)
    throw new FeatureIntentPolicyError(
      'Existing Features or naming defaults changed. Review the name preview again.',
    )
  const statements: BatchItem<'sqlite'>[] = inspected.guards.map(guard =>
    prepareRevisionCheck(db, guard),
  )
  // Record descendant resets in the same guarded transaction as all Feature revisions.
  for (const row of inspected.resets) {
    const values = {
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      definition: row.definition,
      namingRules: row.namingRules,
      version: row.version + 1,
      actorId: input.actorId,
    }
    statements.push(
      db
        .update(featureIntentPolicy)
        .set(values)
        .where(
          and(
            eq(featureIntentPolicy.scopeType, row.scopeType),
            eq(featureIntentPolicy.scopeId, row.scopeId),
            eq(featureIntentPolicy.version, row.version),
          ),
        ),
      db.insert(featureIntentPolicyRevision).values({
        ...values,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    )
  }
  for (const { row, content } of inspected.updates) {
    if (!row.currentRevisionId)
      throw new FeatureIntentPolicyError('Feature history is unavailable.')
    const prepared = await prepareFeatureEdit(db, {
      featureId: row.id,
      expectedRevisionId: row.currentRevisionId,
      expectedVersion: row.revisionVersion,
      actorId: input.actorId,
      reason: input.namingUpdateOptions?.resetRules
        ? 'Reset feature naming rule to default'
        : 'Apply reviewed naming default',
      revisionBoundary: true,
      guard: sql`EXISTS(SELECT 1 FROM feature f JOIN organisation o ON o.id=f.organisationId WHERE f.id=${row.id} AND ${scopePredicate(input.scope)})`,
      derive: () => content,
      validate: () => [],
    })
    if (!prepared)
      throw new FeatureIntentPolicyError(
        'A Feature changed. Review the name preview again.',
      )
    statements.push(prepareRevisionCheck(db, prepared.guard), ...prepared.statements)
  }
  return statements
}
