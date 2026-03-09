// I18N
import { getLocaleKey } from '$lib/i18n'
// API
import {
  addUserFeatureToList,
  removeUserFeatureFromList,
} from '$lib/api/server/user.remote'
// TYPES
import type { Feature, FeatureFromCollection, Id } from '$lib/types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  UserFeatureListItem as UserFeature,
  UserFeatureWithHierarchy,
} from '$lib/db/zod/schema/user.types'

type SearchableFeatureResource = Pick<Feature | FeatureFromCollection, 'i18n'>
type SearchableHierarchyResource = Pick<Organisation | Project | Layer, 'i18n'>

export const filterUserFeaturesByHierarchy = (
  features: UserFeatureWithHierarchy[],
  searchTerm: string,
): UserFeatureWithHierarchy[] => {
  if (!searchTerm) return features

  const searchLower = searchTerm.toLowerCase()
  const locale = getLocaleKey()

  return features.filter(item => {
    const { feature, hierarchy } = item

    const searchI18n = (
      resource:
        | SearchableFeatureResource
        | SearchableHierarchyResource
        | null
        | undefined,
      properties: string[],
    ): boolean => {
      const localeRecord = resource?.i18n?.[locale]
      if (!localeRecord) return false

      return properties.some(prop => {
        const value = (localeRecord as Record<string, string | null | undefined>)[prop]
        return typeof value === 'string' && value.toLowerCase().includes(searchLower)
      })
    }

    if (searchI18n(feature, ['title', 'description', 'displayAddress'])) {
      return true
    }
    if (searchI18n(hierarchy.organisation, ['name', 'nameShort', 'description'])) {
      return true
    }
    if (searchI18n(hierarchy.project, ['name', 'nameShort', 'description'])) {
      return true
    }
    if (searchI18n(hierarchy.layer, ['name', 'nameShort', 'description'])) {
      return true
    }

    return false
  })
}

export const updateUserFeature = async (
  userId: Id,
  featureId: Id,
  isWishlisted: boolean,
  isVisited: boolean,
  visitedAt?: string | null,
): Promise<UserFeature | null> => {
  let result: UserFeature | null = null

  if (isWishlisted) {
    const response = await addUserFeatureToList({
      userId,
      featureId,
      list: 'wishlist',
    })
    result = (response?.data as UserFeature | null) ?? result
  } else {
    const response = await removeUserFeatureFromList({
      userId,
      featureId,
      list: 'wishlist',
    })
    result = (response?.data as UserFeature | null) ?? result
  }

  if (isVisited) {
    const response = await addUserFeatureToList({
      userId,
      featureId,
      list: 'visited',
      visitedAt: visitedAt ?? new Date().toISOString(),
    })
    result = (response?.data as UserFeature | null) ?? result
  } else {
    const response = await removeUserFeatureFromList({
      userId,
      featureId,
      list: 'visited',
    })
    result = (response?.data as UserFeature | null) ?? result
  }

  return result
}

export const toggleWishlistStatus = async (
  userId: Id,
  featureId: Id,
  currentWishlistStatus: boolean,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature | null> =>
  updateUserFeature(
    userId,
    featureId,
    !currentWishlistStatus,
    currentVisitedStatus,
    visitedAt,
  )

export const toggleVisitedStatus = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean,
  currentWishlistStatus: boolean = false,
): Promise<UserFeature | null> => {
  const visitedAt = !currentVisitedStatus ? new Date().toISOString() : null

  return updateUserFeature(
    userId,
    featureId,
    currentWishlistStatus,
    !currentVisitedStatus,
    visitedAt,
  )
}

export const markAsVisited = async (
  userId: Id,
  featureId: Id,
  currentWishlistStatus: boolean = false,
): Promise<UserFeature | null> =>
  updateUserFeature(
    userId,
    featureId,
    currentWishlistStatus,
    true,
    new Date().toISOString(),
  )

export const addToWishlist = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature | null> =>
  updateUserFeature(userId, featureId, true, currentVisitedStatus, visitedAt)

export const removeFromWishlist = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature | null> =>
  updateUserFeature(userId, featureId, false, currentVisitedStatus, visitedAt)
