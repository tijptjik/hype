// IMAGE INTENT POLICY
import { readFeatureImageIntentPolicy, resolvePolicyImageIntent, prepareImageIntentGalleryChange } from './imageIntentPolicy'
// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ne,
  not,
  or,
  sql,
  getTableColumns,
  inArray,
  isNull,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
// SCHEMA
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { applyFeatureUploadTaskPins } from './featureUploadRead'
import {
  feature,
  featureImage,
  hub,
  image,
  organisation,
  project,
  task,
  taskImage,
  user,
} from '../schema'
// CRUD
import { insert, insertRelated } from '../crud'
// ENUMS
import {
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
} from '#lib/enums.js'
// DB
import { autochunk, SQL_BATCH_SIZE } from '#lib/utils/batch-query.js'
import { prepareTaskEvidenceRevision } from './taskEvidenceRevision.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
// PUBLICATION
import { publishScopedFeatureImages } from './publication.js'
import { buildFeatureCommandScopeGuard } from './featureCommandScope.js'
import { applyFeatureGalleryPins } from './featureGalleryRead.js'
import { prepareFeatureGalleryAssignmentCapture } from './featureGalleryCommands.js'
// TYPES
import type { OrganisationRevisionCapture } from './organisationRevision'
import type { FeatureCommandProbe } from '#lib/db/zod/schema/feature.types.js'
import type { ImageMutationGuards } from './imageMutationScope.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Id, Database, EntityResponse } from '#lib/types.js'
import type {
  FeatureImage,
  FeatureImageDB,
  Image,
  ImageContextEnvelope,
  ImageContextType,
  ImageDB,
  ImageDBFlat,
  ImageDBFlatUpdate,
  ImageDBNew,
  ImageDBPartial,
  ImageEntityByProfile,
  ImageListByProfile,
  ImageProfile,
  Intent,
} from '#lib/db/zod/schema/image.types.js'
import { ImageListProfileAPI, ImageAdminProfileAPI } from '#lib/db/zod/index.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - createImage
//    - getUploadedImageId
//    - createUploadedImage
//    - updateImage
//    - updateImageWithFeatureImage
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createFeatureImage
//    - updateFeatureImage
//    - prepareFeatureImageMutation
//    - createTaskImagesFromImageIds
//    - publishAllImagesWithPublicIntent
//    - publishAllFeatureImagesExceptResearch
//
// 3. LOOKUPS
//    - getImageById
//    - getFeatureCanonicalImageOccupancy
//    - getImageForContextType
//    - getImagesForFeature
//    - getImagesForTask
//    - getImageForProject
//    - getImageForOrganisation
//
// 4. ACCESS CONTROL
//    - applyResourceContextConstraints
//
// 5. UTILS :: RESHAPE
//    - toResponseShape
//    - toResponseShapeProjectOrOrganisation
//    - sortImages
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

/**
 * Creates a new image in the database
 * @param db - The database instance
 * @param data - The image data to insert
 * @returns The newly created image
 * @throws {Error} If the image creation fails
 */
export const createImage = async (db: Database, data: ImageDBNew): Promise<ImageDB> =>
  await insert(db, image, data)

/**
 * Derives the stable database identity for a verified direct upload.
 * @param data Storage stage and public object identity.
 * @returns Deterministic image primary key shared by confirmation retries.
 */
export async function getUploadedImageId(
  data: Pick<ImageDBNew, 'env' | 'publicId'>,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([data.env ?? ImageEnv.local, data.publicId]),
    ),
  )
  return `upload-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Creates one image row per direct-upload storage identity, including concurrent retries.
 * @param db Database handle.
 * @param data Verified upload image data.
 * @returns The inserted or previously persisted image.
 * @remarks Existing metadata and moderation state are never overwritten by a retry.
 */
export const createUploadedImage = async (
  db: Database,
  data: ImageDBNew,
): Promise<ImageDB> => {
  const id = await getUploadedImageId(data)
  // The primary key arbitrates concurrent confirmations without a read-before-write race.
  const [created] = await db
    .insert(image)
    .values({ ...data, id })
    .onConflictDoNothing({ target: image.id })
    .returning()
  if (created) return created as ImageDB
  const [existing] = await db.select().from(image).where(eq(image.id, id)).limit(1)
  if (!existing) throw new Error('Uploaded image disappeared during confirmation')
  return existing as ImageDB
}

/**
 * Updates an existing image in the database
 * @param db - The database instance
 * @param data - The updated image data
 * @param ref - The image id
 * @returns The updated image
 * @throws {Error} If the image update fails or image is not found
 */
export const updateImage = async (
  db: Database,
  data: ImageDBPartial,
  ref: Id,
): Promise<ImageDB> => (await updateImageWithFeatureImage(db, data, undefined, ref)).image

// ═══════════════════════
// 2. CRUD :: RELATIONAL OPERATIONS
// ═══════════════════════

/**
 * Creates a feature-image association, optionally preserving it on upload retries.
 * @param db Database handle.
 * @param newFeatureImage Association data.
 * @param imageId Image to associate.
 * @param preserveExisting Whether an existing assignment must remain unchanged.
 * @returns The persisted association.
 */
export const createFeatureImage = async (
  db: Database,
  newFeatureImage: FeatureImage,
  imageId: Id,
  preserveExisting = false,
): Promise<FeatureImageDB> => {
  if (!preserveExisting)
    return await insertRelated(db, featureImage, newFeatureImage, 'imageId', imageId)
  // Retrying attachment must not reset a review decision made after the first insert.
  const [created] = await db
    .insert(featureImage)
    .values({ ...newFeatureImage, imageId })
    .onConflictDoNothing({ target: [featureImage.featureId, featureImage.imageId] })
    .returning()
  if (created) return created as FeatureImageDB
  const [existing] = await db
    .select()
    .from(featureImage)
    .where(
      and(
        eq(featureImage.featureId, newFeatureImage.featureId),
        eq(featureImage.imageId, imageId),
      ),
    )
    .limit(1)
  if (!existing) throw new Error('Feature image disappeared during attachment')
  return existing as FeatureImageDB
}

/**
 * Updates image assignment fields, replacing canonical intent atomically.
 * @param db Database connection.
 * @param modifiedFeatureImage Assignment fields and owning feature ID.
 * @param imageId Image assignment to update.
 * @param actorId Authenticated editor or explicit system attribution for accepted gallery history.
 * @returns The persisted assignment.
 * @remarks Canonical replacement must not demote the previous image if promotion fails.
 */
export const updateFeatureImage = async (
  db: Database,
  modifiedFeatureImage: Omit<ImageDBFlatUpdate, 'imageId'>,
  imageId: string,
  actorId = 'system:image-assignment',
): Promise<FeatureImageDB> => {
  const policy = await readFeatureImageIntentPolicy(db, modifiedFeatureImage.featureId)
  if (modifiedFeatureImage.intent != null) Object.assign(modifiedFeatureImage, resolvePolicyImageIntent(policy, modifiedFeatureImage.intent))
  else if (modifiedFeatureImage.isPublished != null) throw error(400, 'Choose an image intent to control publication')
  const mutation = prepareFeatureImageMutation(db, modifiedFeatureImage, imageId)
  const capture = await prepareFeatureGalleryAssignmentCapture(db, {
    featureId: modifiedFeatureImage.featureId, imageId, actorId, guard: mutation.guard,
    intent: modifiedFeatureImage.intent ?? undefined, isPublished: modifiedFeatureImage.isPublished ?? undefined,
  })
  const result = await executeRevisionBatch(db, sql`(${mutation.guard}) AND (${policy.guard})`, [
    ...capture.before,
    ...prepareTaskEvidenceRevision(db, mutation.affectedTasks),
    ...mutation.statements,
    prepareRevisionCheck(db, mutation.complete),
    ...capture.after,
    mutation.current,
  ])
  if (!result) throw error(404, 'Feature image assignment not found')
  return (result.at(-1) as FeatureImageDB[])[0]
}

/**
 * Prepares assignment changes and completion checks for an enclosing image transaction.
 * @param db Database connection.
 * @param modifiedFeatureImage Assignment fields and owning Feature identity.
 * @param imageId Image identity.
 * @param writeGuard Optional predicate suppressing assignment writes on upload replay.
 * @returns Unexecuted writes, target guards and a persisted-assignment query.
 * @remarks Checking the final assignment inside the batch also rolls back skipped promotion.
 */
function prepareFeatureImageMutation(
  db: Database,
  modifiedFeatureImage: Omit<ImageDBFlatUpdate, 'imageId'>,
  imageId: string,
  writeGuard?: SQL,
) {
  // Extract only the featureImage-specific fields.
  const featureImageData: Partial<FeatureImageDB> = {}
  if (modifiedFeatureImage.isPublished != null)
    featureImageData.isPublished = modifiedFeatureImage.isPublished
  if (modifiedFeatureImage.intent != null)
    featureImageData.intent = modifiedFeatureImage.intent
  if (modifiedFeatureImage.publishedAt !== undefined)
    featureImageData.publishedAt = modifiedFeatureImage.publishedAt

  const target = and(
    eq(featureImage.imageId, imageId),
    eq(featureImage.featureId, modifiedFeatureImage.featureId),
  )!
  const current = db.select().from(featureImage).where(target)
  const statements: BatchItem<'sqlite'>[] = []
  if (featureImageData.intent === 'canonical') {
    // D1 batches roll back demotion and promotion together, including missing/skipped targets.
    statements.push(
      db
        .update(featureImage)
        .set({ intent: 'general', isPublished: true, localIsPublished: true })
        .where(
          and(
            eq(featureImage.featureId, modifiedFeatureImage.featureId),
            eq(featureImage.intent, 'canonical'),
            ne(featureImage.imageId, imageId),
            exists(current),
            writeGuard,
          ),
        ),
    )
  }
  if (Object.keys(featureImageData).length)
    statements.push(
      db.update(featureImage).set(featureImageData).where(and(target, writeGuard)),
    )
  const columns = getTableColumns(featureImage)
  const complete = exists(
    db
      .select()
      .from(featureImage)
      .where(
        and(
          target,
          ...Object.entries(featureImageData).map(([key, value]) => {
            const column = columns[key as keyof typeof columns]
            return value === null ? isNull(column) : eq(column, value as never)
          }),
        ),
      ),
  )
  // Assignment changes affect this Feature's task evidence, including a demoted canonical image.
  const affectedImages = db
    .select({ id: featureImage.imageId })
    .from(featureImage)
    .where(
      and(
        eq(featureImage.featureId, modifiedFeatureImage.featureId),
        or(
          eq(featureImage.imageId, imageId),
          featureImageData.intent === 'canonical'
            ? eq(featureImage.intent, 'canonical')
            : undefined,
        ),
      ),
    )
  const affectedTasks = and(
    not(complete),
    eq(task.featureId, modifiedFeatureImage.featureId),
    exists(
      db
        .select({ id: taskImage.taskId })
        .from(taskImage)
        .where(
          and(
            eq(taskImage.taskId, task.id),
            inArray(taskImage.imageId, affectedImages),
          ),
        ),
    ),
  )!
  return { guard: exists(current), complete, current, statements, affectedTasks }
}

/**
 * Commits image fields and an optional Feature assignment in one transaction.
 * @param db Request database.
 * @param data Validated image field changes.
 * @param assignment Optional validated Feature-assignment changes.
 * @param imageId Authorized image identity.
 * @param guards Optional scope/state checks captured before request authorization.
 * @param replay Optional trusted predicate identifying an already-committed upload.
 * @param actorId Authenticated editor or explicit system attribution for accepted gallery history.
 * @param logoCapture Optional logo revision statements committed around the image update.
 * @param logoCapture Prepared exact logo journal and resource owner captures.
 * @returns Persisted image and assignment.
 * @remarks A failed or skipped assignment write must not leave new image metadata behind.
 * Changed evidence invalidates pending task revisions in the same transaction.
 */
export async function updateImageWithFeatureImage(
  db: Database,
  data: ImageDBPartial,
  assignment: Omit<ImageDBFlatUpdate, 'imageId'> | undefined,
  imageId: string,
  guards?: ImageMutationGuards,
  replay?: SQL,
  actorId = 'system:image-assignment',
  logoCapture: OrganisationRevisionCapture = { before: [], after: [] },
): Promise<{ image: ImageDB; featureImage?: FeatureImageDB; replayed?: boolean }> {
  if (data.id !== undefined && data.id !== imageId)
    throw error(400, 'IMAGE_ID_MISMATCH')
  if (replay && (!data.publicId || !data.env)) throw error(400, 'INVALID_IMAGE_REPLACEMENT')
  const policy = assignment ? await readFeatureImageIntentPolicy(db, assignment.featureId) : null
  if (assignment?.intent != null && policy) Object.assign(assignment, resolvePolicyImageIntent(policy, assignment.intent))
  else if (assignment?.isPublished != null) throw error(400, 'Choose an image intent to control publication')
  const { id: _id, ...fields } = data
  const current = db.select().from(image).where(eq(image.id, imageId))
  const mutation = assignment
    ? prepareFeatureImageMutation(
        db,
        assignment,
        imageId,
        replay ? not(replay) : undefined,
      )
    : undefined
  const columns = getTableColumns(image)
  const complete = exists(
    db
      .select()
      .from(image)
      .where(
        and(
          eq(image.id, imageId),
          ...Object.entries(fields)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => {
              const column = columns[key as keyof typeof columns]
              return value === null ? isNull(column) : eq(column, value as never)
            }),
        ),
      ),
  )
  const affectedTasks = or(
    and(
      not(complete),
      exists(
        db
          .select({ id: taskImage.taskId })
          .from(taskImage)
          .where(and(eq(taskImage.taskId, task.id), eq(taskImage.imageId, imageId))),
      ),
    ),
    mutation?.affectedTasks,
  )!
  const featureCapture = assignment && (assignment.intent != null || assignment.isPublished != null)
    ? await prepareFeatureGalleryAssignmentCapture(db, {
        featureId: assignment.featureId, imageId, actorId, guard: and(exists(current), mutation?.guard, guards?.before, policy?.guard)!,
        intent: assignment.intent ?? undefined, isPublished: assignment.isPublished ?? undefined,
      }) : { before: [], after: [] }
  const capture = { before: [...logoCapture.before,...featureCapture.before], after: [...logoCapture.after,...featureCapture.after] }
  // Validate both targets before writes and both resulting records before committing.
  const result = await executeRevisionBatch(
    db,
    and(exists(current), mutation?.guard, guards?.before, policy?.guard)!,
    [
      ...capture.before,
      ...prepareTaskEvidenceRevision(
        db,
        and(affectedTasks, replay ? not(replay) : undefined)!,
      ),
      ...(mutation?.statements ?? []),
      ...(mutation ? [prepareRevisionCheck(db, or(replay, mutation.complete)!)] : []),
      ...(Object.values(fields).some(value => value !== undefined)
        ? [
            db
              .update(image)
              .set(fields)
              .where(
                and(
                  eq(image.id, imageId),
                  not(complete),
                  replay ? not(replay) : undefined,
                ),
              )
              .returning({ id: image.id }),
          ]
        : []),
      // The image UPDATE is last: changes() distinguishes a replay from a fresh write.
      prepareRevisionCheck(
        db,
        and(
          or(
            and(complete, mutation?.complete),
            replay ? and(replay, sql`changes() = 0`) : undefined,
          ),
          guards?.after,
        )!,
      ),
      ...capture.after,
      current,
      ...(mutation ? [mutation.current] : []),
    ],
  )
  if (!result) throw error(409, 'STALE_IMAGE_UPDATE')
  return {
    image: (result.at(mutation ? -2 : -1) as ImageDB[])[0],
    ...(replay
      ? {
          replayed:
            (
              result[
                capture.before.length + 2 + (mutation?.statements.length ?? 0) + (mutation ? 1 : 0)
              ] as unknown[]
            ).length === 0,
        }
      : {}),
    ...(mutation ? { featureImage: (result.at(-1) as FeatureImageDB[])[0] } : {}),
  }
}

/**
 * Attaches images to a task without duplicating existing associations.
 * @param db Database handle.
 * @param taskId Task receiving the images.
 * @param imageIds Image identifiers to attach.
 * @returns Nothing after all associations have been persisted.
 * @remarks Bounded inserts can be retried safely after a partially completed request.
 */
export const createTaskImagesFromImageIds = async (
  db: Database,
  taskId: string,
  imageIds: string[],
): Promise<void> => {
  const uniqueImageIds = [...new Set(imageIds)]
  // Each join row binds two columns; leave every insert within the D1 budget.
  const batchSize = Math.floor(SQL_BATCH_SIZE / 2)
  for (let offset = 0; offset < uniqueImageIds.length; offset += batchSize) {
    await db
      .insert(taskImage)
      .values(
        uniqueImageIds.slice(offset, offset + batchSize).map(imageId => ({
          taskId,
          imageId,
        })),
      )
      .onConflictDoNothing({ target: [taskImage.taskId, taskImage.imageId] })
  }
}

/**
 * Applies project classification and publication policies to a feature.
 * @param db - The database instance
 * @param featureId - The feature ID
 * @param publisherId - The user ID of the publisher
 * @returns Resolves after image policy writes complete.
 * @throws {Error} If the update fails
 */
export const publishAllImagesWithPublicIntent = async (
  db: Database,
  featureId: Id,
  publisherId: Id,
): Promise<void> => {
  await publishScopedFeatureImages(db, { kind: 'feature', id: featureId }, publisherId)
}

/**
 * Publishes every active image assigned to a Feature except research-only images.
 * @param db The database instance.
 * @param featureId The Feature whose direct image assignments will be published.
 * @param publisherId The user who explicitly approved publication.
 * @param expectedScope Persisted Feature ancestry used to authorize the command.
 * @returns True for a valid scope (including no-op retries), false for missing or moved targets.
 * @remarks This deliberately bypasses project classification policy after an editor
 * explicitly chooses to publish all photos. Archived source images stay unpublished.
 */
export const publishAllFeatureImagesExceptResearch = async (
  db: Database,
  featureId: Id,
  publisherId: Id,
  expectedScope: Omit<FeatureCommandProbe, 'id'>,
): Promise<boolean> => {
  const policy = await readFeatureImageIntentPolicy(db, featureId)
  const guard = sql`(${buildFeatureCommandScopeGuard(db, featureId, expectedScope)}) AND (${policy.guard})`
  const statements = await prepareImageIntentGalleryChange(db, { featureId, actorId: publisherId, guard, policy, classify: true })
  return (await executeRevisionBatch(db, guard, statements)) !== null
}

// ═══════════════════════
// 3. LOOKUPS
// ═══════════════════════

export const getImageById = async (
  db: Database,
  conditions: SQL<unknown>[],
): Promise<ImageDBFlat | undefined> => {
  const [result] = await db
    .select({
      ...getTableColumns(image),
      featureId: featureImage.featureId,
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution,
    })
    .from(image)
    .leftJoin(featureImage, eq(image.id, featureImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions))
  if (!result) return undefined
  return result as ImageDBFlat
}

/**
 * Returns feature ids that already have a canonical image assignment.
 *
 * @param db - The database instance.
 * @param featureIds - Feature ids to probe.
 * @returns Unique feature ids with canonical occupancy.
 */
export const getFeatureCanonicalImageOccupancy = async (
  db: Database,
  featureIds: Id[],
): Promise<Id[]> => {
  if (featureIds.length === 0) return []

  const uniqueFeatureIds = [...new Set(featureIds)]

  // D1 allows only 100 bound parameters per query, so reserve one slot for
  // the fixed `intent = 'canonical'` predicate before batching feature IDs.
  const rows = await autochunk(
    {
      items: uniqueFeatureIds,
      otherParametersCount: 1,
    },
    async featureIdChunk =>
      await db
        .select({
          featureId: featureImage.featureId,
        })
        .from(featureImage)
        .where(
          and(
            inArray(featureImage.featureId, featureIdChunk),
            eq(featureImage.intent, 'canonical'),
          ),
        ),
  )

  return [...new Set(rows.map(row => row.featureId))]
}

/**
 * Loads images and their assignments in bounded ID batches.
 * @param db Database handle.
 * @param imageIds Requested image IDs.
 * @param conditions Additional visibility or query conditions.
 * @returns Matching image-assignment rows across all batches.
 * @remarks Duplicate input IDs are ignored; multiple feature assignments are preserved.
 */
export const getImagesByIds = async (
  db: Database,
  imageIds: string[],
  conditions: SQL<unknown>[] = [],
): Promise<ImageDBFlat[]> => {
  if (imageIds.length === 0) return []

  // Budget the actual compiled filter parameters before allocating ID placeholders.
  const otherParametersCount = db
    .select({ id: image.id })
    .from(image)
    .where(and(...conditions))
    .toSQL().params.length
  return await autochunk(
    { items: [...new Set(imageIds)], otherParametersCount },
    async idChunk => {
      // Always filter by the provided image IDs and retain every caller-supplied condition.
      const results = await db
        .select({
          ...getTableColumns(image),
          intent: featureImage.intent,
          isPublished: featureImage.isPublished,
          publishedAt: featureImage.publishedAt,
          publisherId: featureImage.publisherId,
          attribution: user.attribution,
          // Feature context fields
          organisationId: feature.organisationId,
          projectId: feature.projectId,
          layerId: feature.layerId,
          featureId: feature.id,
        })
        .from(image)
        .leftJoin(featureImage, eq(image.id, featureImage.imageId))
        .leftJoin(feature, eq(featureImage.featureId, feature.id))
        .leftJoin(user, eq(image.contributorId, user.id))
        .where(and(inArray(image.id, idChunk), ...conditions))

      return results as ImageDBFlat[]
    },
  )
}

export const getImageForContextType = async (
  db: Database,
  ctxType: ImageContextResource | ImageContextResourceExtended,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  isAdminMode: boolean = false,
): Promise<ImageDBFlat[] | ImageDB[]> => {
  let images: ImageDBFlat[] | ImageDB[] = []
  if (ctxType === ImageContextResource.feature) {
    images = await getImagesForFeature(db, conditions, pagination, sorting, !isAdminMode)
  } else if (ctxType === ImageContextResource.hub) {
    images = await getImageForHub(db, conditions, pagination, sorting)
  } else if (ctxType === ImageContextResource.project) {
    images = await getImageForProject(db, conditions, pagination, sorting)
  } else if (ctxType === ImageContextResource.organisation) {
    images = await getImageForOrganisation(db, conditions, pagination, sorting)
  } else if (ctxType === ImageContextResource.user) {
    images = await getImagesForUser(db, conditions, pagination, sorting)
  } else if (ctxType === ImageContextResourceExtended.task) {
    images = await getImagesForTask(db, conditions, pagination, sorting)
  }
  return sortImages(images, isAdminMode)
}

const toOrderBy = (sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) => {
  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const sortColumn = image[sortBy as keyof typeof image]
  if (!sortColumn) {
    throw new Error(`Invalid sort column: ${sortBy}`)
  }
  return sortOrder === 'asc'
    ? asc(sortColumn as AnyColumn)
    : desc(sortColumn as AnyColumn)
}

/**
 * Retrieves images associated with a feature, including their intent, publication status, and attribution. The conditions should already have been applied and include the featureId.
 *
 * @param db - The database instance.
 * @param conditions - Additional SQL conditions to apply to the query.
 * @returns A promise that resolves to an array of image objects.
 */
export const getImagesForFeature = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  publishedOnly = false,
): Promise<ImageDBFlat[]> => {
  const orderBy = toOrderBy(sorting)
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`)
  // Admin galleries retain the last accepted content while publication is explicitly off.
  const revisionSelection = publishedOnly ? sql`h.publishedRevisionId` : sql`COALESCE(h.publishedRevisionId,
    (SELECT p.previousRevisionId FROM featureRevisionPublication p WHERE p.featureId=h.featureId AND p.generation=h.generation),
    (SELECT initial.id FROM featureRevision initial JOIN featureRevisionPublication receipt
      ON receipt.featureId=initial.featureId AND receipt.changeSetId=initial.changeSetId AND receipt.generation=0
      WHERE initial.featureId=h.featureId AND initial.previousRevisionId IS NULL))`
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const currentMembership = sql`EXISTS(SELECT 1 FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id
    JOIN featureRevisionImage pin ON pin.featureRevisionId=r.id WHERE f.id=${featureImage.featureId} AND pin.imageId=${image.id}
      AND (${Number(!publishedOnly)} OR (f.isPublished=1 AND f.isArchived=0 AND EXISTS(
        SELECT 1 FROM json_each(r.content,'$.gallery.entries') entry WHERE entry.key=${image.id} AND json_extract(entry.value,'$.isPublished')=1))))`
  const pinnedOrder = lifecycle ? sql`COALESCE((SELECT pin.position FROM feature f JOIN featureRevisionImage pin ON pin.featureRevisionId=f.currentRevisionId
    WHERE f.id=${featureImage.featureId} AND pin.imageId=${image.id}),2147483647)` : storage?.n ? sql`COALESCE((SELECT pin.position FROM featureRevisionHead h
    JOIN featureRevisionImage pin ON pin.featureRevisionId=${revisionSelection}
    WHERE h.featureId=${featureImage.featureId} AND h.state='active' AND pin.imageId=${image.id}),2147483647)` : sql`0`
  const query = db
    .select({
      ...getTableColumns(image),
      featureId: featureImage.featureId,
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution,
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions, lifecycle ? currentMembership : storage?.n ? sql`(NOT EXISTS (SELECT 1 FROM featureRevisionHead h WHERE h.featureId=${featureImage.featureId})
      OR EXISTS (SELECT 1 FROM featureRevisionHead h JOIN featureRevisionImage pin ON pin.featureRevisionId=${revisionSelection}
        WHERE h.featureId=${featureImage.featureId} AND h.state='active' AND pin.imageId=${image.id}
        AND (${Number(!publishedOnly)} OR (EXISTS (
          SELECT 1 FROM featureRevision r,json_each(r.content,'$.gallery.entries') entry
          WHERE r.id=h.publishedRevisionId AND entry.key=${image.id} AND json_extract(entry.value,'$.isPublished')=1)))))` : undefined))
    .orderBy(pinnedOrder, orderBy)
  /** Resolve accepted pins after the existing live image access conditions have filtered rows. */
  const pinned = async (rows: ImageDBFlat[]): Promise<ImageDBFlat[]> => {
    const features = new Map<string, { id: string; images: { imageId: string; image: ImageDBFlat; intent: unknown; isPublished: unknown }[] }>()
    for (const row of rows) {
      if (!row.featureId) continue
      if (!features.has(row.featureId)) features.set(row.featureId, { id: row.featureId, images: [] })
      features.get(row.featureId)!.images.push({ imageId: row.id, image: row, intent: row.intent, isPublished: row.isPublished })
    }
    const resolved = await applyFeatureGalleryPins(db, [...features.values()], { publishedOnly })
    return resolved.flatMap(row => row.images.map(link => ({ ...link.image, intent: link.intent, isPublished: link.isPublished }))) as ImageDBFlat[]
  }
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return pinned((await query
      .limit(pagination.limit)
      .offset(pagination.offset)) as ImageDBFlat[])
  }
  if (typeof pagination?.limit === 'number') {
    return pinned((await query.limit(pagination.limit)) as ImageDBFlat[])
  }
  if (typeof pagination?.offset === 'number') {
    return pinned((await query.offset(pagination.offset)) as ImageDBFlat[])
  }
  return pinned((await query) as ImageDBFlat[])
}

/**
 * Retrieves images associated with a task, including their intent, publication status, and attribution. The conditions should already have been applied and include the taskId.
 *
 * @param db - The database instance.
 * @param conditions - Additional SQL conditions to apply to the query.
 * @returns A promise that resolves to an array of image objects.
 */
export const getImagesForTask = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ImageDBFlat[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({
      ...getTableColumns(image),
      taskId: task.id,
      featureId: task.featureId,
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution,
    })
    .from(image)
    .innerJoin(taskImage, eq(image.id, taskImage.imageId))
    .innerJoin(task, eq(taskImage.taskId, task.id))
    .leftJoin(
      featureImage,
      and(
        eq(image.id, featureImage.imageId),
        eq(featureImage.featureId, task.featureId),
      ),
    )
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return await applyFeatureUploadTaskPins(db, await query
      .limit(pagination.limit)
      .offset(pagination.offset))
  }
  if (typeof pagination?.limit === 'number') {
    return await applyFeatureUploadTaskPins(db, await query.limit(pagination.limit))
  }
  if (typeof pagination?.offset === 'number') {
    return await applyFeatureUploadTaskPins(db, await query.offset(pagination.offset))
  }
  return await applyFeatureUploadTaskPins(db, await query)
}

export const getImageForProject = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ImageDB[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({ ...getTableColumns(image) })
    .from(image)
    .innerJoin(project, eq(image.id, project.imageId))
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return await query.limit(pagination.limit).offset(pagination.offset)
  }
  if (typeof pagination?.limit === 'number') {
    return await query.limit(pagination.limit)
  }
  if (typeof pagination?.offset === 'number') {
    return await query.offset(pagination.offset)
  }
  return await query
}

export const getImageForOrganisation = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ImageDB[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({ ...getTableColumns(image) })
    .from(image)
    .innerJoin(organisation, eq(image.id, organisation.imageId))
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return await query.limit(pagination.limit).offset(pagination.offset)
  }
  if (typeof pagination?.limit === 'number') {
    return await query.limit(pagination.limit)
  }
  if (typeof pagination?.offset === 'number') {
    return await query.offset(pagination.offset)
  }
  return await query
}

export const getImageForHub = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ImageDB[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({ ...getTableColumns(image) })
    .from(image)
    .innerJoin(hub, eq(image.id, hub.imageId))
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return await query.limit(pagination.limit).offset(pagination.offset)
  }
  if (typeof pagination?.limit === 'number') {
    return await query.limit(pagination.limit)
  }
  if (typeof pagination?.offset === 'number') {
    return await query.offset(pagination.offset)
  }
  return await query
}

export const getImagesForUser = async (
  db: Database,
  conditions: SQL<unknown>[],
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ImageDB[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({ ...getTableColumns(image) })
    .from(image)
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return await query.limit(pagination.limit).offset(pagination.offset)
  }
  if (typeof pagination?.limit === 'number') {
    return await query.limit(pagination.limit)
  }
  if (typeof pagination?.offset === 'number') {
    return await query.offset(pagination.offset)
  }
  return await query
}

// ═══════════════════════
// 4. ACCESS CONTROL
// ═══════════════════════

/**
 * Applies constraints to the query conditions based on the resource context.
 * Images are a second-class resource, and are always addressed in the context of a first-class resource :
 * organisation, project, feature, or task.
 *
 * This function is used to apply the context constraints to the query conditions.
 *
 * @param contextType - The type of the parent resource.
 * @param contextId - The ID of the parent resource.
 * @param conditions - The array of SQL conditions to modify.
 */
export const applyResourceContextConstraints = (
  contextType: ImageContextResource | ImageContextResourceExtended,
  contextId: Id,
  conditions: SQL<unknown>[],
) => {
  switch (contextType) {
    case ImageContextResource.feature:
      conditions.push(eq(featureImage.featureId, contextId))
      break
    case ImageContextResource.hub:
      conditions.push(eq(hub.imageId, image.id))
      conditions.push(eq(hub.id, contextId))
      break
    case ImageContextResource.project:
      conditions.push(eq(project.imageId, image.id))
      conditions.push(eq(project.id, contextId))
      break
    case ImageContextResource.organisation:
      conditions.push(eq(organisation.imageId, image.id))
      conditions.push(eq(organisation.id, contextId))
      break
    case ImageContextResource.user:
      conditions.push(eq(image.contributorId, contextId))
      break
    case ImageContextResourceExtended.task:
      // Assuming a taskImage join table
      // This requires joining with taskImage table
      conditions.push(eq(taskImage.taskId, contextId))
      conditions.push(eq(taskImage.imageId, image.id))
      break
  }
}

// ═══════════════════════
//  5. UTILS :: RESHAPE
// ═══════════════════════

export const toNormalizedImageRecord = (value: Image): Image => {
  const nextValue = { ...value }

  if (
    nextValue.env !== ImageEnv.local &&
    nextValue.env !== ImageEnv.preview &&
    nextValue.env !== ImageEnv.production
  ) {
    nextValue.env = ImageEnv.production
  }

  return nextValue
}

const toProfileResponseShape = <P extends ImageProfile>(
  value: Image,
  profile: P,
): ImageEntityByProfile<P> => {
  const normalizedValue = toNormalizedImageRecord(value)

  if (profile === 'list' || profile === 'card' || profile === 'detail') {
    return ImageListProfileAPI.parse(normalizedValue) as ImageEntityByProfile<P>
  }
  return ImageAdminProfileAPI.parse(normalizedValue) as ImageEntityByProfile<P>
}

export const toImageEnvelope = <P extends ImageProfile>(
  value: Image,
  profile: P,
  ctxType: ImageContextType,
  ctxId: Id,
): ImageContextEnvelope<P> => {
  const featureContextFields: Partial<
    Pick<ImageContextEnvelope<P>, 'intent' | 'isPublished' | 'publishedAt'>
  > =
    ctxType === ImageContextResource.feature ||
    ctxType === ImageContextResourceExtended.task
      ? {
          intent: ((value as Partial<ImageDBFlat>).intent ?? null) as Intent | null,
          isPublished: (value as Partial<ImageDBFlat>).isPublished ?? null,
          publishedAt: (value as Partial<ImageDBFlat>).publishedAt ?? null,
        }
      : {}

  return {
    ctxType,
    ctxId,
    image: toProfileResponseShape(value, profile) as ImageListByProfile<P>,
    ...featureContextFields,
  }
}

export const toImageEntityResponseShape = <P extends ImageProfile = 'detail'>(
  image: Image | null,
  context: { ctxType: ImageContextType; ctxId: Id },
  profile: P = 'detail' as P,
): EntityResponse<ImageContextEnvelope<P> | null> & { profile: P } => {
  const startedAt = Date.now()
  if (!image) {
    return { data: null, durationMs: Date.now() - startedAt, profile }
  }

  return {
    data: toImageEnvelope(image, profile, context.ctxType, context.ctxId),
    durationMs: Date.now() - startedAt,
    profile,
  }
}

export const toImageListResponseShape = <P extends ImageProfile = 'list'>(
  images: Image[],
  context:
    | { ctxType: ImageContextType; ctxId: Id }
    | ((image: Image) => { ctxType: ImageContextType; ctxId: Id }),
  profile: P = 'list' as P,
): EntityResponse<Array<ImageContextEnvelope<P>>> & { profile: P } => {
  const startedAt = Date.now()
  const data = images.map(image => {
    const nextContext = typeof context === 'function' ? context(image) : context
    return toImageEnvelope(image, profile, nextContext.ctxType, nextContext.ctxId)
  })

  return {
    data,
    durationMs: Date.now() - startedAt,
    profile,
  }
}

export const toResponseShape = async (
  image: ImageDB,
  featureImage: FeatureImageDB | undefined,
  attribution: string | undefined,
): Promise<ImageDBFlat> => {
  return {
    ...image,
    attribution,
    ...(featureImage
      ? {
          featureId: (featureImage.featureId as Id) ?? undefined,
          intent: featureImage.intent ?? undefined,
          isPublished: featureImage.isPublished ?? undefined,
          publishedAt: featureImage.publishedAt ?? undefined,
        }
      : {}),
  }
}

export const toResponseShapeProjectOrOrganisation = async (
  image: ImageDB,
  attribution: string | undefined,
): Promise<Image> => {
  return {
    ...image,
    attribution,
  }
}

const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'undefined',
  'research',
] as const

const adminIntentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'research',
] as const

/**
 * Sorts image rows for public or admin presentation without depending on client-only modules.
 *
 * @param images Image rows to sort in place.
 * @param isAdmin Whether admin ordering rules should apply.
 * @returns The sorted input array.
 */
export function sortImages(images: Image[] | ImageDBFlat[], isAdmin: boolean = false) {
  const intentOrderToUse: readonly string[] = isAdmin ? adminIntentOrder : intentOrder

  return images.sort((a, b) => {
    if ('galleryPosition' in a && typeof a.galleryPosition === 'number' &&
        'galleryPosition' in b && typeof b.galleryPosition === 'number')
      return a.galleryPosition - b.galleryPosition
    if (isAdmin) {
      const aIsUnpublishedNoIntent =
        !a.isPublished && (!a.intent || a.intent === 'undefined')
      const bIsUnpublishedNoIntent =
        !b.isPublished && (!b.intent || b.intent === 'undefined')

      if (aIsUnpublishedNoIntent && !bIsUnpublishedNoIntent) return -1
      if (!aIsUnpublishedNoIntent && bIsUnpublishedNoIntent) return 1

      if (a.isPublished !== b.isPublished) {
        return a.isPublished ? -1 : 1
      }
    }

    if (a.intent && b.intent) {
      const intentCompare =
        intentOrderToUse.indexOf(a.intent as Intent) -
        intentOrderToUse.indexOf(b.intent as Intent)
      if (intentCompare !== 0) {
        return intentCompare
      }
    }

    return (
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime()
    )
  })
}
