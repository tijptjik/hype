// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. RESOURCE SNAPSHOTS — query and signed-grant state
// 2. UPLOAD CONFIRMATION — guarded atomic persistence and replay

// DRIZZLE
import { and, eq, exists, notExists, or, sql } from 'drizzle-orm'
// DB
import { hasResourceLogoStorage } from './resourceLogoSnapshot'
import { prepareResourceLogoRevision } from './resourceLogoRevision'
import { hub, image, organisation, project } from '#lib/db/schema/index.js'
import { getUploadedImageId } from './image.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import { prepareAdminResourceRevisionCapture, isAdminResourceRevisionRecordingEnabled } from './adminResourceRevision.js'
import {
  prepareOrganisationRevisionCapture,
  organisationRevisionTarget,
} from './organisationRevision.js'
import type { OrganisationRevisionActor } from './organisationRevision.js'
// TYPES
import type { LogoRevisionEvidence } from './resourceLogoRevision'
import type { Database } from '#lib/types.js'
import type { ImageDB, ImageDBNew } from '#lib/db/zod/schema/image.types.js'
import type { ResourceUploadSnapshot } from '#lib/images/uploadContext.js'

export type ResourceUploadType = 'project' | 'organisation' | 'hub'

/**
 * Selects the image revision and canonical parent scope for a single-image resource.
 * @param db Request database.
 * @param type Resource type.
 * @param id Resource identity.
 * @returns Unexecuted snapshot query; missing ancestry yields no row.
 */
function snapshotQuery(db: Database, type: ResourceUploadType, id: string) {
  if (type === 'project')
    return db
      .select({
        imageId: project.imageId,
        modifiedAt: project.modifiedAt,
        organisationId: project.organisationId,
        hubId: organisation.hubId,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(project.id, id))
  const table = type === 'organisation' ? organisation : hub
  return db
    .select({
      imageId: table.imageId,
      modifiedAt: table.modifiedAt,
      organisationId: sql<string | null>`NULL`.as('organisationId'),
      hubId:
        type === 'organisation'
          ? organisation.hubId
          : sql<string | null>`NULL`.as('hubId'),
    })
    .from(table)
    .where(eq(table.id, id))
}

/**
 * Captures resource state for a signed upload grant.
 * @param db Request database.
 * @param type Resource type.
 * @param id Resource identity.
 * @returns Snapshot or null when the resource/ancestry is missing.
 */
export async function getResourceUploadSnapshot(
  db: Database,
  type: ResourceUploadType,
  id: string,
): Promise<ResourceUploadSnapshot | null> {
  return (await snapshotQuery(db, type, id).limit(1))[0] ?? null
}

/**
 * Atomically confirms a new resource image or replays its still-current upload.
 * @param db Request database.
 * @param type Resource type.
 * @param resourceId Resource identity.
 * @param data Verified upload metadata.
 * @param expected Signed resource state captured before uploading.
 * @param newImageId Fresh server-generated identity for non-upload creation; omit for upload replay.
 * @param actor Authenticated actor for resource image history.
 * @param logoEvidence Verified original bytes descriptor and exact metadata for the logo journal.
 * @returns Persisted image, or null for a stale resource or upload.
 * @remarks The original revision prevents resurrection after detached image cleanup.
 * Retries preserve metadata and never reselect an image displaced by a newer upload.
 */
export async function createUploadedResourceImage(
  db: Database,
  type: ResourceUploadType,
  resourceId: string,
  data: ImageDBNew,
  expected: ResourceUploadSnapshot,
  newImageId?: string,
  actor?: OrganisationRevisionActor,
  logoEvidence?: LogoRevisionEvidence,
): Promise<ImageDB | null> {
  if (await hasResourceLogoStorage(db) && (!logoEvidence || !actor)) {
    throw new Error('Logo uploads require verified image evidence and attribution')
  }
  if (logoEvidence && type !== 'organisation' && !await isAdminResourceRevisionRecordingEnabled(db, type)) {
    throw new Error(`Logo history requires ${type} revision recording to be enabled`)
  }
  const id = newImageId ?? (await getUploadedImageId(data))
  const table =
    type === 'project' ? project : type === 'organisation' ? organisation : hub
  const current = snapshotQuery(db, type, resourceId).as('upload_context')
  const stored = db
    .select()
    .from(image)
    .where(
      and(
        eq(image.id, id),
        eq(image.publicId, data.publicId),
        eq(image.env, data.env),
        eq(image.isArchived, false),
      ),
    )
  const anyStored = db.select({ id: image.id }).from(image).where(eq(image.id, id))
  // Scope must still match even on a retry; only a new image may use the original revision.
  const allowed = db
    .select({ imageId: current.imageId })
    .from(current)
    .where(
      and(
        sql`${current.organisationId} IS ${expected.organisationId}`,
        sql`${current.hubId} IS ${expected.hubId}`,
        or(
          and(
            sql`${current.imageId} IS ${expected.imageId}`,
            eq(current.modifiedAt, expected.modifiedAt),
            notExists(anyStored),
          ),
          and(eq(current.imageId, id), exists(stored)),
        ),
      ),
    )
  const selected = db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, resourceId), eq(table.imageId, id)))
  const capture =
    type === 'organisation'
      ? await prepareOrganisationRevisionCapture(
          db,
          organisationRevisionTarget(resourceId),
          actor,
        )
      : await prepareAdminResourceRevisionCapture(
          db,
          type,
          sql`SELECT ${resourceId} AS id`,
          actor,
        )
  const logoCapture = logoEvidence && actor ? await prepareResourceLogoRevision(db, { ...logoEvidence, imageId:id, actorId:actor.actorId, reason:actor.reason??'Logo uploaded', initialUpload:true }) : {before:[],after:[]}
  // The batch guards, inserts and selects together; failed/skipped pointer writes roll back.
  const result = await executeRevisionBatch(db, exists(allowed), [
    ...capture.before,
    ...logoCapture.before,
    db
      .insert(image)
      .values({ ...data, id })
      .onConflictDoNothing({ target: image.id }),
    db
      .update(table)
      .set({
        imageId: id,
        modifiedAt: sql`CASE
      WHEN ${table.modifiedAt} >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${table.modifiedAt}, '+0.001 seconds')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END`,
      })
      .where(and(eq(table.id, resourceId), sql`${table.imageId} IS NOT ${id}`)),
    prepareRevisionCheck(db, and(exists(allowed), exists(selected), exists(stored))!),
    ...logoCapture.after,
    ...capture.after,
    stored,
  ])
  return result ? (result.at(-1) as ImageDB[])[0] : null
}
