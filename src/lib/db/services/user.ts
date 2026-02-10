// ENV
import { and, type SQL, eq, like, sql, or } from 'drizzle-orm'
// FORMS
import { superValidate } from 'sveltekit-superforms'
import { user, userFeature, userLayer } from '../schema'
// ZOD
import { zod } from 'sveltekit-superforms/adapters'
import { UserAPI, UserCollectionAPI, UserProfileAPI } from '../zod'
// TYPES
import type { SuperValidated } from 'sveltekit-superforms'
import type {
  Id,
  UserPartial,
  UserLayerDB,
  User,
  UserDB,
  UserRoleDisco,
  Database,
  UserFeatureDB,
  UserFeatureNew,
  UserLayerNew,
  UserRaw,
  CurrentUser,
  UserProfile,
} from '$lib/types'
import { update } from '../crud'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. COMMON
//    - userColumnsWithPrivacyProtected (const)
//
// 2. CRUD :: CORE OPERATIONS
//    - listUsers
//    - searchUsers
//    - getUser
//    - getUserById
//    - updateUser
//
// 3. CRUD :: RELATIONAL OPERATIONS
//    - updateUserWithRelated
//    - updateUserLayers
//    - updateUserFeatures
//
// 4. ROLES
//    - getUserRoles
//
// 5. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//

// ═══════════════════════
// 1. COMMON
// ═══════════════════════

export const userColumnsWithPrivacyProtected = {
  id: true,
  name: true,
  image: true,
  attribution: true,
}

// ═══════════════════════
// 2. CRUD :: CORE OPERATIONS
// ═══════════════════════

export const listUsers = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<UserRaw[]> => {
  return await db.query.user.findMany({
    with: withRelations,
    where: and(...conditions),
  })
}

export const searchUsers = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  search: string,
  searchColumns: string[] = ['name', 'email'],
): Promise<UserRaw[]> => {
  const searchConditions = searchColumns
    .map(column => {
      const userColumn = user[column as keyof typeof user]
      if (!userColumn) return null
      return like(sql`lower(${userColumn})`, `%${search.toLowerCase()}%`)
    })
    .filter(Boolean) as SQL<unknown>[]

  return await db.query.user.findMany({
    with: withRelations,
    where: and(...conditions, or(...searchConditions)),
  })
}

export const getUser = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  columns?: Record<string, boolean>,
): Promise<UserDB | undefined> =>
  await db.query.user.findFirst({
    with: withRelations,
    where: and(...conditions),
    ...(columns ? { columns } : {}),
  })

export const getUserById = async (
  db: Database,
  userId: Id,
  columns?: Record<string, boolean>,
): Promise<UserDB | undefined> => await getUser(db, {}, [eq(user.id, userId)], columns)

/**
 * Updates an existing user in the database
 * @param db - The database instance
 * @param data - The user data to update
 * @param userId - The ID of the user to update
 * @returns The updated user
 * @throws {Error} If the user update fails or user is not found
 */
export const updateUser = async (
  db: Database,
  data: UserPartial,
  userId: Id,
): Promise<UserDB> => await update(db, user, data, user.id, userId)

// UPDATE
export const updateUserWithRelated = async (
  db: Database,
  data: User,
  userId: Id,
): Promise<User> => {
  // Extract userLayers from data
  const userBase = await updateUser(db, data, userId)
  const userLayers = await updateUserLayers(db, data.userLayers, userId)
  const userFeatures = await updateUserFeatures(db, data.userFeatures, userId)
  return { ...userBase, userLayers, userFeatures } as User
}

// USER LAYER PREFERENCES
export const updateUserLayers = async (
  db: Database,
  userLayers: UserLayerNew[],
  userId: Id,
): Promise<UserLayerDB[]> => {
  // Delete existing layer preferences
  await db.delete(userLayer).where(eq(userLayer.userId, userId))

  // If no new preferences, we're done
  if (!userLayers?.length) return []

  // Insert new layer preferences
  return await db.insert(userLayer).values(userLayers).returning()
}

export const updateUserFeatures = async (
  db: Database,
  userFeatures: UserFeatureNew[],
  userId: Id,
): Promise<UserFeatureDB[]> => {
  // Delete existing feature preferences
  await db.delete(userFeature).where(eq(userFeature.userId, userId))

  // If no new preferences, we're done
  if (!userFeatures?.length) return []

  // Insert new feature preferences
  return await db.insert(userFeature).values(userFeatures).returning()
}

/**
 * Fetches and constructs user roles from the database.
 * @param db - The database instance to query.
 * @param userId - The ID of the user to fetch roles for.
 * @returns A Promise that resolves to an array of UserRole objects.
 *
 * @remarks
 * This function performs two separate database queries:
 * 1. It fetches organisation roles for the user.
 * 2. It fetches project roles for the user, including associated organisation information.
 *
 * The results are then mapped into UserRole objects and combined into a single array.
 *
 * Organisation roles are structured as:
 * - type: 'organisation'
 * - role: The user's role in the organisation
 * - organisation: The organisation
 * - organisation.i18n: The organisation's text content
 *
 * Project roles are structured as:
 * - type: 'project'
 * - role: The user's role in the project
 * - project: The project
 * - project.i18n: The project's text content
 * - project.organisation: The project's organisation
 */

export const getUserRoles = async (
  db: Database,
  userId: Id,
): Promise<UserRoleDisco[]> => {
  const hubRoles = await db.query.hubRole.findMany({
    where: (hubRole, { eq }) => eq(hubRole.userId, userId),
    with: {
      hub: {
        columns: {
          code: true,
        },
      },
    },
  })

  const orgRoles = await db.query.organisationRole.findMany({
    where: (organisationRole, { eq }) => eq(organisationRole.userId, userId),
    with: {
      organisation: {
        with: {
          i18n: true,
        },
      },
    },
  })

  const projectRoles = await db.query.projectRole.findMany({
    where: (projectRole, { eq }) => eq(projectRole.userId, userId),
    with: {
      project: {
        with: {
          i18n: true,
          organisation: {
            with: {
              i18n: true,
            },
          },
        },
      },
    },
  })

  return [
    ...hubRoles.map(role => ({
      ...role,
      type: 'hub',
    })),
    ...orgRoles.map(role => ({
      ...role,
      type: 'organisation',
    })),
    ...projectRoles.map(role => ({
      ...role,
      type: 'project',
    })),
  ] as UserRoleDisco[]
}

/********************
 *  5. UTILS :: SHAPING
 ************/

/**
 * Rebuilds form data from database entities
 * @param user - The user database entity
 * @param userLayers - Array of user layer preferences
 * @param userFeatures - Array of user feature interactions
 * @returns Validated form data
 */
export const toFormShape = async (
  user: UserDB,
  userLayers: UserLayerDB[] = [],
  userFeatures: any[] = [],
): Promise<SuperValidated<User>> => {
  const formData: User = {
    ...user,
    userLayers,
    userFeatures,
  }
  // @ts-expect-error TODO - Fix Zod type error
  const form = await superValidate(formData, zod(UserAPI) as any)
  return form as SuperValidated<User>
}

/**
 * Builds response data from database entities
 * @param user - The user database entity (can be partial from queries)
 * @param userLayers - Array of user layer preferences
 * @param userFeatures - Array of user feature interactions
 * @param isCollection - Whether this is for a collection response
 * @returns A parsed response shape
 */
export const toResponseShape = async (
  user: UserRaw,
  userLayers: UserLayerDB[] = [],
  userFeatures: any[] = [],
  isCollection: boolean = false,
  isSuperAdmin: boolean = false,
): Promise<User | UserProfile | CurrentUser> => {
  // Process contributor data if available
  let contributedFeatures: any = []
  let contributedImages: any = []

  // Group by project - return Record<projectId, id[]>
  const featuresGrouped: Record<string, string[]> = {}
  const imagesGrouped: Record<string, string[]> = {}

  // Group features by projectId
  if ((user as any).contributedFeatures) {
    ;(user as any).contributedFeatures
      .filter((feature: any) => feature.isPublished)
      .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .forEach((feature: any) => {
        if (!featuresGrouped[feature.projectId]) {
          featuresGrouped[feature.projectId] = []
        }
        featuresGrouped[feature.projectId].push(feature.id)
      })
  }

  // Group images by their feature's projectId
  if ((user as any).contributedImages) {
    ;(user as any).contributedImages
      .filter((image: any) => image.featureImage && image.featureImage.isPublished)
      .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .forEach((image: any) => {
        const projectId = image.featureImage?.feature?.projectId
        if (projectId) {
          if (!imagesGrouped[projectId]) {
            imagesGrouped[projectId] = []
          }
          imagesGrouped[projectId].push(image.id)
        }
      })
  }

  contributedFeatures = featuresGrouped
  contributedImages = imagesGrouped

  // Count tasks by type
  const tasks = (user as any).contributedTasks || []
  const reportedMissingCount = tasks.filter(
    (task: any) => task.type === 'reportedMissing',
  ).length
  const newPhotoCount = tasks.filter((task: any) => task.type === 'newPhoto').length
  const newFeatureCount = tasks.filter((task: any) => task.type === 'newFeature').length

  const data: any = {
    ...user,
    userLayers,
    userFeatures,
    roles: [
      ...user.hubRoles.map(role => ({
        ...role,
        type: 'hub',
      })),
      ...user.organisationRoles.map(role => ({
        ...role,
        type: 'organisation',
      })),
      ...user.projectRoles.map(role => ({
        ...role,
        type: 'project',
      })),
    ] as UserRoleDisco[],
    // Add contributor data - arrays of IDs
    contributedFeatures,
    contributedImages,
    reportedMissingCount,
    newPhotoCount,
    newFeatureCount,
    ...(isSuperAdmin ? { superAdmin: true } : {}),
  }

  return isCollection
    ? (UserCollectionAPI.parse(data) as User)
    : (UserProfileAPI.parse(data) as UserProfile)
}
