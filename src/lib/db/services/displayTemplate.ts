// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DOMAIN
import {
  DisplayTemplateDefinitionSchema,
  type DisplayTemplateDefinition,
  type DisplayTemplateRecord,
} from '#lib/templates/registry.js'
// SCHEMA
import { displayTemplate, displayTemplateRevision } from '../schema/displayTemplate'
// SERVICES
import { executeRevisionBatch } from './revisionBatch'
import {
  displayTemplateDependencies,
  displayTemplateDependencyGuard,
  displayTemplatePropertyGuard,
  isDisplayTemplateAvailable,
  type DisplayTemplateContext,
} from './displayTemplateScope'
// TYPES
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Authorized catalogue reads
// 2. Version-fenced publication

/** List central and selected Organisation templates after scope authorization.
 * @param db Request database. @param organisationId Authorized owner or community-only scope.
 * @param context Optional consumer project/hub, or a management catalogue request.
 * @returns Current definitions; private templates from other Organisations are excluded.
 */
export async function listDisplayTemplates(
  db: Database,
  organisationId: string | null,
  context?: Omit<DisplayTemplateContext, 'organisationId'> & { catalogue?: boolean },
): Promise<DisplayTemplateRecord[]> {
  const rows = await db.all<{
    id: string
    organisationId: string | null
    version: number
    definition: string
  }>(sql`
    SELECT t.id,t.organisationId,t.version,r.definition FROM displayTemplate t
    JOIN displayTemplateRevision r ON r.templateId=t.id AND r.version=t.version
    WHERE t.organisationId IS NULL OR t.organisationId=${organisationId}
    ORDER BY t.code,t.id LIMIT 500`)
  const records = rows.map(row => ({
    ...DisplayTemplateDefinitionSchema.parse(JSON.parse(row.definition)),
    id: row.id,
    version: row.version,
    organisationId: row.organisationId,
  }))
  const prerequisites = records
    .map(record => ({ id: record.id, ids: displayTemplateDependencies(record) }))
    .filter(record => record.ids.length)
  // Resolve every catalogue dependency together, rather than issuing a query per template.
  const checks = prerequisites.length
    ? await db.all<{ id: string; projectId: string | null; available: number }>(sql`
    SELECT json_extract(entry.value,'$.id') id,
      (SELECT min(projectId) FROM property WHERE scope='project' AND id IN (SELECT value FROM json_each(json_extract(entry.value,'$.ids')))) projectId,
      ${displayTemplatePropertyGuard(sql`json_extract(entry.value,'$.ids')`, { organisationId, ...context })} available
    FROM json_each(${JSON.stringify(prerequisites)}) entry
  `)
    : []
  const byId = new Map(checks.map(row => [row.id, row]))
  return records
    .filter(
      record =>
        context?.catalogue || !byId.has(record.id) || byId.get(record.id)?.available,
    )
    .map(record => ({ ...record, projectId: byId.get(record.id)?.projectId ?? null }))
}

/** Create or publish an immutable version under an already authorized scope.
 * @param db Request database. @param input Definition, owner, actor and optimistic version.
 * @returns New identity/version or null when concurrent edits or ownership changes prevent the write.
 * @remarks Code and owner are immutable. A central version never silently changes accepted consumer versions.
 */
export async function saveDisplayTemplate(
  db: Database,
  input: {
    id: string
    organisationId: string | null
    expectedVersion: number
    definition: DisplayTemplateDefinition
    actorId: string
    guard: SQL
    context?: Omit<DisplayTemplateContext, 'organisationId'>
  },
): Promise<{ id: string; version: number } | null> {
  const definition = DisplayTemplateDefinitionSchema.parse(input.definition)
  const dependencies = displayTemplateDependencyGuard(definition, {
    organisationId: input.organisationId,
    ...input.context,
  })
  if (
    !(await isDisplayTemplateAvailable(db, definition, {
      organisationId: input.organisationId,
      ...input.context,
    }))
  )
    throw new Error('TEMPLATE_PROPERTIES_UNAVAILABLE')
  const version = input.expectedVersion + 1
  const guard =
    input.expectedVersion === 0
      ? sql`(${input.guard}) AND (${dependencies}) AND NOT EXISTS(SELECT 1 FROM displayTemplate WHERE id=${input.id})`
      : sql`(${input.guard}) AND (${dependencies}) AND EXISTS(SELECT 1 FROM displayTemplate WHERE id=${input.id} AND organisationId IS ${input.organisationId} AND code=${definition.code} AND version=${input.expectedVersion})`
  // The deferred version foreign key and immutable revision insert commit together.
  const result = await executeRevisionBatch(db, guard, [
    ...(input.expectedVersion === 0
      ? [
          db.insert(displayTemplate).values({
            id: input.id,
            organisationId: input.organisationId,
            code: definition.code,
            version,
          }),
        ]
      : []),
    db.insert(displayTemplateRevision).values({
      templateId: input.id,
      version,
      definition,
      actorId: input.actorId,
      createdAt: new Date().toISOString(),
    }),
    ...(input.expectedVersion > 0
      ? [
          db
            .update(displayTemplate)
            .set({ version })
            .where(
              and(
                eq(displayTemplate.id, input.id),
                eq(displayTemplate.version, input.expectedVersion),
              ),
            ),
        ]
      : []),
  ])
  return result === null ? null : { id: input.id, version }
}
