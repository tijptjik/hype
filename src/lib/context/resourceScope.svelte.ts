// DOMAIN
import { FirstClassResource } from '#lib/enums.js'
import { getInitialHubLayerDefaultIds } from '#lib/client/services/layerDefaults.js'
// TYPES
import type { Id, Prisms } from '#lib/types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { UserLayer } from '#lib/db/zod/schema/user.types.js'
import type { AccountState } from './account.svelte.js'

/** Read-only hierarchy access and explicit refresh capabilities; no view or cache ownership. */
export interface ResourceScopeDependencies {
  account: () => AccountState
  hub: () => HubOptsExtended | null
  loadedLayers: () => Layer[]
  projects: () => Iterable<Project>
  layers: () => Iterable<Layer>
  getHubIdByCode: (code: string) => Id | undefined
  isExpectedRoleScopeCurrent: (scope?: string) => boolean
  refreshOrganisations: () => Promise<void>
  refreshProjects: (cascade?: boolean) => Promise<void>
  refreshProperties: () => Promise<void>
  refreshLayers: (cascade?: boolean, autoSelect?: boolean) => Promise<void>
  refreshLayerDependents: () => Promise<void>
  postLayerMutation: (cascade?: boolean, autoSelect?: boolean) => Promise<void>
  invalidateAndRefresh: (resource: FirstClassResource) => Promise<void>
}

/** Owns hierarchical selection and default-layer policy for one resource surface. */
export class ResourceScope {
  prisms: Prisms = $state({ organisation: [], project: [], layer: [] })
  selectionLayers: Layer[] = $state.raw([])

  /** @param dependencies Explicit hierarchy reads and refresh commands. */
  constructor(private readonly dependencies: ResourceScopeDependencies) {}

  private getCurrentHubId = (): Id | null => {
    const hub = this.dependencies.hub()
    return (
      hub?.id ??
      (hub?.code ? (this.dependencies.getHubIdByCode(hub.code) ?? null) : null)
    )
  }

  getUserLayersForCurrentHub = (): UserLayer[] => {
    const hubId = this.getCurrentHubId()
    const hubCode = this.dependencies.hub()?.code ?? null
    const user = this.dependencies.account().user
    if ((!hubId && !hubCode) || !user) {
      return []
    }
    const currentHubLayerIds = new Set(
      this.dependencies.loadedLayers().map(layer => layer.id),
    )
    const hubUserLayers = user.userLayers.filter(layer => {
      if (hubId && layer.hubId === hubId) return true
      if (hubCode && layer.hubCode === hubCode) return true

      // Fallback to the loaded hub-scoped layer list when persisted preferences only
      // carry one hub identifier and the app has only resolved the other on bootstrap.
      return currentHubLayerIds.has(layer.layerId)
    })
    return hubUserLayers
  }

  private getHubDefaultLayerIds = (): Id[] => {
    return getInitialHubLayerDefaultIds(
      this.dependencies.hub(),
      this.selectionLayers,
      this.selectionLayers.flatMap(layer => {
        const ancestors = (layer as unknown as { ancestors?: { project?: Project } })
          .ancestors
        return ancestors?.project ? [ancestors.project] : []
      }),
    )
  }

  applyInitialLayerPrisms = (expectedRoleScope?: string): void => {
    if (!this.dependencies.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    const hubId = this.getCurrentHubId()
    const hubCode = this.dependencies.hub()?.code ?? null
    if (!hubId && !hubCode) {
      return
    }

    const userLayerIds = this.getUserLayersForCurrentHub().map(layer => layer.layerId)
    const defaultLayerIds = this.getHubDefaultLayerIds()
    const nextLayerIds = userLayerIds.length > 0 ? userLayerIds : defaultLayerIds
    const dedupedLayerIds = [...new Set(nextLayerIds)]
    const currentLayerIds = this.prisms.layer
    const isUnchanged =
      currentLayerIds.length === dedupedLayerIds.length &&
      currentLayerIds.every((layerId, index) => layerId === dedupedLayerIds[index])

    if (isUnchanged) return

    this.prisms.layer = dedupedLayerIds
  }

  togglePrism = async (resource: FirstClassResource, id: Id): Promise<void> => {
    const prisms = this.prisms[resource as keyof Prisms]
    if (!prisms) return
    const index = prisms.indexOf(id)
    if (index === -1) {
      prisms.push(id)
    } else {
      prisms.splice(index, 1)
    }
    // Refresh all the dependent resources
    if (resource === FirstClassResource.organisation) {
      await this.dependencies.refreshProjects()
    } else if (resource === FirstClassResource.project) {
      await this.dependencies.refreshProperties()
      await this.dependencies.refreshLayers()
    } else if (resource === FirstClassResource.layer) {
      await this.dependencies.refreshLayerDependents()
    }
  }

  // Toggle methods for hierarchical filters
  toggleOrganisation = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.organisation, id)
  }

  /**
   * Returns the IDs of an organisation's layers that should be visible by default.
   *
   * @param organisationId - The organisation whose default layer IDs are required.
   * @returns The organisation's default-visible layer IDs.
   */
  getOrganisationDefaultVisibleLayerIds = (organisationId: Id): Id[] =>
    this.selectionLayers
      .filter(
        layer => layer.organisationId === organisationId && layer.isDefaultVisible,
      )
      .map(layer => layer.id)

  /**
   * Determines whether every default-visible layer for an organisation is active.
   *
   * @param organisationId - The organisation whose default layers are checked.
   * @returns Whether the organisation has default layers and every one is active.
   */
  isOrganisationDefaultLayersActive = (organisationId: Id): boolean => {
    const defaultLayerIds = this.getOrganisationDefaultVisibleLayerIds(organisationId)
    return (
      defaultLayerIds.length > 0 &&
      defaultLayerIds.every(layerId => this.prisms.layer.includes(layerId))
    )
  }

  /**
   * Activates an organisation's default-visible layers without changing prism scope.
   *
   * @param organisationId - The organisation whose default layers should be activated.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  addOrganisationDefaultLayers = async (organisationId: Id): Promise<void> => {
    const defaultLayerIds = this.getOrganisationDefaultVisibleLayerIds(organisationId)
    if (defaultLayerIds.length === 0) return

    this.prisms.layer = Array.from(new Set([...this.prisms.layer, ...defaultLayerIds]))
    await this.dependencies.postLayerMutation(true)
  }

  /**
   * Activates an organisation's defaults and joins its prism when organisation scope is active.
   *
   * @param organisationId - The organisation whose default layers should be activated.
   * @returns A promise that resolves after organisation and layer state are updated.
   */
  activateOrganisationWithDefaultLayers = async (organisationId: Id): Promise<void> => {
    if (this.prisms.organisation.length > 0) {
      await this.activateOrganisationPrismWithDefaultLayers(organisationId)
      return
    }

    await this.addOrganisationDefaultLayers(organisationId)
  }

  /**
   * Activates an organisation prism and enables the organisation's default-visible layers.
   *
   * @param organisationId - The organisation prism and default layers to activate.
   * @returns A promise that resolves after organisation and layer state are updated.
   */
  activateOrganisationPrismWithDefaultLayers = async (
    organisationId: Id,
  ): Promise<void> => {
    this.prisms.organisation = Array.from(
      new Set([...this.prisms.organisation, organisationId]),
    )

    // Load the newly scoped organisation's descendants before selecting its defaults.
    await this.dependencies.refreshProjects(false)
    await this.dependencies.refreshProperties()
    await this.dependencies.refreshLayers(false)
    await this.addOrganisationDefaultLayers(organisationId)
  }

  /**
   * Removes an organisation prism and every active descendant prism and layer.
   *
   * @param organisationId - The organisation to deactivate.
   * @returns A promise that resolves after the expanded organisation scope is loaded.
   */
  deactivateOrganisation = async (organisationId: Id): Promise<void> => {
    const projectIds = new Set(
      [...this.dependencies.projects()]
        .filter(project => project.organisationId === organisationId)
        .map(project => project.id),
    )
    const layerIds = new Set(
      [...this.dependencies.layers()]
        .filter(layer => layer.organisationId === organisationId)
        .map(layer => layer.id),
    )

    // Remove the organisation and all of its descendants before expanding the scope.
    this.prisms.organisation = this.prisms.organisation.filter(
      id => id !== organisationId,
    )
    this.prisms.project = this.prisms.project.filter(
      projectId => !projectIds.has(projectId),
    )
    this.prisms.layer = this.prisms.layer.filter(layerId => !layerIds.has(layerId))

    await this.dependencies.refreshProjects(false)
    await this.dependencies.refreshProperties()
    await this.dependencies.refreshLayers(true, false)
  }

  /**
   * Deactivates every active layer that belongs to an organisation without changing prism scope.
   *
   * @param organisationId - The organisation whose active layers should be disabled.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  deactivateOrganisationLayers = async (organisationId: Id): Promise<void> => {
    const organisationLayerIds = new Set(
      [...this.dependencies.layers()]
        .filter(layer => layer.organisationId === organisationId)
        .map(layer => layer.id),
    )

    this.prisms.layer = this.prisms.layer.filter(
      layerId => !organisationLayerIds.has(layerId),
    )
    await this.dependencies.postLayerMutation(true, false)
  }

  toggleProject = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.project, id)
  }

  /**
   * Returns the IDs of a project's layers that should be visible by default.
   *
   * @param projectId - The project whose default layer IDs are required.
   * @returns The project's default-visible layer IDs.
   */
  getProjectDefaultVisibleLayerIds = (projectId: Id): Id[] =>
    this.selectionLayers
      .filter(layer => layer.projectId === projectId && layer.isDefaultVisible)
      .map(layer => layer.id)

  /**
   * Determines whether every default-visible layer for a project is active.
   *
   * @param projectId - The project whose default layers are checked.
   * @returns Whether the project has default layers and every one is active.
   */
  isProjectDefaultLayersActive = (projectId: Id): boolean => {
    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    return (
      defaultLayerIds.length > 0 &&
      defaultLayerIds.every(layerId => this.prisms.layer.includes(layerId))
    )
  }

  /**
   * Activates a project's default-visible layers without changing its prism scope.
   *
   * @param projectId - The project whose default layers should be activated.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  addProjectDefaultLayers = async (projectId: Id): Promise<void> => {
    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    if (defaultLayerIds.length === 0) return

    this.prisms.layer = Array.from(new Set([...this.prisms.layer, ...defaultLayerIds]))
    await this.dependencies.postLayerMutation(true)
  }

  /**
   * Activates a project's defaults and joins its prism when project scope is active.
   *
   * @param projectId - The project whose default layers should be activated.
   * @returns A promise that resolves after project and layer state are updated.
   */
  activateProjectWithDefaultLayers = async (projectId: Id): Promise<void> => {
    const isProjectScopeActive = this.prisms.project.length > 0

    if (isProjectScopeActive) {
      await this.activateProjectPrismWithDefaultLayers(projectId)
      return
    }

    await this.addProjectDefaultLayers(projectId)
  }

  /**
   * Activates a project prism and enables the project's default-visible layers.
   *
   * @param projectId - The project prism and default layers to activate.
   * @returns A promise that resolves after project and layer state are updated.
   */
  activateProjectPrismWithDefaultLayers = async (projectId: Id): Promise<void> => {
    this.prisms.project = Array.from(new Set([...this.prisms.project, projectId]))

    // Load the newly scoped project's layers before selecting its defaults.
    await this.dependencies.refreshProperties()
    await this.dependencies.refreshLayers(false)
    await this.addProjectDefaultLayers(projectId)
  }

  /**
   * Isolates a project prism and replaces the active layers with its defaults.
   *
   * @param projectId - The project to make the sole active prism.
   * @returns A promise that resolves after the project scope and layer state update.
   */
  isolateProject = async (projectId: Id): Promise<void> => {
    this.prisms.project = [projectId]

    // Load the isolated project's resources before deriving its default layers.
    await this.dependencies.refreshProperties()
    await this.dependencies.refreshLayers(false)

    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    this.prisms.layer = [...defaultLayerIds]
    await this.dependencies.postLayerMutation(true)
  }

  /**
   * Removes a project prism and every active layer that belongs to it.
   *
   * @param projectId - The project to deactivate.
   * @returns A promise that resolves after the expanded project scope is loaded.
   */
  deactivateProject = async (projectId: Id): Promise<void> => {
    const projectLayerIds = new Set(
      [...this.dependencies.layers()]
        .filter(layer => layer.projectId === projectId)
        .map(layer => layer.id),
    )

    // Remove both project-level and visible-layer state before expanding the scope.
    this.prisms.project = this.prisms.project.filter(id => id !== projectId)
    this.prisms.layer = this.prisms.layer.filter(
      layerId => !projectLayerIds.has(layerId),
    )

    await this.dependencies.refreshProperties()
    await this.dependencies.refreshLayers(true, false)
  }

  /**
   * Deactivates every active layer that belongs to a project without changing prism scope.
   *
   * @param projectId - The project whose active layers should be disabled.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  deactivateProjectLayers = async (projectId: Id): Promise<void> => {
    const projectLayerIds = new Set(
      [...this.dependencies.layers()]
        .filter(layer => layer.projectId === projectId)
        .map(layer => layer.id),
    )

    this.prisms.layer = this.prisms.layer.filter(
      layerId => !projectLayerIds.has(layerId),
    )
    await this.dependencies.postLayerMutation(true, false)
  }

  /**
   * Toggles a layer's visible state and reconciles its dependent filters.
   *
   * @param id - The layer to toggle.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  toggleLayer = async (id: Id): Promise<void> => {
    const layerIds = this.prisms.layer
    const layerIndex = layerIds.indexOf(id)

    if (layerIndex === -1) {
      layerIds.push(id)
    } else {
      layerIds.splice(layerIndex, 1)
    }

    await this.dependencies.postLayerMutation(true)
  }

  /**
   * Makes a layer the sole active layer.
   *
   * @param id - The layer to isolate.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  isolateLayer = async (id: Id): Promise<void> => {
    this.prisms.layer = [id]
    await this.dependencies.postLayerMutation(true)
  }

  // PRISM RELATIONS

  getPrism = (resource: FirstClassResource): Id[] => {
    return this.prisms[resource as keyof Prisms]
  }

  isPrism = (resource: FirstClassResource, id: Id): boolean => {
    return this.prisms[resource as keyof Prisms]?.includes(id)
  }

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetOrganisations = async () => {
    this.prisms.organisation = []
    await this.dependencies.refreshOrganisations()
  }

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetProjects = async () => {
    this.prisms.project = []
    await this.dependencies.refreshProjects()
  }

  // Force refresh methods for when you actually need to invalidate and fetch fresh data
  forceRefreshOrganisations = async () => {
    this.prisms.organisation = []
    await this.dependencies.invalidateAndRefresh(FirstClassResource.organisation)
  }

  forceRefreshProjects = async () => {
    this.prisms.project = []
    await this.dependencies.invalidateAndRefresh(FirstClassResource.project)
  }

  // TODO : Clear the Omnibar when a layer is toggled
  addLayer = (id: Id) => {
    this.prisms.layer.push(id)
    this.dependencies.postLayerMutation()
  }

  removeLayer = (id: Id) => {
    this.prisms.layer = this.prisms.layer.filter(l => l !== id)
    this.dependencies.postLayerMutation()
  }

  setLayers = (layers: Id[]) => {
    this.prisms.layer = layers
    this.dependencies.postLayerMutation()
  }

  resetLayers = () => {
    this.prisms.layer = []
    this.dependencies.postLayerMutation()
  }
}
