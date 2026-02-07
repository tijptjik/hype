// I18N
import { getLocale } from '$lib/i18n'
// TYPES
import type { Id, UserFeature, Feature, UserFeatureWithHierarchy } from '$lib/types'

// ═══════════════════════
// USER FEATURES CLIENT SERVICES
// ═══════════════════════

/**
 * Enhanced filter function that searches i18n properties across feature hierarchy
 * @param features - Array of features with hierarchy data
 * @param searchTerm - Search term to filter by
 * @returns Filtered array of features
 */
export const filterUserFeaturesByHierarchy = (
  features: UserFeatureWithHierarchy[],
  searchTerm: string,
): UserFeatureWithHierarchy[] => {
  if (!searchTerm) return features

  const searchLower = searchTerm.toLowerCase()
  const locale = getLocale()

  return features.filter(item => {
    const { feature, hierarchy } = item

    // Helper to search i18n properties safely
    const searchI18n = (resource: any, properties: string[]) => {
      if (!resource?.i18n?.[locale]) return false
      return properties.some(prop => {
        const value = resource.i18n[locale][prop]
        return value && value.toLowerCase().includes(searchLower)
      })
    }

    // Search feature properties
    if (searchI18n(feature, ['title', 'description', 'displayAddress'])) return true

    // Search hierarchy resources
    if (
      hierarchy.organisation &&
      searchI18n(hierarchy.organisation, ['name', 'nameShort', 'description'])
    )
      return true
    if (
      hierarchy.project &&
      searchI18n(hierarchy.project, ['name', 'nameShort', 'description'])
    )
      return true
    if (
      hierarchy.layer &&
      searchI18n(hierarchy.layer, ['name', 'nameShort', 'description'])
    )
      return true

    return false
  })
}

/**
 * Updates or creates a user feature relationship (wishlist/visited status)
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param isWishlisted - Whether the feature is wishlisted
 * @param isVisited - Whether the feature has been visited
 * @param visitedAt - When the feature was visited (if applicable)
 * @returns Promise resolving to the updated user feature
 */
export const updateUserFeature = async (
  userId: Id,
  featureId: Id,
  isWishlisted: boolean,
  isVisited: boolean,
  visitedAt?: string | null,
): Promise<UserFeature> => {
  const data = {
    userId,
    featureId,
    isWishlisted,
    isVisited,
    visitedAt,
  }

  const response = await fetch('/api/userFeatures', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to update user feature: ${errorText}`)
  }

  return response.json()
}

/**
 * Toggles the wishlist status of a feature for a user
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param currentWishlistStatus - Current wishlist status
 * @param currentVisitedStatus - Current visited status (to preserve)
 * @param visitedAt - When visited (if applicable, to preserve)
 * @returns Promise resolving to the updated user feature
 */
export const toggleWishlistStatus = async (
  userId: Id,
  featureId: Id,
  currentWishlistStatus: boolean,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature> => {
  return updateUserFeature(
    userId,
    featureId,
    !currentWishlistStatus,
    currentVisitedStatus,
    visitedAt,
  )
}

/**
 * Toggles the visited status of a feature for a user
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param currentVisitedStatus - Current visited status
 * @param currentWishlistStatus - Current wishlist status (to preserve)
 * @returns Promise resolving to the updated user feature
 */
export const toggleVisitedStatus = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean,
  currentWishlistStatus: boolean = false,
): Promise<UserFeature> => {
  const visitedAt = !currentVisitedStatus ? new Date().toISOString() : null

  return updateUserFeature(
    userId,
    featureId,
    currentWishlistStatus,
    !currentVisitedStatus,
    visitedAt,
  )
}

/**
 * Marks a feature as visited for a user
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param currentWishlistStatus - Current wishlist status (to preserve)
 * @returns Promise resolving to the updated user feature
 */
export const markAsVisited = async (
  userId: Id,
  featureId: Id,
  currentWishlistStatus: boolean = false,
): Promise<UserFeature> => {
  return updateUserFeature(
    userId,
    featureId,
    currentWishlistStatus,
    true,
    new Date().toISOString(),
  )
}

/**
 * Adds a feature to user's wishlist
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param currentVisitedStatus - Current visited status (to preserve)
 * @param visitedAt - When visited (if applicable, to preserve)
 * @returns Promise resolving to the updated user feature
 */
export const addToWishlist = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature> => {
  return updateUserFeature(userId, featureId, true, currentVisitedStatus, visitedAt)
}

/**
 * Removes a feature from user's wishlist
 * @param userId - ID of the user
 * @param featureId - ID of the feature
 * @param currentVisitedStatus - Current visited status (to preserve)
 * @param visitedAt - When visited (if applicable, to preserve)
 * @returns Promise resolving to the updated user feature
 */
export const removeFromWishlist = async (
  userId: Id,
  featureId: Id,
  currentVisitedStatus: boolean = false,
  visitedAt?: string | null,
): Promise<UserFeature> => {
  return updateUserFeature(userId, featureId, false, currentVisitedStatus, visitedAt)
}
