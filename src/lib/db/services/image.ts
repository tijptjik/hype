// DRIZZLE
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
// SCHEMA
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
import { insert, insertRelated, update, updateRelated } from '../crud'
// ENUMS
import {
  ImageContextResource,
  ImageContextResourceExtended,
  ImageCDN,
  ImageEnv,
  ImageIntentPublic,
} from '$lib/enums'
// TYPES
import type { Id, Database, EntityResponse } from '$lib/types'
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
} from '$lib/db/zod/schema/image.types'
import { ImageListProfileAPI, ImageAdminProfileAPI } from '$lib/db/zod'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - createImage
//    - updateImage
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createFeatureImage
//    - updateFeatureImage
//    - createTaskImagesFromImageIds
//    - publishAllImagesWithPublicIntent
//
// 3. LOOKUPS
//    - getImageById
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
): Promise<ImageDB> => await update(db, image, data, image.id, ref)

// ═══════════════════════
// 2. CRUD :: RELATIONAL OPERATIONS
// ═══════════════════════

export const createFeatureImage = async (
  db: Database,
  newFeatureImage: FeatureImage,
  imageId: Id,
): Promise<FeatureImageDB> =>
  await insertRelated(db, featureImage, newFeatureImage, 'imageId', imageId)

export const updateFeatureImage = async (
  db: Database,
  modifiedFeatureImage: ImageDBFlatUpdate,
  imageId: string,
): Promise<FeatureImageDB> => {
  // Extract only the featureImage-specific fields
  const featureImageData: Partial<FeatureImageDB> = {}

  if (modifiedFeatureImage.isPublished !== undefined) {
    featureImageData.isPublished = modifiedFeatureImage.isPublished ?? undefined
  }
  if (modifiedFeatureImage.intent !== undefined) {
    featureImageData.intent = modifiedFeatureImage.intent ?? undefined
  }
  if (modifiedFeatureImage.publishedAt !== undefined) {
    featureImageData.publishedAt = modifiedFeatureImage.publishedAt
  }

  return await updateRelated(
    db,
    featureImage,
    featureImageData,
    featureImage.imageId,
    imageId,
    featureImage.featureId,
    modifiedFeatureImage.featureId,
  )
}

export const createTaskImagesFromImageIds = async (
  db: Database,
  taskId: string,
  imageIds: string[],
) => {
  await db.insert(taskImage).values(
    imageIds.map(imageId => ({
      taskId,
      imageId,
    })),
  )
}

/**
 * Publishes all images with public intent for a feature
 * @param db - The database instance
 * @param featureId - The feature ID
 * @param publisherId - The user ID of the publisher
 * @throws {Error} If the update fails
 */
export const publishAllImagesWithPublicIntent = async (
  db: Database,
  featureId: Id,
  publisherId: Id,
): Promise<void> => {
  const publicIntentValues = Object.values(ImageIntentPublic)

  await db
    .update(featureImage)
    .set({
      isPublished: true,
      publishedAt: new Date().toISOString(),
      publisherId,
    })
    .where(
      and(
        eq(featureImage.featureId, featureId),
        inArray(featureImage.intent, publicIntentValues),
      ),
    )
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

export const getImagesByIds = async (
  db: Database,
  imageIds: string[],
  conditions: SQL<unknown>[] = [],
): Promise<ImageDBFlat[]> => {
  if (imageIds.length === 0) return []

  // Always filter by the provided image IDs
  const allConditions = [inArray(image.id, imageIds), ...conditions]

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
    .where(and(...allConditions))

  return results as ImageDBFlat[]
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
    images = await getImagesForFeature(db, conditions, pagination, sorting)
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
): Promise<ImageDBFlat[]> => {
  const orderBy = toOrderBy(sorting)
  const query = db
    .select({
      ...getTableColumns(image),
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution,
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions))
    .orderBy(orderBy)
  if (typeof pagination?.limit === 'number' && typeof pagination?.offset === 'number') {
    return (await query
      .limit(pagination.limit)
      .offset(pagination.offset)) as ImageDBFlat[]
  }
  if (typeof pagination?.limit === 'number') {
    return (await query.limit(pagination.limit)) as ImageDBFlat[]
  }
  if (typeof pagination?.offset === 'number') {
    return (await query.offset(pagination.offset)) as ImageDBFlat[]
  }
  return (await query) as ImageDBFlat[]
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
    return (await query
      .limit(pagination.limit)
      .offset(pagination.offset)) as ImageDBFlat[]
  }
  if (typeof pagination?.limit === 'number') {
    return (await query.limit(pagination.limit)) as ImageDBFlat[]
  }
  if (typeof pagination?.offset === 'number') {
    return (await query.offset(pagination.offset)) as ImageDBFlat[]
  }
  return (await query) as ImageDBFlat[]
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

  // Coerce legacy Cloudinary records onto the new provider contract until the data
  // migration rewrites persisted rows.
  if (nextValue.cdn === ImageCDN.cloudinary) {
    nextValue.cdn = ImageCDN.cloudflareR2
  }

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
  const intentOrderToUse = isAdmin ? adminIntentOrder : intentOrder

  return images.sort((a, b) => {
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
