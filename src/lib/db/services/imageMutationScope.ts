// DRIZZLE
import { and, eq, exists, getTableColumns, or, sql } from 'drizzle-orm'
// DB
import {
  feature,
  featureImage,
  hub,
  image,
  organisation,
  project,
  task,
  taskImage,
} from '#lib/db/schema/index.js'
// TYPES
import type { ImageMutationSnapshot } from '#lib/images/uploadContext.js'
import type { AnyColumn, SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { ImageContextType } from '#lib/db/zod/schema/image.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SCOPE AND IMAGE STATE
// 2. SNAPSHOT AND TRANSACTION GUARDS

export type { ImageMutationSnapshot } from '#lib/images/uploadContext.js'
export type ImageMutationGuards = { before: SQL; after: SQL }

/**
 * Preserves table qualification inside scalar subqueries in single-table projections.
 * @param column Trusted schema column.
 * @returns Explicit table and column SQL identifiers.
 * @remarks Drizzle otherwise strips column table names from projection SQL chunks.
 */
function qualified(column: AnyColumn): SQL {
  return sql`${column.table}.${sql.identifier(column.name)}`
}

/**
 * Builds a scalar identity for the current resource membership and canonical ancestry.
 * @param type Claimed resource type.
 * @param contextId Claimed resource identity.
 * @param imageId Image identity.
 * @returns Serialized scope, or SQL null when membership/ancestry is missing.
 */
function mutationScope(
  type: ImageContextType,
  contextId: string,
  imageId: string,
): SQL<string | null> {
  switch (type) {
    case 'feature':
      return sql`(SELECT json_array(${qualified(feature.id)},${qualified(project.id)},${qualified(organisation.id)},${qualified(organisation.hubId)})
      FROM ${featureImage} INNER JOIN ${feature} ON ${qualified(feature.id)}=${qualified(featureImage.featureId)}
      INNER JOIN ${project} ON ${qualified(project.id)}=${qualified(feature.projectId)}
      INNER JOIN ${organisation} ON ${qualified(organisation.id)}=${qualified(project.organisationId)}
      WHERE ${qualified(featureImage.featureId)}=${contextId} AND ${qualified(featureImage.imageId)}=${imageId} LIMIT 1)`
    case 'project':
      return sql`(SELECT json_array(${qualified(project.id)},${qualified(organisation.id)},${qualified(organisation.hubId)})
      FROM ${project} INNER JOIN ${organisation} ON ${qualified(organisation.id)}=${qualified(project.organisationId)}
      WHERE ${qualified(project.id)}=${contextId} AND ${qualified(project.imageId)}=${imageId} LIMIT 1)`
    case 'organisation':
      return sql`(SELECT json_array(${qualified(organisation.id)},${qualified(organisation.hubId)}) FROM ${organisation}
      WHERE ${qualified(organisation.id)}=${contextId} AND ${qualified(organisation.imageId)}=${imageId} LIMIT 1)`
    case 'hub':
      return sql`(SELECT json_array(${qualified(hub.id)}) FROM ${hub}
      WHERE ${qualified(hub.id)}=${contextId} AND ${qualified(hub.imageId)}=${imageId} LIMIT 1)`
    case 'task':
      return sql`(SELECT json_array(${qualified(task.id)},${qualified(feature.id)},${qualified(project.id)},${qualified(organisation.id)},${qualified(organisation.hubId)})
      FROM ${taskImage} INNER JOIN ${task} ON ${qualified(task.id)}=${qualified(taskImage.taskId)}
      INNER JOIN ${feature} ON ${qualified(feature.id)}=${qualified(task.featureId)}
      INNER JOIN ${project} ON ${qualified(project.id)}=${qualified(feature.projectId)}
      INNER JOIN ${organisation} ON ${qualified(organisation.id)}=${qualified(project.organisationId)}
      WHERE ${qualified(task.id)}=${contextId} AND ${qualified(taskImage.imageId)}=${imageId}
        AND ${qualified(task.projectId)}=${qualified(project.id)} AND ${qualified(task.organisationId)}=${qualified(organisation.id)} LIMIT 1)`
    default:
      return sql`NULL`
  }
}

/**
 * Serializes persisted image fields without relying on timestamp precision alone.
 * @returns SQL fingerprint of every image column in schema order.
 */
function imageRevision(): SQL<string> {
  return sql`json_array(${sql.join(Object.values(getTableColumns(image)).map(qualified), sql`,`)})`
}

/**
 * Captures the context-specific assignment, including moderation independent of image fields.
 * @param type Authorized context type.
 * @param contextId Resource identity.
 * @param imageId Image identity.
 * @returns Serialized assignment or SQL null when no assignment applies/exists.
 */
function assignmentRevision(
  type: ImageContextType,
  contextId: string,
  imageId: string,
): SQL<string | null> {
  if (type !== 'feature' && type !== 'task') return sql`NULL`
  const featureId =
    type === 'feature'
      ? sql`${contextId}`
      : sql`(SELECT ${qualified(task.featureId)} FROM ${task} WHERE ${qualified(task.id)}=${contextId})`
  return sql`(SELECT json_array(${sql.join(Object.values(getTableColumns(featureImage)).map(qualified), sql`,`)})
    FROM ${featureImage} WHERE ${qualified(featureImage.featureId)}=${featureId} AND ${qualified(featureImage.imageId)}=${imageId} LIMIT 1)`
}

/**
 * Captures image state and resource scope before request authorization.
 * @param db Request database.
 * @param type Claimed resource type.
 * @param contextId Claimed resource identity.
 * @param imageId Image identity.
 * @returns Snapshot, or null for a missing image, membership or parent chain.
 */
export async function getImageMutationSnapshot(
  db: Database,
  type: ImageContextType,
  contextId: string,
  imageId: string,
): Promise<ImageMutationSnapshot | null> {
  const [row] = await db
    .select({
      imageRevision: imageRevision(),
      assignmentRevision: assignmentRevision(type, contextId, imageId),
      scope: mutationScope(type, contextId, imageId),
      publicId: image.publicId,
      env: image.env,
      version: image.version,
    })
    .from(image)
    .where(eq(image.id, imageId))
    .limit(1)
  return row?.scope
    ? {
        imageId,
        imageRevision: row.imageRevision,
        assignmentRevision: row.assignmentRevision,
        scope: row.scope,
        source: { publicId: row.publicId, env: row.env, version: row.version },
      }
    : null
}

/**
 * Prepares guards that bind mutation to the captured image and authorized parent chain.
 * @param db Request database.
 * @param type Authorized resource type.
 * @param contextId Authorized resource identity.
 * @param snapshot State captured before authorization.
 * @returns Initial state/scope guard and post-edit scope guard.
 * @remarks Deletion uses the initial guard because it intentionally removes membership.
 * These guards preserve authorization scope; they do not re-read persisted role grants.
 */
export function createImageMutationGuards(
  db: Database,
  type: ImageContextType,
  contextId: string,
  snapshot: ImageMutationSnapshot,
): ImageMutationGuards {
  const scope = sql`${mutationScope(type, contextId, snapshot.imageId)} = ${snapshot.scope}`
  const target = and(eq(image.id, snapshot.imageId), scope)!
  return {
    before: exists(
      db
        .select({ id: image.id })
        .from(image)
        .where(
          and(
            target,
            sql`${imageRevision()} = ${snapshot.imageRevision}`,
            sql`${assignmentRevision(type, contextId, snapshot.imageId)} IS ${snapshot.assignmentRevision ?? null}`,
          ),
        ),
    ),
    after: exists(db.select({ id: image.id }).from(image).where(target)),
  }
}

/**
 * Allows the granted replacement once, or a retry of its still-current storage identity.
 * @param db Request database.
 * @param type Authorized context type.
 * @param contextId Authorized context identity.
 * @param snapshot Image state signed before upload authorization.
 * @param publicId New per-upload object key.
 * @param env Authorized storage namespace.
 * @returns Transaction guards and a predicate selecting already-committed retries.
 * @remarks A later replacement or reparenting invalidates the old grant.
 */
export function createImageReplacementGuards(
  db: Database,
  type: ImageContextType,
  contextId: string,
  snapshot: ImageMutationSnapshot,
  publicId: string,
  env: string,
): ImageMutationGuards & { replay: SQL } {
  const guards = createImageMutationGuards(db, type, contextId, snapshot)
  const replay = and(
    guards.after,
    exists(
      db
        .select({ id: image.id })
        .from(image)
        .where(
          and(
            eq(image.id, snapshot.imageId),
            eq(image.publicId, publicId),
            eq(image.env, env),
          ),
        ),
    ),
  )!
  return { before: or(guards.before, replay)!, after: guards.after, replay }
}
