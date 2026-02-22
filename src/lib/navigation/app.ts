// I18N
import { m } from '$lib/i18n'
// SVELTE
import { goto, pushState, replaceState } from '$app/navigation'
// SERVICES
import { getImageById } from '$lib/api/server/image.remote'
// LIB
import { isMobile } from '$lib/constants'
// ENUMS
import {
  FirstClassResource,
  PanelRight,
  PanelLeft,
  ResourcePath,
  PanelSide,
  Panel,
} from '$lib/enums'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { OmniCtx } from '$lib/context/omni.svelte'
import type {
  Code,
  CollectionNavOptions,
  Id,
  NavigableResource,
  Locale,
  FeatureFromCollection,
  Feature,
  Image,
  UserFeatureWithHierarchy,
} from '$lib/types'

// ═══════════════════════
// 1. CORE NAVIGATION
// ═══════════════════════

/**
 * Navigate to a resource on the user-facing app with flexible parameter handling.
 * @param resource - The resource to navigate to
 * @param entityRef - The entity reference to navigate to
 * @param params - Parameters to add to the URL:
 *   - string: string - adds as single param to URL
 *   - string: string[] - adds multiple times to URL (for array values)
 * @param paramOpts - Options for handling URL parameters:
 *   - dropAll: When true, doesn't append ANY query params
 *   - dropPanels: When true, retains other params but drops panel-related params (panel, username)
 *   - dropImage: When true, retains other params but drops image-related params (imageId, fullscreen)
 */
export const navigate = (
  resource: NavigableResource | '/',
  entityRef?: Id,
  navOptions: {
    paramsToDrop?: string[]
    paramsToAdd?: Record<string, string>
  } = {
    paramsToDrop: [],
    paramsToAdd: {},
  },
) => {
  const paramSets = {
    panels: ['panel', 'username'],
    image: ['imageId'],
  }

  let baseUrl = '/'
  if (resource !== '/') {
    baseUrl = `/${ResourcePath[resource]}/${entityRef}`
  }

  // Get current URL parameters
  const currentParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )

  // Process parameter drops (applied BEFORE adding new params)
  if (navOptions.paramsToDrop) {
    navOptions.paramsToDrop.forEach(param => {
      currentParams.delete(param)
    })
  }

  // Add new parameters from the params argumen
  Object.entries(navOptions.paramsToAdd || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Remove existing values for this key first
      currentParams.delete(key)
      // Add all values from the array
      value.forEach(v => {
        currentParams.append(key, v)
      })
    } else {
      // Single value - set (replaces existing)
      currentParams.set(key, value)
    }
  })

  // Adhere to mobile-only panel rules
  if (isMobile()) {
    // Remove panel-related parameters
    paramSets.panels.forEach(param => {
      currentParams.delete(param)
    })
  }

  // Build final URL
  const queryString = currentParams.toString()
  const finalUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl
  // Only navigate if the URL has changed
  if (window.location.pathname + window.location.search !== finalUrl) {
    goto(finalUrl)
  }
}

// ═══════════════════════
// 2. URL UTILITIES
// ═══════════════════════

export const reversePath = new Map<string, FirstClassResource>()

if (ResourcePath) {
  Object.keys(ResourcePath).forEach((path: string) => {
    const pathValue: string = ResourcePath[path as keyof typeof ResourcePath]
    reversePath.set(pathValue, path as FirstClassResource)
  })
}

// TODO add proper support for navigation state on appCtx so that
// we can use it in components which are used in both admin and (app)
export const getActiveResourceAndRefFromUrl = (): {
  resourceType: FirstClassResource | false
  resourceRef: Id | Code | false
  facet: string | false
} => {
  const urlObj = new URL(window.location.href)
  const pathParts = urlObj.pathname.split('/').filter(Boolean)

  const resourceType = reversePath.get(pathParts[0]) || false
  const resourceRef = pathParts[1] || false

  return {
    resourceType,
    resourceRef,
    facet: urlObj.hash.slice(1) || false,
  }
}

// ═══════════════════════
// 5. PANEL ROUTING
// ═══════════════════════

/**
 * Get the last panel parameter from URL search params
 * @param searchParams - URL search params
 * @param side - Optional side filter ('left' or 'right')
 * @returns The last panel parameter for the specified side, or overall last if no side specified
 */
export const getLastPanelParam = (
  searchParams: URLSearchParams,
  side: PanelSide | null = null,
): string | null => {
  const panels = searchParams.getAll('panel') as Panel[]
  if (panels.length === 0) return null

  if (side === null) {
    // Return the very last panel parameter
    return panels[panels.length - 1]
  }

  // For sided panels, we need to determine which panels go to which side
  const leftPanels = Object.values(PanelLeft)
  const rightPanels = Object.values(PanelRight)

  if (side === 'left') {
    // Find the last panel that belongs to the left side
    for (let i = panels.length - 1; i >= 0; i--) {
      if (leftPanels.includes(panels[i] as unknown as PanelLeft)) {
        return panels[i]
      }
    }
  } else if (side === 'right') {
    // Find the last panel that belongs to the right side
    for (let i = panels.length - 1; i >= 0; i--) {
      if (rightPanels.includes(panels[i] as unknown as PanelRight)) {
        return panels[i]
      }
    }
  }

  return null
}

/**
 * Handle panel parameters from URL and update AppCtx accordingly
 * @param appCtx - Application context
 * @param searchParams - URL search params
 */
export const handlePanelParams = (appCtx: AppCtx, searchParams: URLSearchParams) => {
  if (isMobile()) {
    // On mobile, only one panel can be active - use the last panel parameter
    const lastPanel = getLastPanelParam(searchParams)

    if (lastPanel && isValidPanelType(lastPanel)) {
      handleStatefulPanelParams(appCtx, lastPanel, searchParams, false)
    }
  } else {
    // On desktop, both left and right panels can be active
    const leftPanel = getLastPanelParam(searchParams, PanelSide.left)
    const rightPanel = getLastPanelParam(searchParams, PanelSide.right)

    if (leftPanel && isValidPanelType(leftPanel)) {
      // Don't update URL when syncing FROM URL to prevent infinite loops
      appCtx.openPanel(leftPanel, false)
    }

    if (rightPanel && isValidPanelType(rightPanel)) {
      handleStatefulPanelParams(appCtx, rightPanel, searchParams, false)
    }
  }
}

/**
 * Check if a string is a valid panel type
 * @param panel - Panel string to validate
 * @returns Whether the panel is a valid PanelState key
 */
const isValidPanelType = (panel: string): panel is Panel => {
  return Object.values(Panel).includes(panel as Panel)
}

/**
 * Update URL to reflect current panel state
 * @param panelState - Current panel state from AppCtx (Record of panel name to boolean)
 * @param appCtx - Optional AppCtx to preserve stateful parameters
 */
export const updatePanelUrlParams = (
  panelState: Record<string, boolean>,
  appCtx?: AppCtx,
) => {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const searchParams = url.searchParams

  // CONSISTENCY CHECK: If URL already matches the panel state, return early
  const currentPanels = searchParams.getAll('panel')
  const currentUsername = searchParams.get('username')

  // Build expected panel list from panelState
  const expectedPanels = Object.entries(panelState)
    .filter(([panelName, isOpen]) => isOpen && isValidPanelType(panelName))
    .map(([panelName]) => panelName)
    .sort()

  // Build expected username based on profile panel state
  const expectedUsername = panelState.profile
    ? currentUsername || appCtx?.state?.panels?.profile?.ctx?.username || null
    : null

  // Compare current vs expected
  const panelsMatch = currentPanels.sort().join(',') === expectedPanels.join(',')
  const usernameMatch = currentUsername === expectedUsername

  if (panelsMatch && usernameMatch) {
    return
  }

  // Preserve stateful parameters for specific panels
  const statefulParams: Record<string, string | null> = {}

  // Preserve username parameter ONLY if profile panel is actually open
  if (panelState.profile) {
    const currentUsername =
      searchParams.get('username') || appCtx?.state?.panels?.profile?.ctx?.username
    if (currentUsername) {
      statefulParams.username = currentUsername
    }
  } else {
    searchParams.delete('username')
  }

  // Clear all existing panel parameters
  searchParams.delete('panel')

  // Add active panels to URL
  Object.entries(panelState).forEach(([panelName, isOpen]) => {
    if (isOpen && isValidPanelType(panelName)) {
      searchParams.append('panel', panelName)
    }
  })

  // Restore stateful parameters
  Object.entries(statefulParams).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value)
    }
  })

  // Update URL and add to browser history for back/forward navigation
  const newUrl = `${url.pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}${url.hash}`
  window.history.pushState({}, '', newUrl)
}

/**
 * Handle stateful panel parameters (like profile with username)
 * @param appCtx - Application context
 * @param panelType - Panel type to handle
 * @param searchParams - URL search parameters
 * @param updateUrl - Whether to update URL
 */
const handleStatefulPanelParams = (
  appCtx: AppCtx,
  panelType: string,
  searchParams: URLSearchParams,
  updateUrl: boolean = false,
): void => {
  if (panelType === 'profile') {
    const username = searchParams.get('username')
    if (username && appCtx.state.panels.profile.ctx) {
      appCtx.state.panels.profile.ctx.username = username
    }
  }

  // Don't update URL when syncing FROM URL to prevent infinite loops
  if (isValidPanelType(panelType)) {
    appCtx.openPanel(panelType, updateUrl)
  }
}

export const getUrlParam = (param: string): string | null => {
  const url = new URL(window.location.href)
  return url.searchParams.get(param)
}

// ═══════════════════════
// 6. IMAGE PARAMETER MANAGEMENT
// ═══════════════════════

/**
 * Parse image parameters from URL search params
 * @param searchParams - URL search params
 * @returns Object containing imageId and fullscreen flag
 */
export const getImageParams = (
  searchParams: URLSearchParams,
): {
  imageId: string | null
  fullscreen: boolean
} => {
  const imageId = searchParams.get('imageId')
  const fullscreen = searchParams.get('fullscreen') === 'true'

  return {
    imageId,
    fullscreen,
  }
}

/**
 * Handle image parameters from URL and return image configuration
 * @param searchParams - URL search params
 * @returns Promise resolving to image configuration for ImageProvider
 */
export const handleImageParams = async (
  searchParams: URLSearchParams,
): Promise<{
  targetImageId?: string
  isFullScreen?: boolean
  targetImage?: unknown
} | null> => {
  const { imageId, fullscreen } = getImageParams(searchParams)

  if (!imageId) {
    return null
  }

  // Skip API calls for staged images - they only exist locally
  if (imageId.startsWith('staged-')) {
    return {
      targetImageId: imageId,
      isFullScreen: fullscreen,
      targetImage: null, // Will be handled by imageCtx locally
    }
  }

  try {
    const target = await getImageById({
      id: imageId,
      meta: { isAdminRequest: true },
    })
    if (!target?.data?.image) return null

    return {
      targetImageId: imageId,
      isFullScreen: fullscreen,
      targetImage: target.data.image,
    }
  } catch (error) {
    console.error('Error fetching image for deep link:', error)
    return null
  }
}

export const addParamToUrl = (
  param: string,
  value: string,
  pageState: App.PageState = {},
  replace: boolean = false,
  reload: boolean = true,
) => {
  handleUrlParamChange(
    url => url.searchParams.set(param, value),
    pageState,
    replace,
    reload,
  )
}

export const removeParamFromUrl = (
  param: string,
  pageState: App.PageState = {},
  replace: boolean = false,
  reload: boolean = true,
) => {
  handleUrlParamChange(
    url => url.searchParams.delete(param),
    pageState,
    replace,
    reload,
  )
}

// ═══════════════════════
// 7. COLLECTION NAVIGATION
// ═══════════════════════

/**
 * Navigate to a contributed feature with collection context
 */
export const navigateToContributedFeature = async (
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  featureId: string,
  projectId: Id,
  features: (FeatureFromCollection | Feature)[],
  projectName: string,
  username: string,
) => {
  if (!username) return

  initializeCollectionNavigation(omniCtx, appCtx, features)

  const expectedCollectionId = `${username}${projectId}Features`
  const navOptions = {
    openCard: true,
    navOptions: {
      paramsToDrop: ['imageId'],
    },
  }
  const collectionTitle = {
    en: `${projectName} by ${username}`,
    'zh-hant': `貢獻者 ${username}`,
    'zh-hans': `贡献者 ${username}`,
  } as Record<Locale, string>

  handleCollectionNavigation(
    omniCtx,
    expectedCollectionId,
    featureId,
    navOptions,
    features,
    collectionTitle,
  )
}

/**
 * Navigate to a contributed image with collection context
 */
export const navigateToContributedImage = async (
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  featureId: string,
  projectId: Id,
  imageId: string,
  projectName: string,
  username: string,
  loadedImages: Map<string, Image>,
  projectImageIds: Record<Id, Id[]>,
) => {
  if (!username) return

  const imageIds = projectImageIds[projectId]

  // Get features from images
  const features = await getFeaturesFromImages(
    appCtx,
    imageIds.map(id => loadedImages.get(id)).filter(Boolean) as Image[],
  )

  initializeCollectionNavigation(omniCtx, appCtx, features)

  const expectedCollectionId = `${username}${projectId}Images`
  const navOptions = {
    openCard: true,
    navOptions: {
      paramsToDrop: ['imageId'],
      paramsToAdd: {
        imageId,
        fullscreen: 'true',
      },
    },
  }
  const collectionTitle = {
    en: `<b>${projectName}</b> with 📷 by <b>${username}</b>`,
    'zh-hant': `<b>${projectName}</b> 📷 貢獻者 <b>${username}</b>`,
    'zh-hans': `<b>${projectName}</b> 📷 贡献者 <b>${username}</b>`,
  } as Record<Locale, string>

  handleCollectionNavigation(
    omniCtx,
    expectedCollectionId,
    featureId,
    navOptions,
    features,
    collectionTitle,
  )
}

/**
 * Navigate to a starred feature with collection context
 */
export const navigateToStarred = async (
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  featureId: string,
  wishlistedFeatures: UserFeatureWithHierarchy[],
) => {
  initializeCollectionNavigation(omniCtx, appCtx, wishlistedFeatures)

  const expectedCollectionId = `stars`
  const navOptions = {
    openCard: true,
    navOptions: {
      paramsToDrop: ['imageId'],
    },
  }
  const collectionTitle = {
    en: m.omni__title_star_walks(),
    'zh-hant': m.omni__title_star_walks(),
    'zh-hans': m.omni__title_star_walks(),
  } as Record<Locale, string>

  handleCollectionNavigation(
    omniCtx,
    expectedCollectionId,
    featureId,
    navOptions,
    wishlistedFeatures.map(w => w.feature),
    collectionTitle,
  )
}

/**
 * Navigate to a visited feature with collection context
 */
export const navigateToVisited = async (
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  featureId: string,
  visitedFeatures: UserFeatureWithHierarchy[],
) => {
  initializeCollectionNavigation(omniCtx, appCtx, visitedFeatures)

  const expectedCollectionId = `visited`
  const navOptions = {
    openCard: true,
    navOptions: {
      paramsToDrop: ['imageId'],
    },
  }
  const collectionTitle = {
    en: m.omni__title_visited_walks(),
    'zh-hant': m.omni__title_visited_walks(),
    'zh-hans': m.omni__title_visited_walks(),
  } as Record<Locale, string>

  handleCollectionNavigation(
    omniCtx,
    expectedCollectionId,
    featureId,
    navOptions,
    visitedFeatures.map(v => v.feature),
    collectionTitle,
  )
}

export const getFeaturesFromImages = async (
  appCtx: AppCtx,
  images: Image[],
): Promise<(FeatureFromCollection | Feature)[]> => {
  const featureIds = [
    ...new Set(images.map(img => img.featureId).filter((f): f is string => !!f)),
  ]
  const features = await Promise.all(
    featureIds.map(featureId => appCtx.getFeatureById(featureId)),
  )
  return features.filter(Boolean) as (FeatureFromCollection | Feature)[]
}

// ═══════════════════════
// 8. UTILITY FUNCTIONS
// ═══════════════════════

/**
 * Activate layers for a collection of features
 * @param appCtx - Application context
 * @param features - Features to extract layer IDs from
 */
const activateLayersForFeatures = (
  appCtx: AppCtx,
  features: (FeatureFromCollection | Feature | UserFeatureWithHierarchy)[],
): void => {
  const layerIds = Array.from(
    new Set([
      ...features
        .map(f => {
          // Handle UserFeatureWithHierarchy type
          if ('feature' in f && f.feature) {
            return f.feature.layerId
          }
          // Handle direct feature types
          return (f as FeatureFromCollection | Feature).layerId
        })
        .filter(Boolean),
      ...appCtx.getPrism(FirstClassResource.layer),
    ]),
  )
  appCtx.setLayers(layerIds)
}

/**
 * Handle collection navigation with switch/initialize logic
 * @param omniCtx - Omni context
 * @param collectionId - Collection ID to check/initialize
 * @param featureId - Feature ID to navigate to
 * @param baseNavOptions - Base navigation options
 * @param features - Features for collection
 * @param collectionTitle - Collection title in multiple locales
 * @param additionalNavOptions - Additional navigation options for initialization
 */
const handleCollectionNavigation = (
  omniCtx: OmniCtx,
  collectionId: string,
  featureId: string,
  baseNavOptions: CollectionNavOptions,
  features: (FeatureFromCollection | Feature)[],
  collectionTitle: Record<Locale, string>,
  additionalNavOptions: CollectionNavOptions = {},
): void => {
  // Check if we can switch within the current collection
  if (omniCtx.isCollectionInitialized(collectionId)) {
    // Switch to the feature within the existing collection
    omniCtx.switchToFeatureInCollection(featureId, baseNavOptions)
  } else {
    // Initialize new collection
    omniCtx.initWalk(
      collectionId,
      {
        activeFeatureId: featureId,
        focus: false,
        highlight: true,
        focusFeature: true,
        openCard: true,
        ...baseNavOptions,
        ...additionalNavOptions,
      },
      features,
      collectionTitle,
    )
  }
}

/**
 * Handle URL parameter changes with consistent replace/reload logic
 * @param urlModifier - Function to modify the URL object
 * @param pageState - Page state for pushState/replaceState
 * @param replace - Whether to replace the current history entry
 * @param reload - Whether to trigger a page reload
 */
const handleUrlParamChange = (
  urlModifier: (url: URL) => void,
  pageState: App.PageState = {},
  replace: boolean = false,
  reload: boolean = true,
): void => {
  const urlObj = new URL(window.location.href)
  urlModifier(urlObj)

  if (replace) {
    if (reload) {
      goto(urlObj.toString(), { noScroll: true, replaceState: true })
    } else {
      replaceState(urlObj.toString(), pageState)
    }
  } else {
    if (reload) {
      goto(urlObj.toString(), { noScroll: true, replaceState: false })
    } else {
      pushState(urlObj.toString(), pageState)
    }
  }
}

/**
 * Initialize collection navigation with common setup
 * @param omniCtx - Omni context
 * @param appCtx - Application context
 * @param features - Features to activate layers for
 */
const initializeCollectionNavigation = (
  omniCtx: OmniCtx,
  appCtx: AppCtx,
  features: (FeatureFromCollection | Feature | UserFeatureWithHierarchy)[],
): void => {
  omniCtx.initSelection(false)
  activateLayersForFeatures(appCtx, features)
}
