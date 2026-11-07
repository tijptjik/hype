// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { taskLifecycleScopeCondition } from './task-scope'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { featureUploadEvidenceSource } from './featureUploadEvidence'
// IMAGE PRESENTATION
import { IMAGE_PRESENTATION_MODES } from '#lib/images/presentation.js'
// TYPES
import type { Database } from '#lib/types.js'

const metadataSchema = z.object({ version: z.number().int().positive(),
  presentationMode: z.enum(IMAGE_PRESENTATION_MODES).default('contain') })

/**
 * Pins task evidence to its finalized upload, independently of subsequent gallery publication.
 * @param db Request database.
 * @param rows Already-authorized task/image pairs; omitted or unrelated rows are never added.
 * @returns Same rows with retained image delivery metadata and revision identity.
 * @remarks A task's evidence remains the uploaded image even after later gallery replacements.
 */
export async function applyFeatureUploadTaskPins<T extends { id: string; taskId: string; featureId: string | null }>(
  db: Database, rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name IN ('featureImageUploadRevision','featureUploadEvidence') AND type='table'`)
  if (!storage?.n) return rows
  const evidence = await featureUploadEvidenceSource(db)
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const taskScope = await taskLifecycleScopeCondition(db)
  const sourceScope = lifecycle ? sql`(u.featureId=t.featureId OR (u.featureId IS NULL AND u.proposalId=t.proposalId))` : sql`u.featureId=t.featureId`
  const requested = JSON.stringify(rows.map(row => ({ imageId: row.id, taskId: row.taskId, featureId: row.featureId })))
  const pins = await db.all<{ imageId: string; taskId: string; featureId: string | null; imageRevisionId: string;
    storageKey: string; storageNamespace: string; contentHash: string; metadata: string }>(sql`
    SELECT u.imageId,t.id AS taskId,u.featureId,u.imageRevisionId,a.storageKey,a.storageNamespace,a.contentHash,ir.metadata
    FROM json_each(${requested}) wanted
    JOIN task t ON t.id=json_extract(wanted.value,'$.taskId') AND t.featureId IS json_extract(wanted.value,'$.featureId')
    JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=json_extract(wanted.value,'$.imageId')
    JOIN ${evidence} u ON (${sourceScope}) AND u.imageId=ti.imageId
      AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=t.id)
    JOIN imageRevision ir ON ir.id=u.imageRevisionId AND ir.imageId=u.imageId
    JOIN imageAssetVersion a ON a.id=ir.assetVersionId AND a.imageId=ir.imageId
    JOIN image i ON i.id=u.imageId AND i.isArchived=0
    WHERE EXISTS(SELECT 1 FROM main.task AS task WHERE task.id=t.id AND (${taskScope}))`)
  const key = (row: { taskId: string; imageId: string }): string => JSON.stringify([row.taskId, row.imageId])
  const byKey = new Map(pins.map(pin => [key(pin), pin]))
  if (byKey.size !== pins.length) throw new Error('Task image has ambiguous revision evidence')
  return rows.map(row => {
    const pin = byKey.get(key({ taskId: row.taskId, imageId: row.id }))
    if (!pin) return row
    const metadata = metadataSchema.parse(JSON.parse(pin.metadata))
    return { ...row, publicId: pin.storageKey, env: pin.storageNamespace, contentHash: pin.contentHash,
      version: metadata.version, presentationMode: metadata.presentationMode, imageRevisionId: pin.imageRevisionId }
  })
}

/**
 * Hydrates nested task image responses with the same immutable evidence pins as the viewer.
 * @param db Request database.
 * @param rows Authorized task records with optional image relations.
 * @returns Task records preserving all existing filters and response fields.
 */
export async function applyTaskUploadEvidence<T extends { id: string; featureId: string | null;
  images?: { imageId: string; image?: { id: string } | null }[] | null }>(db: Database, rows: T[]): Promise<T[]> {
  const transferStorage = await db.get<{n:number}>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureTaskTransfer' AND type='table'`)
  const transfers = transferStorage?.n && rows.length ? await db.all<{taskId:string}>(sql`SELECT DISTINCT taskId FROM featureTaskTransfer
    WHERE taskId IN(SELECT value FROM json_each(${JSON.stringify(rows.map(row=>row.id))}))`) : []
  const lifecycle = rows.length && await hasFeatureLifecycleStorage(db)
  const legacyTransfers = lifecycle ? await db.all<{ taskId: string }>(sql`SELECT DISTINCT json_extract(entry.value,'$.taskId') taskId
    FROM revisionChangeSet c,json_each(c.legacyEvidence,'$.taskTransfers') entry
    WHERE json_extract(entry.value,'$.taskId') IN(SELECT value FROM json_each(${JSON.stringify(rows.map(row=>row.id))}))`) : []
  const creation = lifecycle ? await db.all<{ taskId: string; id: string; version: string; changes: string; creationScope: string }>(sql`
    SELECT t.id taskId,p.id,p.version,p.changes,p.creationScope FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId
    WHERE p.kind='create' AND t.id IN(SELECT value FROM json_each(${JSON.stringify(rows.map(row=>row.id))}))`) : []
  const creations = new Map(creation.map(row => [row.taskId, { id: row.id, version: row.version,
    scope: JSON.parse(row.creationScope), content: FeatureRevisionContentSchema.parse(JSON.parse(row.changes).content) }]))
  const transferred = new Set([...transfers, ...legacyTransfers].map(row=>row.taskId))
  const flat = rows.flatMap(row => (row.images ?? []).flatMap(link => link.image
    ? [{ ...link.image, taskId: row.id, featureId: row.featureId }] : []))
  const pins = await applyFeatureUploadTaskPins(db, flat)
  // The join context belongs to the task, not the nested public image response.
  const byKey = new Map(pins.map(({ taskId, featureId: _featureId, ...image }) =>
    [JSON.stringify([taskId, image.id]), image]))
  return rows.map(row => ({ ...row,
    creationProposal: creations.get(row.id),
    lifecycleReview: Boolean(lifecycle),
    identityTransferred: transferred.has(row.id),
    revisionReviewRequired: pins.some(pin => pin.taskId === row.id && 'imageRevisionId' in pin),
    images: row.images?.map(link => ({ ...link,
    image: byKey.get(JSON.stringify([row.id, link.imageId])) ?? link.image })) }))
}
