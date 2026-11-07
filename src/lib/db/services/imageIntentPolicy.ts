// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// DOMAIN
import { DEFAULT_IMAGE_INTENTS, ImageIntentCatalogueSchema, resolveImageIntent } from '#lib/images/intents.js'
// SCHEMA
import { hubImageIntentPolicy, projectImageIntentPolicy, imageIntentPolicyRevision } from '../schema/imageIntentPolicy'
import { featureImage } from '../schema/image'
// SERVICES
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { ImageIntentDefinition } from '#lib/images/intents.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
//
// 1. POLICY RESOLUTION
// - readImageIntentPolicy
// - readFeatureImageIntentPolicy
// - resolvePolicyImageIntent
// 2. ATOMIC GALLERY AND POLICY CHANGES
// - normalizeGalleryIntents
// - prepareImageIntentGalleryChange
// - prepareImageIntentPolicySave
// - saveImageIntentPolicy
// ---

export type ImageIntentScope = { type: 'hub' | 'project'; id: string }
export type ImageIntentPolicy = {
  intents: ImageIntentDefinition[]
  redirects: Record<string, string>
  inherited: boolean
  autoPublishUnclassified: boolean
  version: number
  hubVersion: number
  hubId: string | null
  guard: SQL
}

/**
 * Resolves a Project override or its owning Hub's independently versioned catalogue.
 * @param db Request database.
 * @param scope Persisted, authorized Hub or Project identity.
 * @returns Effective definitions and a guard for writes based on this exact policy.
 * @remarks The pre-migration fallback supports retained databases; missing resources fail closed.
 */
export async function readImageIntentPolicy(db: Database, scope: ImageIntentScope): Promise<ImageIntentPolicy> {
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='hubImageIntentPolicy' AND type='table'`)
  if (!storage?.n) return { intents: structuredClone([...DEFAULT_IMAGE_INTENTS]), redirects: {}, inherited: scope.type === 'project', autoPublishUnclassified: true, version: -1, hubVersion: -1, hubId: null, guard: sql`1` }
  const parent = scope.type === 'project'
    ? await db.get<{ hubId: string | null; organisationId: string }>(sql`SELECT o.hubId,p.organisationId FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${scope.id}`)
    : await db.get<{ hubId: string; organisationId?: string }>(sql`SELECT id hubId FROM hub WHERE id=${scope.id}`)
  if (!parent) throw new Error('Image intent settings resource is unavailable')
  const core = parent.hubId ? null : await db.get<{ id: string }>(sql`SELECT id FROM hub WHERE code='core'`)
  const hubId = parent.hubId ?? core?.id ?? null
  const inherited = hubId ? await db.select().from(hubImageIntentPolicy).where(eq(hubImageIntentPolicy.hubId, hubId)).get() : undefined
  const own = scope.type === 'project' ? await db.select().from(projectImageIntentPolicy).where(eq(projectImageIntentPolicy.projectId, scope.id)).get() : undefined
  const hubGuard = hubId ? sql`COALESCE((SELECT version FROM hubImageIntentPolicy WHERE hubId=${hubId}),-1)=${inherited?.version ?? -1}` : sql`NOT EXISTS(SELECT 1 FROM hub WHERE code='core')`
  const projectGuard = scope.type === 'project' ? sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${scope.id} AND p.organisationId=${parent.organisationId!} AND o.hubId IS ${parent.hubId})
    AND COALESCE((SELECT version FROM projectImageIntentPolicy WHERE projectId=${scope.id}),-1)=${own?.version ?? -1}` : sql`1`
  return {
    intents: ImageIntentCatalogueSchema.parse(own?.intents ?? inherited?.intents ?? DEFAULT_IMAGE_INTENTS),
    redirects: { ...inherited?.redirects, ...own?.redirects },
    inherited: scope.type === 'project' && !own?.intents,
    autoPublishUnclassified: own?.autoPublishUnclassified ?? true,
    version: scope.type === 'hub' ? inherited?.version ?? -1 : own?.version ?? -1,
    hubVersion: inherited?.version ?? -1,
    hubId,
    guard: sql`(${hubGuard}) AND (${projectGuard})`,
  }
}

/**
 * Resolves policy from a Feature's current persisted ancestry.
 * @param db Request database.
 * @param featureId Feature identity.
 * @returns Policy guarded against concurrent Project moves and settings changes.
 */
export async function readFeatureImageIntentPolicy(db: Database, featureId: string): Promise<ImageIntentPolicy> {
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='hubImageIntentPolicy' AND type='table'`)
  if (!storage?.n) return readImageIntentPolicy(db, { type: 'project', id: '' })
  const row = await db.get<{ projectId: string }>(sql`SELECT projectId FROM feature WHERE id=${featureId}`)
  if (!row) throw new Error('Feature is unavailable')
  const policy = await readImageIntentPolicy(db, { type: 'project', id: row.projectId })
  return { ...policy, guard: sql`(${policy.guard}) AND EXISTS(SELECT 1 FROM feature WHERE id=${featureId} AND projectId=${row.projectId})` }
}

/**
 * Resolves retained proposal identities through explicit catalogue removal decisions.
 * @param policy Current policy and durable reassignment aliases.
 * @param id Requested or historical identity.
 * @param classify Whether to assign Unclassified to Catch-All.
 * @returns Current assignment with policy-derived visibility.
 */
export function resolvePolicyImageIntent(policy: ImageIntentPolicy, id: string, classify = false): { intent: string; isPublished: boolean } {
  const seen = new Set<string>()
  while (!policy.intents.some(item => item.id === id) && policy.redirects[id]) {
    if (seen.has(id)) throw new Error('Image intent reassignment contains a cycle')
    seen.add(id)
    id = policy.redirects[id]
  }
  return resolveImageIntent(policy.intents, id, classify)
}

/**
 * Applies authoritative intent visibility to a new accepted gallery snapshot.
 * @param content Mutable candidate content, never a stored historical revision.
 * @param policy Effective catalogue.
 * @param classify Whether this command explicitly includes unclassified images.
 * @returns The same candidate with derived visibility and stable reassigned identities.
 */
export function normalizeGalleryIntents(content: FeatureRevisionContent, policy: ImageIntentPolicy, classify = false): FeatureRevisionContent {
  for (const entry of Object.values(content.gallery.entries)) Object.assign(entry, resolvePolicyImageIntent(policy, entry.intent, classify))
  return content
}

/**
 * Normalizes accepted edits while retaining the legacy contribution review boundary.
 * @param db Request database.
 * @param featureId Current Feature identity.
 * @param content Candidate accepted content.
 * @param policy Effective intent catalogue.
 * @returns Normalized candidate with pending private evidence still private.
 */
export async function normalizeAcceptedGalleryIntents(db: Database, featureId: string, content: FeatureRevisionContent, policy: ImageIntentPolicy): Promise<FeatureRevisionContent> {
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='task' AND type='table'`)
  const held = new Set(storage?.n ? (await db.all<{ imageId: string }>(sql`SELECT ti.imageId FROM taskImage ti JOIN task t ON t.id=ti.taskId WHERE t.featureId=${featureId} AND t.isReviewed=0`)).map(row => row.imageId) : [])
  const privateEvidence = Object.entries(content.gallery.entries).filter(([id, entry]) => held.has(id) && !entry.isPublished).map(([id]) => id)
  normalizeGalleryIntents(content, policy)
  for (const id of privateEvidence) content.gallery.entries[id].isPublished = false
  return content
}

/**
 * Captures and projects an approved catalogue/publication change without touching image bytes.
 * @param db Request database.
 * @param input Exact Feature scope, effective policy and optional classification choice.
 * @returns Statements to execute inside the caller's guarded transaction.
 * @remarks Existing contributor evidence remains unpublished until accepted. Historical snapshots stay immutable.
 */
export async function prepareImageIntentGalleryChange(db: Database, input: {
  featureId: string; actorId: string; guard: SQL; policy: ImageIntentPolicy; classify?: boolean; imageIds?: readonly string[]
}): Promise<BatchItem<'sqlite'>[]> {
  const rows = await db.select().from(featureImage).where(eq(featureImage.featureId, input.featureId))
  const taskStorage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='task' AND type='table'`)
  const held = new Set(taskStorage?.n ? (await db.all<{ imageId: string }>(sql`SELECT ti.imageId FROM taskImage ti JOIN task t ON t.id=ti.taskId WHERE t.featureId=${input.featureId} AND t.isReviewed=0`)).map(row => row.imageId) : [])
  const active = input.classify ? new Set((await db.all<{ id: string }>(sql`SELECT i.id FROM image i JOIN featureImage fi ON fi.imageId=i.id WHERE fi.featureId=${input.featureId} AND i.isArchived=0`)).map(row => row.id)) : null
  const selected = input.imageIds ? new Set(input.imageIds) : null
  const changes = rows.filter(row => !input.classify || (row.intent === 'undefined' && active?.has(row.imageId) && !held.has(row.imageId) && (!selected || selected.has(row.imageId)))).map(row => {
    const next = resolvePolicyImageIntent(input.policy, row.intent, input.classify && !held.has(row.imageId))
    if (held.has(row.imageId) && !(row.localIsPublished ?? row.isPublished)) next.isPublished = false
    return { row, next }
  })
    .filter(({ row, next }) => row.intent !== next.intent || (row.localIsPublished ?? row.isPublished) !== next.isPublished)
  if (!changes.length) return []
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input,
    reason: 'Image intents determine gallery publication',
    derive: previous => {
      const content = structuredClone(previous)
      for (const { row, next } of changes) if (content.gallery.entries[row.imageId]) Object.assign(content.gallery.entries[row.imageId], next)
      return content
    },
  })
  const now = new Date().toISOString()
  const writes = changes.map(({ row, next }) => db.update(featureImage).set({
    intent: next.intent,
    localIsPublished: next.isPublished,
    isPublished: sql`${Number(next.isPublished)} AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND isPublished=1 AND isArchived=0)`,
    publisherId: next.isPublished ? row.publisherId ?? input.actorId : null,
    publishedAt: next.isPublished ? row.publishedAt ?? now : null,
  }).where(and(eq(featureImage.featureId, input.featureId), eq(featureImage.imageId, row.imageId))))
  return [...capture.before, ...writes, ...capture.after]
}

/**
 * Prepares settings and accepted galleries for the parent form transaction.
 * @param db Request database.
 * @param input Authorized scope, inspected versions and explicit deletion replacements.
 * @returns Guarded statements, or null when the inspected settings are stale.
 * @remarks A null Project catalogue resumes Hub inheritance. Removed identities remain aliases for old proposals.
 */
export async function prepareImageIntentPolicySave(db: Database, input: {
  scope: ImageIntentScope; actorId: string; guard: SQL; version: number; hubVersion: number;
  intents: ImageIntentDefinition[] | null; autoPublishUnclassified: boolean; reassignments: Record<string, string>
}): Promise<BatchItem<'sqlite'>[] | null> {
  const previous = await readImageIntentPolicy(db, input.scope)
  if (previous.version !== input.version || previous.hubVersion !== input.hubVersion) return null
  if (input.scope.type === 'hub' && input.intents === null) throw new Error('A Hub must define its own intents')
  const inherited = previous.hubId ? await readImageIntentPolicy(db, { type: 'hub', id: previous.hubId }) : previous
  const intents = ImageIntentCatalogueSchema.parse(input.intents ?? inherited.intents)
  const redirects = { ...previous.redirects }
  for (const old of previous.intents) if (!intents.some(item => item.id === old.id)) {
    const target = input.reassignments[old.id] ?? 'undefined'
    if (!intents.some(item => item.id === target)) throw new Error('Choose an available replacement intent')
    redirects[old.id] = target
  }
  const next = { ...previous, intents, redirects, autoPublishUnclassified: input.autoPublishUnclassified }
  // Presentation edits never inspect or reconcile existing galleries.
  const previousById = new Map(previous.intents.map(intent => [intent.id, intent]))
  const nextById = new Map(intents.map(intent => [intent.id, intent]))
  const galleryChanged = previous.intents.some(intent => {
    const replacement = nextById.get(intent.id)
    return !replacement || replacement.isPublished !== intent.isPublished
  })
  const catalogueChanged = previous.intents.length !== intents.length || intents.some(intent => {
    const old = previousById.get(intent.id)
    return !old || old.label !== intent.label || old.isPublished !== intent.isPublished
  })
  const recordHistory = catalogueChanged || previous.inherited !== (input.intents === null)
    || previous.autoPublishUnclassified !== input.autoPublishUnclassified
  let guard = sql`(${input.guard}) AND (${previous.guard})`
  const statements: BatchItem<'sqlite'>[] = []
  if (galleryChanged) {
    const storage = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('featureIdentityOperationMember','featureRevisionHead')`)
    const tables = new Set(storage.map(row => row.name))
    const live = tables.has('featureIdentityOperationMember')
      ? sql`NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=f.id AND i.role='input' AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=f.id))`
      : tables.has('featureRevisionHead') ? sql`NOT EXISTS(SELECT 1 FROM featureRevisionHead h WHERE h.featureId=f.id AND h.state<>'active')` : sql`1`
    const ownerScope = input.scope.type === 'project' ? sql`f.projectId=${input.scope.id}`
      : sql`COALESCE(o.hubId,(SELECT id FROM hub WHERE code='core'))=${input.scope.id}
        AND NOT EXISTS(SELECT 1 FROM projectImageIntentPolicy p WHERE p.projectId=f.projectId AND p.intents IS NOT NULL)`
    const scope = sql`(${ownerScope}) AND (${live})`
    const targets = await db.all<{ id: string }>(sql`SELECT f.id FROM feature f JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId
      WHERE (${scope}) AND EXISTS(SELECT 1 FROM featureImage fi WHERE fi.featureId=f.id)`)
    const assignments = sql`SELECT fi.featureId,fi.imageId,fi.intent,fi.isPublished,fi.localIsPublished FROM featureImage fi JOIN feature f ON f.id=fi.featureId JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId WHERE (${scope})`
    const beforeAssignments = await db.all(assignments)
    const sameAssignments = sql`NOT EXISTS(SELECT featureId,imageId,intent,isPublished,localIsPublished FROM (${assignments}) EXCEPT SELECT json_extract(value,'$.featureId'),json_extract(value,'$.imageId'),json_extract(value,'$.intent'),json_extract(value,'$.isPublished'),json_extract(value,'$.localIsPublished') FROM json_each(${JSON.stringify(beforeAssignments)})) AND (SELECT count(*) FROM (${assignments}))=${beforeAssignments.length}`
    guard = sql`(${guard}) AND (${sameAssignments})`
    for (const target of targets) statements.push(...await prepareImageIntentGalleryChange(db, {
      featureId: target.id, actorId: input.actorId, policy: next, guard: sql`(${input.guard}) AND (${previous.guard})`,
    }))
    // JSON binds keep unbounded gallery/catalogue sets within D1's parameter budget.
    statements.unshift(prepareRevisionCheck(db, sql`NOT EXISTS(SELECT f.id FROM feature f JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId
      WHERE (${scope}) AND EXISTS(SELECT 1 FROM featureImage fi WHERE fi.featureId=f.id)
      EXCEPT SELECT value FROM json_each(${JSON.stringify(targets.map(row => row.id))}))`))
  }
  if (input.scope.type === 'hub') statements.push(db.insert(hubImageIntentPolicy).values({ hubId: input.scope.id, intents, redirects, version: previous.version + 1 })
    .onConflictDoUpdate({ target: hubImageIntentPolicy.hubId, set: { intents, redirects, version: previous.version + 1 } }))
  else statements.push(db.insert(projectImageIntentPolicy).values({ projectId: input.scope.id, intents: input.intents, redirects,
    autoPublishUnclassified: input.autoPublishUnclassified, version: previous.version + 1 })
    .onConflictDoUpdate({ target: projectImageIntentPolicy.projectId, set: { intents: input.intents, redirects,
      autoPublishUnclassified: input.autoPublishUnclassified, version: previous.version + 1 } }))
  if (recordHistory) statements.push(db.insert(imageIntentPolicyRevision).values({ id: crypto.randomUUID(), scopeType: input.scope.type,
    scopeId: input.scope.id, actorId: input.actorId, createdAt: new Date().toISOString(),
    previous: JSON.stringify({ intents: previous.intents, inherited: previous.inherited, autoPublishUnclassified: previous.autoPublishUnclassified }),
    current: JSON.stringify({ intents, inherited: input.intents === null, autoPublishUnclassified: input.autoPublishUnclassified, reassignments: input.reassignments }),
  }))
  return [prepareRevisionCheck(db, guard), ...statements]
}

/**
 * Commits a standalone policy edit using the same preparation as the resource forms.
 * @param db Request database.
 * @param input Authorized settings and inspected versions.
 * @returns Whether the complete edit committed.
 */
export async function saveImageIntentPolicy(db: Database, input: Parameters<typeof prepareImageIntentPolicySave>[1]): Promise<boolean> {
  const statements = await prepareImageIntentPolicySave(db, input)
  return statements !== null && (await executeRevisionBatch(db, input.guard, statements)) !== null
}
