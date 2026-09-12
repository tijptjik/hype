// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getI18n } from '$lib/i18n'
// API
import { getUserLayers, setUserLayerDefaults } from '$lib/api/server/user.remote'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'

/**
 * Owns default layer selection and optimistic mutation reconciliation.
 * @param appCtx - Application context owned by the route.
 * @returns Controlled section state and callbacks.
 */
export function useDefaultMapSettingsModel(appCtx: AppCtx) {
  let optimisticUserLayerIds = $state<Set<string> | null>(null)
  let isSavingLayers = $state(false)

  const persistedUserLayerIds = $derived(new Set(appCtx.getUserLayerIds()))
  const userLayerIds = $derived(optimisticUserLayerIds ?? persistedUserLayerIds)
  const canSaveUserLayers = $derived(Boolean(appCtx.hub?.id || appCtx.hub?.code))
  const userPreferences = $derived(appCtx.getUserPreferences())
  const orderedLayers = $derived.by(() =>
    [...appCtx.state.resources.layer].sort((left, right) => {
      const rankDiff =
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
      if (rankDiff !== 0) return rankDiff

      return getI18n(left, 'name', userPreferences).localeCompare(
        getI18n(right, 'name', userPreferences),
      )
    }),
  )

  $effect(() => {
    const nextPersistedUserLayerIds = persistedUserLayerIds

    if (!optimisticUserLayerIds) {
      return
    }

    const isInSync =
      optimisticUserLayerIds.size === nextPersistedUserLayerIds.size &&
      [...optimisticUserLayerIds].every(layerId =>
        nextPersistedUserLayerIds.has(layerId),
      )

    if (isInSync) {
      optimisticUserLayerIds = null
    }
  })

  /**
   * Optimistically saves this hub's default-visible layers through a remote command.
   */
  const toggleUserLayer = async (layerId: string, checked: boolean): Promise<void> => {
    if (isSavingLayers) return

    const user = appCtx.getUser()
    const hub = appCtx.hub
    if (!user || !hub || (!hub.id && !hub.code)) return

    const previousUserLayerIds = new Set(userLayerIds)
    const nextUserLayerIds = new Set(userLayerIds)

    if (checked) {
      nextUserLayerIds.add(layerId)
    } else {
      nextUserLayerIds.delete(layerId)
    }

    optimisticUserLayerIds = nextUserLayerIds
    isSavingLayers = true

    try {
      const response = await setUserLayerDefaults({
        userId: user.id,
        hubId: hub.id ?? undefined,
        hubCode: hub.code ?? undefined,
        layers: [...nextUserLayerIds].map(layerId => ({
          layerId,
          isDefaultVisible: true,
        })),
      }).updates(
        getUserLayers({
          userId: user.id,
          hubId: hub.id ?? undefined,
        }),
      )

      appCtx.applyUserLayerDefaults(response?.data ?? [], hub)
    } catch (error) {
      console.error('Error updating default map layers:', error)
      optimisticUserLayerIds = previousUserLayerIds
      toast.error('Failed to update default map layers')
    } finally {
      isSavingLayers = false
    }
  }

  return {
    get userLayerIds() {
      return userLayerIds
    },
    get canSaveUserLayers() {
      return canSaveUserLayers
    },
    get userPreferences() {
      return userPreferences
    },
    get orderedLayers() {
      return orderedLayers
    },
    get isSavingLayers() {
      return isSavingLayers
    },
    toggleUserLayer,
    getHierarchy: (layer: Parameters<AppCtx['getHierarchySync']>[0]) =>
      appCtx.getHierarchySync(layer),
    getProjectName: (project: Parameters<AppCtx['getContextualProjectName']>[0]) =>
      appCtx.getContextualProjectName(project, false),
  }
}
