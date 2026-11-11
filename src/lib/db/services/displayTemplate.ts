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
// TYPES
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Authorized catalogue reads
// 2. Version-fenced publication

/** List central and selected Organisation templates after scope authorization.
 * @param db Request database. @param organisationId Authorized owner or community-only scope.
 * @returns Current definitions; private templates from other Organisations are excluded.
 */
export async function listDisplayTemplates(
  db: Database,
  organisationId: string | null,
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
  return rows.map(row => ({
    ...DisplayTemplateDefinitionSchema.parse(JSON.parse(row.definition)),
    id: row.id,
    version: row.version,
    organisationId: row.organisationId,
  }))
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
  },
): Promise<{ id: string; version: number } | null> {
  const definition = DisplayTemplateDefinitionSchema.parse(input.definition)
  const version = input.expectedVersion + 1
  const guard =
    input.expectedVersion === 0
      ? sql`(${input.guard}) AND NOT EXISTS(SELECT 1 FROM displayTemplate WHERE id=${input.id})`
      : sql`(${input.guard}) AND EXISTS(SELECT 1 FROM displayTemplate WHERE id=${input.id} AND organisationId IS ${input.organisationId} AND code=${definition.code} AND version=${input.expectedVersion})`
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
