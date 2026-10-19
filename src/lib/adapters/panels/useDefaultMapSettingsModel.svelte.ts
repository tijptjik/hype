// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { getI18n } from '#lib/i18n.js'
import { getProjectDisplayName } from '#lib/projectNames.js'
// API
import { getUserLayers, setUserLayerDefaults } from '#lib/api/user.remote.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

/**
 * Owns default layer selection and optimistic mutation reconciliation.
 * @param appCtx - Application context owned by the route.
 * @returns Controlled section state and callbacks.
 */
export function useDefaultMapSettingsModel(appCtx: ResourceViewCtx) {
  let optimisticUserLayerIds = $state<Set<string> | null>(null)
  let optimisticAccountRevision = $state<number | null>(null)
  let isSavingLayers = $state(false)

  const persistedUserLayerIds = $derived(
    new Set(appCtx.scope.getUserLayersForCurrentHub().map(layer => layer.layerId)),
  )
  const userLayerIds = $derived(
    optimisticAccountRevision === appCtx.account.revision
      ? (optimisticUserLayerIds ?? persistedUserLayerIds)
      : persistedUserLayerIds,
  )
  const canSaveUserLayers = $derived(Boolean(appCtx.hub?.id || appCtx.hub?.code))
  const userPreferences = $derived(appCtx.getUserPreferences())

  /**
   * Resolves standalone short names from compact ancestors without organisation IDs.
   * @param project - Project owning a default map layer.
   * @returns Localised short name, falling back to the full name if missing.
   */
  const getProjectName = (
    project: Parameters<ResourceViewCtx['getContextualProjectName']>[0],
  ): string | null => {
    return getProjectDisplayName(project, userPreferences)
  }

  const orderedLayers = $derived.by(() =>
    [...appCtx.scope.selectionLayers].sort((left, right) => {
      const leftProject = appCtx.getHierarchySync(left).project
      const rightProject = appCtx.getHierarchySync(right).project
      const projectNameDiff = (getProjectName(leftProject) ?? '')
        .trim()
        .localeCompare((getProjectName(rightProject) ?? '').trim())
      if (projectNameDiff !== 0) return projectNameDiff

      // Keep distinct projects with the same displayed name in separate groups.
      const projectIdDiff = left.projectId.localeCompare(right.projectId)
      if (projectIdDiff !== 0) return projectIdDiff

      return (
        getI18n(left, 'name', userPreferences).localeCompare(
          getI18n(right, 'name', userPreferences),
        ) || left.id.localeCompare(right.id)
      )
    }),
  )

  const ambiguousProjectIds = $derived.by(() => {
    const projectIdsByName = new Map<string, Set<string>>()

    // Count distinct projects, so multiple layers in one project are not a name clash.
    for (const layer of orderedLayers) {
      const { project } = appCtx.getHierarchySync(layer)
      const name = getProjectName(project)?.trim().toLocaleLowerCase()
      if (!project || !name) continue
      const projectIds = projectIdsByName.get(name) ?? new Set<string>()
      projectIds.add(project.id)
      projectIdsByName.set(name, projectIds)
    }

    return new Set(
      [...projectIdsByName.values()]
        .filter(ids => ids.size > 1)
        .flatMap(ids => [...ids]),
    )
  })

  /**
   * Determines whether the project label needs an organisation prefix.
   * @param project - Project owning a default map layer.
   * @returns Whether another project in this list has the same displayed name.
   */
  const shouldShowOrganisation = (
    project: Parameters<ResourceViewCtx['getContextualProjectName']>[0],
  ): boolean => Boolean(project && ambiguousProjectIds.has(project.id))

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

    const user = appCtx.account.user
    const hub = appCtx.hub
    if (!user || !hub || (!hub.id && !hub.code)) return

    const accountRevision = appCtx.account.revision
    const previousUserLayerIds = new Set(userLayerIds)
    const nextUserLayerIds = new Set(userLayerIds)

    if (checked) {
      nextUserLayerIds.add(layerId)
    } else {
      nextUserLayerIds.delete(layerId)
    }

    optimisticAccountRevision = accountRevision
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

      appCtx.applyUserLayerDefaults(response?.data ?? [], hub, accountRevision)
    } catch (error) {
      if (accountRevision !== appCtx.account.revision) {
        optimisticUserLayerIds = null
        return
      }
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
    getHierarchy: (layer: Parameters<ResourceViewCtx['getHierarchySync']>[0]) =>
      appCtx.getHierarchySync(layer),
    getProjectName,
    /**
     * Resolves the label actually rendered beside an optional organisation prefix.
     * @param project - Project owning a default map layer.
     * @param hasOrganisation - Whether an organisation prefix will be rendered.
     * @returns The standalone short name or the localised replacement.
     */
    getProjectLabel: (
      project: Parameters<ResourceViewCtx['getContextualProjectName']>[0],
      hasOrganisation: boolean,
    ): string | null =>
      getProjectDisplayName(project, userPreferences, {
        inOrganisationContext: hasOrganisation,
      }),
    shouldShowOrganisation,
  }
}
