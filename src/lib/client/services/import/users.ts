// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. USER CSV IMPORT PLACEHOLDER
// - handleUserCSVDrop
//
// 1. USER LOOKUP
// - toImportUserResult
// - getImportUserId
// - validateUserById
// - validateUserByEmail
// - validateUserByUsername
// - searchUsers
// - handleUserSearch
// - handleResolutionUserSearch
//
// 2. USER MATCHING STATE
// - updateUserSearchResults
// - selectUser
// - selectFallbackUser
// - clearFallbackUser
// - updateResolutionUserSearchResults
// - clearResolutionSearch
//
// 3. USER RESOLUTION STATE
// - setUserResolution
// - removeUserResolution
// - canCompleteUserResolution
// - selectUserForResolution
// - selectImportUserForResolution
// - resetUserResolution
// - resetImportUserResolution
// - startUserResolution
//
// 4. USER VALIDATION AND ENRICHMENT
// - validateUsers
// - enrichFeaturesWithUserData
// ---

// API
import { getUser, searchUsers as searchUsersRemote } from '$lib/api/server/user.remote'

// TYPES
import type { ImportCtx } from '$lib/context/import.svelte'
import type {
  FeatureCSVColumn,
  UserValidationResult,
} from '$lib/client/services/import/types'

export interface UserCSVDropEvent {
  acceptedFiles: File[]
  type: 'users'
}

type ImportUserSearchResult = {
  id: string
  name?: string | null
  email?: string | null
  username?: string | null
  image?: string | null
}

type UserResolutionMap = Map<string, { userId: string; userData?: unknown }>

/********************
 *  0. USER CSV IMPORT PLACEHOLDER
 ************/
// +++ User Csv Import Placeholder

/**
 * Placeholder for direct user CSV import support.
 *
 * @param event - User CSV drop payload.
 * @param onFileProcessed - Callback reserved for future parsed file output.
 * @returns A promise that resolves once the placeholder handler has completed.
 * @remarks Feature import user matching is implemented below; standalone user CSV
 * import remains intentionally unimplemented.
 */
export async function handleUserCSVDrop(
  event: UserCSVDropEvent,
  onFileProcessed: (file: File, data: unknown) => void,
): Promise<void> {
  void event
  void onFileProcessed
  console.warn('User CSV import is not yet implemented')
}

// ---
/********************
 *  1. USER LOOKUP
 ************/
// +++ User Lookup

/**
 * Normalize API search users into the shape consumed by feature-import UI state.
 *
 * @param user - User search result returned by the remote API.
 * @returns User validation result with both `id` and `userId` populated.
 */
function toImportUserResult(user: ImportUserSearchResult): UserValidationResult {
  return {
    id: user.id,
    value: user.id,
    isValid: true,
    userId: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  }
}

/**
 * Resolve a selectable user identifier from validation or search result data.
 *
 * @param user - User search or validation result.
 * @returns The concrete user id, or `null` when the result is not selectable.
 */
export function getImportUserId(user: UserValidationResult): string | null {
  return user.id ?? user.userId ?? null
}

/**
 * Validate that a user id exists.
 *
 * @param userId - Candidate user id.
 * @returns Whether the user id resolves to an admin-visible user.
 */
export async function validateUserById(userId: string): Promise<boolean> {
  try {
    const result = await getUser({
      ref: userId,
      refKey: 'id',
      meta: { isAdminRequest: true, profile: 'card' },
    })
    return Boolean(result.data)
  } catch (error) {
    console.error('Error validating user by ID:', error)
    return false
  }
}

/**
 * Validate a user by exact email match.
 *
 * @param email - Candidate email address.
 * @returns Validation result and matched user id when found.
 */
export async function validateUserByEmail(
  email: string,
): Promise<{ isValid: boolean; userId?: string }> {
  try {
    const users = await searchUsers(email)
    const matchedUser = users.find(
      user => user.email?.toLowerCase() === email.toLowerCase(),
    )
    return {
      isValid: Boolean(matchedUser),
      userId: matchedUser?.userId,
    }
  } catch (error) {
    console.error('Error validating user by email:', error)
    return { isValid: false }
  }
}

/**
 * Validate a user by username lookup.
 *
 * @param username - Candidate username.
 * @returns Validation result and matched user id when found.
 */
export async function validateUserByUsername(
  username: string,
): Promise<{ isValid: boolean; userId?: string }> {
  try {
    const result = await getUser({
      ref: username,
      refKey: 'username',
      meta: { isAdminRequest: true, profile: 'card' },
    })
    const user = result.data
    return {
      isValid: Boolean(user),
      userId: user?.id,
    }
  } catch (error) {
    console.error('Error validating user by username:', error)
    return { isValid: false }
  }
}

/**
 * Search admin-visible users for import matching.
 *
 * @param query - User-entered search query.
 * @returns Normalized user search results suitable for selection controls.
 */
export async function searchUsers(query: string): Promise<UserValidationResult[]> {
  try {
    const result = await searchUsersRemote({
      q: query,
      pagination: { limit: 20, offset: 0 },
    })
    return result.data.map(toImportUserResult)
  } catch (error) {
    console.error('Error searching users:', error)
    return []
  }
}

/**
 * Search users for fallback contributor selection.
 *
 * @param query - User-entered search query.
 * @returns Empty results until the query is at least two characters.
 */
export async function handleUserSearch(query: string): Promise<UserValidationResult[]> {
  if (query.length < 2) return []
  return await searchUsers(query)
}

/**
 * Search users for invalid-value resolution.
 *
 * @param query - User-entered search query.
 * @returns Empty results until the query is at least two characters.
 */
export async function handleResolutionUserSearch(
  query: string,
): Promise<UserValidationResult[]> {
  if (query.length < 2) return []
  return await searchUsers(query)
}

// ---
/********************
 *  2. USER MATCHING STATE
 ************/
// +++ User Matching State

/**
 * Update fallback user search state from a query string.
 *
 * @param importCtx - Active import context.
 * @param query - User-entered search query.
 * @returns A promise that resolves after remote results have been stored.
 */
export async function updateUserSearchResults(
  importCtx: ImportCtx,
  query: string,
): Promise<void> {
  importCtx.setUserSearchQuery(query)
  const results = await handleUserSearch(query)
  importCtx.setUserSearchResults(results)
}

/**
 * Resolve a user selection into a fallback id.
 *
 * @param user - Selected user result.
 * @param setFallbackUserId - Callback that stores the selected user id.
 * @returns The selected user result.
 */
export function selectUser(
  user: UserValidationResult,
  setFallbackUserId: (id: string) => void,
): UserValidationResult {
  const userId = getImportUserId(user)
  if (userId) {
    setFallbackUserId(userId)
  }
  return user
}

/**
 * Select the fallback contributor for imports without a user column.
 *
 * @param importCtx - Active import context.
 * @param user - Selected user result.
 * @returns Whether a selectable user id was found and stored.
 */
export function selectFallbackUser(
  importCtx: ImportCtx,
  user: UserValidationResult,
): boolean {
  const userId = getImportUserId(user)
  if (!userId) return false

  importCtx.setUserValidation({ fallbackUserId: userId, fallbackUserData: user })
  importCtx.setUserSearchQuery('')
  importCtx.setUserSearchResults([])
  return true
}

/**
 * Clear the fallback contributor selection.
 *
 * @param importCtx - Active import context.
 */
export function clearFallbackUser(importCtx: ImportCtx): void {
  importCtx.setUserValidation({
    fallbackUserId: undefined,
    fallbackUserData: undefined,
  })
}

/**
 * Update per-invalid-value user resolution search state.
 *
 * @param importCtx - Active import context.
 * @param invalidValue - Invalid CSV user value being resolved.
 * @param query - User-entered search query.
 * @returns A promise that resolves after search state has been updated.
 */
export async function updateResolutionUserSearchResults(
  importCtx: ImportCtx,
  invalidValue: string,
  query: string,
): Promise<void> {
  const queries = importCtx.getResolutionSearchQueries()
  queries.set(invalidValue, query)
  importCtx.setResolutionSearchQueries(new Map(queries))

  const searchResults = importCtx.getResolutionSearchResults()
  if (query.length < 2) {
    searchResults.delete(invalidValue)
    importCtx.setResolutionSearchResults(new Map(searchResults))
    return
  }

  searchResults.set(invalidValue, await handleResolutionUserSearch(query))
  importCtx.setResolutionSearchResults(new Map(searchResults))
}

/**
 * Clear the search query and result list for one invalid user value.
 *
 * @param importCtx - Active import context.
 * @param invalidValue - Invalid CSV user value whose search state should clear.
 */
export function clearResolutionSearch(
  importCtx: ImportCtx,
  invalidValue: string,
): void {
  const searchResults = importCtx.getResolutionSearchResults()
  searchResults.delete(invalidValue)
  importCtx.setResolutionSearchResults(new Map(searchResults))

  const queries = importCtx.getResolutionSearchQueries()
  queries.delete(invalidValue)
  importCtx.setResolutionSearchQueries(new Map(queries))
}

// ---
/********************
 *  3. USER RESOLUTION STATE
 ************/
// +++ User Resolution State

/**
 * Store a replacement user for an invalid CSV user value.
 *
 * @param invalidValue - Invalid CSV user value.
 * @param userId - Replacement user id.
 * @param userData - Optional user result used for UI display.
 * @param resolutions - Existing resolution map.
 * @returns New resolution map with the replacement stored.
 */
export function setUserResolution(
  invalidValue: string,
  userId: string,
  userData: unknown,
  resolutions: UserResolutionMap,
): UserResolutionMap {
  resolutions.set(invalidValue, { userId, userData })
  return new Map(resolutions)
}

/**
 * Remove one invalid-value replacement.
 *
 * @param invalidValue - Invalid CSV user value.
 * @param resolutions - Existing resolution map.
 * @returns New resolution map without the replacement.
 */
export function removeUserResolution(
  invalidValue: string,
  resolutions: UserResolutionMap,
): UserResolutionMap {
  resolutions.delete(invalidValue)
  return new Map(resolutions)
}

/**
 * Check whether every invalid user value has a replacement.
 *
 * @param invalidValues - Invalid CSV user values.
 * @param resolutions - Existing resolution map.
 * @returns Whether all invalid values have stored replacements.
 */
export function canCompleteUserResolution(
  invalidValues: string[],
  resolutions: UserResolutionMap,
): boolean {
  return invalidValues.every(value => resolutions.has(value))
}

/**
 * Store a selected replacement user in an existing resolution map.
 *
 * @param invalidValue - Invalid CSV user value.
 * @param user - Replacement user result.
 * @param resolutions - Existing resolution map.
 * @returns New resolution map with the replacement stored.
 */
export function selectUserForResolution(
  invalidValue: string,
  user: UserValidationResult,
  resolutions: UserResolutionMap,
): UserResolutionMap {
  const userId = getImportUserId(user)
  if (!userId) return new Map(resolutions)
  return setUserResolution(invalidValue, userId, user, resolutions)
}

/**
 * Select and store a replacement user in the active import context.
 *
 * @param importCtx - Active import context.
 * @param invalidValue - Invalid CSV user value.
 * @param user - Replacement user result.
 * @returns Whether a selectable user id was found and stored.
 */
export function selectImportUserForResolution(
  importCtx: ImportCtx,
  invalidValue: string,
  user: UserValidationResult,
): boolean {
  const userId = getImportUserId(user)
  if (!userId) return false

  const userResolution = importCtx.getUserResolution()
  importCtx.setUserResolution({
    invalidValues: userResolution.invalidValues,
    resolutions: setUserResolution(
      invalidValue,
      userId,
      user,
      userResolution.resolutions,
    ),
  })
  clearResolutionSearch(importCtx, invalidValue)
  return true
}

/**
 * Remove a selected replacement user from an existing resolution map.
 *
 * @param invalidValue - Invalid CSV user value.
 * @param resolutions - Existing resolution map.
 * @returns New resolution map without the replacement.
 */
export function resetUserResolution(
  invalidValue: string,
  resolutions: UserResolutionMap,
): UserResolutionMap {
  return removeUserResolution(invalidValue, resolutions)
}

/**
 * Remove a selected replacement user from the active import context.
 *
 * @param importCtx - Active import context.
 * @param invalidValue - Invalid CSV user value.
 */
export function resetImportUserResolution(
  importCtx: ImportCtx,
  invalidValue: string,
): void {
  const userResolution = importCtx.getUserResolution()
  importCtx.setUserResolution({
    invalidValues: userResolution.invalidValues,
    resolutions: resetUserResolution(invalidValue, userResolution.resolutions),
  })

  const queries = importCtx.getResolutionSearchQueries()
  queries.set(invalidValue, '')
  importCtx.setResolutionSearchQueries(new Map(queries))
}

/**
 * Build initial resolution state from failed validation results.
 *
 * @param results - Completed user validation results.
 * @returns Initial invalid-value resolution state.
 */
export function startUserResolution(results: UserValidationResult[]): {
  invalidValues: string[]
  resolutions: UserResolutionMap
} {
  const invalidResults = results.filter(result => !result.isValid)
  return {
    invalidValues: invalidResults.map(result => result.value),
    resolutions: new Map(),
  }
}

// ---
/********************
 *  4. USER VALIDATION AND ENRICHMENT
 ************/
// +++ User Validation And Enrichment

/**
 * Validate unique CSV user values against the selected user field.
 *
 * @param userColumns - Columns mapped to the User model.
 * @param sampleData - CSV row data.
 * @param headers - CSV headers.
 * @param onProgress - Receives validation progress updates.
 * @param onResults - Receives the completed validation result list.
 * @returns Invalid count and all validation results.
 * @remarks The current import UX intentionally emits progress slowly so users can
 * see validation state during small imports.
 */
export async function validateUsers(
  userColumns: FeatureCSVColumn[],
  sampleData: string[][],
  headers: string[],
  onProgress: (progress: number, total: number) => void,
  onResults: (results: UserValidationResult[]) => void,
): Promise<{ invalidCount: number; results: UserValidationResult[] }> {
  const userValues = new Set<string>()
  const userColumnIndices = userColumns.map(column => headers.indexOf(column.header))

  // Collect all unique non-empty user values before remote validation.
  sampleData.forEach(row => {
    userColumnIndices.forEach(columnIndex => {
      const value = row[columnIndex]?.trim()
      if (value) {
        userValues.add(value)
      }
    })
  })

  const uniqueValues = Array.from(userValues)
  const results: UserValidationResult[] = []
  const userField = userColumns[0].field

  for (let index = 0; index < uniqueValues.length; index++) {
    const value = uniqueValues[index]
    let result: UserValidationResult

    try {
      if (userField === 'id') {
        const isValid = await validateUserById(value)
        result = { value, isValid, userId: isValid ? value : undefined }
      } else if (userField === 'email') {
        const validation = await validateUserByEmail(value)
        result = { value, isValid: validation.isValid, userId: validation.userId }
      } else if (userField === 'username') {
        const validation = await validateUserByUsername(value)
        result = { value, isValid: validation.isValid, userId: validation.userId }
      } else {
        result = { value, isValid: false, error: 'Unknown field type' }
      }
    } catch (error) {
      result = {
        value,
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      }
    }

    results.push(result)
    onProgress(index + 1, uniqueValues.length)

    // Keep progress visible for small validation batches.
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  onResults(results)

  const invalidResults = results.filter(result => !result.isValid)
  return { invalidCount: invalidResults.length, results }
}

/**
 * Enrich parsed feature rows with validated or resolved user ids.
 *
 * @param importCtx - Active import context.
 * @param validationResults - Completed user validation results.
 * @remarks Rows use the first valid mapped user value. If none exists, a selected
 * fallback user is applied when available.
 */
export function enrichFeaturesWithUserData(
  importCtx: ImportCtx,
  validationResults: UserValidationResult[],
): void {
  const data = importCtx.getData()
  const columns = importCtx.getColumns()
  const headers = importCtx.getHeaders()

  const userColumns = columns.filter(column => column.modelType === 'User')
  if (userColumns.length === 0) {
    const userValidation = importCtx.getUserValidation()
    if (userValidation.fallbackUserId) {
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const enriched = importCtx.getRowEnrichedData(rowIndex) || {}
        enriched.user = { id: userValidation.fallbackUserId }
        importCtx.setRowEnrichedData(rowIndex, enriched)
      }
    }
    return
  }

  const userValueToId = new Map<string, string>()
  validationResults.forEach(result => {
    if (result.isValid && result.userId) {
      userValueToId.set(result.value, result.userId)
    }
  })

  const userResolution = importCtx.getUserResolution()
  userResolution.resolutions.forEach((resolution, invalidValue) => {
    if (resolution.userId) {
      userValueToId.set(invalidValue, resolution.userId)
    }
  })

  const userColumnIndices = userColumns.map(column => headers.indexOf(column.header))

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {}

    // Use the first mapped user column with a validated or resolved user id.
    for (const columnIndex of userColumnIndices) {
      const userValue = row[columnIndex]?.trim()
      if (userValue && userValueToId.has(userValue)) {
        const userId = userValueToId.get(userValue)
        if (userId) {
          enriched.user = { id: userId }
        }
        break
      }
    }

    if (!enriched.user) {
      const userValidation = importCtx.getUserValidation()
      if (userValidation.fallbackUserId) {
        enriched.user = { id: userValidation.fallbackUserId }
      }
    }
    importCtx.setRowEnrichedData(rowIndex, enriched)
  }
}

// ---
