import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '$lib/bits/patterns/forms/formParentSection'

export type ParentOrganisationRecord = {
  id?: string | null
  code?: string | null
  i18n?: ParentSectionOrganisationItem['i18n'] | null
  image?: ParentSectionOrganisationItem['image'] | null
}

export type ParentProjectRecord = {
  id?: string | null
  organisationId?: string | null
  code?: string | null
  i18n?: ParentSectionProjectItem['i18n'] | null
  image?: ParentSectionProjectItem['image'] | null
}

export type ParentLayerRecord = {
  id?: string | null
  organisationId?: string | null
  projectId?: string | null
  code?: string | null
  i18n?: ParentSectionLayerItem['i18n'] | null
  image?: ParentSectionLayerItem['image'] | null
}

type ParentSearchScopeParams = {
  organisationIds?: string[]
  projectIds?: string[]
}

type ParentSelectionParams = {
  organisationId?: string
  projectId?: string
  layerId?: string
}

type FeatureParentSectionControllerDeps = {
  getCreatableProjectRecords: (params?: {
    query?: string
    organisationIds?: string[]
  }) => Promise<ParentProjectRecord[]>
  searchParentOrganisations: (params: {
    query: string
    organisationIds: string[]
  }) => Promise<ParentOrganisationRecord[]>
  searchParentLayers: (params: {
    query: string
    organisationIds?: string[]
    projectIds?: string[]
  }) => Promise<ParentLayerRecord[]>
  syncSelectedOrganisation: (
    organisation: ParentSectionOrganisationItem | null | undefined,
  ) => void
  syncSelectedProject: (project: ParentSectionProjectItem | null | undefined) => void
  syncSelectedLayer: (layer: ParentSectionLayerItem | null | undefined) => void
  getSelectedOrganisation: () => ParentSectionOrganisationItem | null
  getSelectedProject: () => ParentSectionProjectItem | null
  getSelectedLayer: () => ParentSectionLayerItem | null
  getOrganisationIdValue: () => string
  getProjectIdValue: () => string
  getLayerIdValue: () => string
  getIsReplacingParentProject: () => boolean
  getIsReplacingParentLayer: () => boolean
  setIsReplacingParentOrganisation: (value: boolean) => void
  setIsReplacingParentProject: (value: boolean) => void
  setIsReplacingParentLayer: (value: boolean) => void
  applyFeatureParentSelection: (params: ParentSelectionParams) => void
}

type AutoSelectedProjectAndLayer = {
  projectId: string
  layerId: string
}

/**
 * Restrict parent searches to the active organisation/project scope without
 * over-constraining layer searches.
 */
export function createFeatureParentSearchPrisms(params: ParentSearchScopeParams = {}): {
  organisation: string[]
  project: string[]
  layer: string[]
} {
  return {
    organisation: params.organisationIds ?? [],
    project: params.projectIds ?? [],
    layer: [],
  }
}

/**
 * Converts an organisation record into the parent-section item shape.
 */
export function toParentOrganisationItem(
  organisation: ParentOrganisationRecord | null | undefined,
): ParentSectionOrganisationItem | null {
  if (!organisation?.id) return null
  return {
    id: organisation.id,
    code: organisation.code ?? '',
    i18n: organisation.i18n ?? null,
    image: organisation.image ?? null,
  }
}

/**
 * Converts a project record into the parent-section item shape.
 */
export function toParentProjectItem(
  project: ParentProjectRecord | null | undefined,
): ParentSectionProjectItem | null {
  if (!project?.id) return null
  return {
    id: project.id,
    organisationId: project.organisationId ?? '',
    code: project.code ?? '',
    i18n: project.i18n ?? null,
    image: project.image ?? null,
  }
}

/**
 * Converts a layer record into the parent-section item shape.
 */
export function toParentLayerItem(
  layer: ParentLayerRecord | null | undefined,
): ParentSectionLayerItem | null {
  if (!layer?.id) return null
  return {
    id: layer.id,
    organisationId: layer.organisationId ?? '',
    projectId: layer.projectId ?? '',
    code: layer.code ?? '',
    i18n: layer.i18n ?? null,
    image: layer.image ?? null,
  }
}

/**
 * Builds the feature-parent-section interaction handlers while leaving page
 * state ownership and form mutation in the caller.
 */
export function createFeatureParentSectionController(
  deps: FeatureParentSectionControllerDeps,
): {
  onReplaceParentOrganisation: (
    organisation: ParentSectionOrganisationItem,
  ) => Promise<void>
  onReplaceParentProject: (project: ParentSectionProjectItem) => void
  onReplaceParentLayer: (layer: ParentSectionLayerItem) => void
  onRemoveParentOrganisation: () => void
  onRemoveParentProject: () => void
  onRemoveParentLayer: () => void
  resetFeatureParents: () => void
  beginReplaceParentOrganisation: () => void
  cancelReplaceParentOrganisation: () => void
  beginReplaceParentProject: () => void
  cancelReplaceParentProject: () => void
  beginReplaceParentLayer: () => void
  cancelReplaceParentLayer: () => void
  onSearchParentOrganisations: (
    query: string,
  ) => Promise<ParentSectionOrganisationItem[]>
  onSearchParentProjects: (query: string) => Promise<ParentSectionProjectItem[]>
  onSearchParentLayers: (query: string) => Promise<ParentSectionLayerItem[]>
} {
  async function resolveAutoSelectedProjectAndLayer(
    organisationId: string,
  ): Promise<AutoSelectedProjectAndLayer> {
    const projects = await deps.getCreatableProjectRecords({
      organisationIds: [organisationId],
    })

    if (projects.length !== 1) {
      return { projectId: '', layerId: '' }
    }

    const project = toParentProjectItem(projects[0])
    if (!project) {
      return { projectId: '', layerId: '' }
    }

    deps.syncSelectedProject(project)

    const layers = (
      await deps.searchParentLayers({
        query: '',
        organisationIds: [organisationId],
        projectIds: [project.id],
      })
    )
      .map(item => toParentLayerItem(item))
      .filter(Boolean) as ParentSectionLayerItem[]

    if (layers.length === 1) {
      deps.syncSelectedLayer(layers[0])
      return { projectId: project.id, layerId: layers[0].id }
    }

    return { projectId: project.id, layerId: '' }
  }

  function onReplaceParentProject(project: ParentSectionProjectItem): void {
    deps.setIsReplacingParentProject(false)
    deps.syncSelectedProject(project)
    const selectedOrganisation = deps.getSelectedOrganisation()
    const selectedLayer = deps.getSelectedLayer()
    const nextOrganisation =
      selectedOrganisation && selectedOrganisation.id === project.organisationId
        ? selectedOrganisation
        : null
    const nextLayer =
      selectedLayer && selectedLayer.projectId === project.id ? selectedLayer : null

    deps.applyFeatureParentSelection({
      organisationId: nextOrganisation?.id ?? project.organisationId ?? '',
      projectId: project.id,
      layerId: nextLayer?.id ?? '',
    })
  }

  function onReplaceParentLayer(layer: ParentSectionLayerItem): void {
    deps.setIsReplacingParentLayer(false)
    deps.syncSelectedLayer(layer)
    const selectedProject = deps.getSelectedProject()
    const selectedOrganisation = deps.getSelectedOrganisation()
    const nextProject =
      selectedProject && selectedProject.id === layer.projectId ? selectedProject : null
    const nextOrganisation =
      selectedOrganisation && selectedOrganisation.id === layer.organisationId
        ? selectedOrganisation
        : null

    deps.applyFeatureParentSelection({
      organisationId: nextOrganisation?.id ?? layer.organisationId ?? '',
      projectId: nextProject?.id ?? layer.projectId ?? '',
      layerId: layer.id,
    })
  }

  function resetFeatureParents(): void {
    deps.setIsReplacingParentOrganisation(false)
    deps.setIsReplacingParentProject(false)
    deps.setIsReplacingParentLayer(false)
    deps.applyFeatureParentSelection({
      organisationId: '',
      projectId: '',
      layerId: '',
    })
  }

  return {
    async onReplaceParentOrganisation(
      organisation: ParentSectionOrganisationItem,
    ): Promise<void> {
      deps.setIsReplacingParentOrganisation(false)
      deps.syncSelectedOrganisation(organisation)
      const selectedProject = deps.getSelectedProject()
      const selectedLayer = deps.getSelectedLayer()
      const nextProject =
        selectedProject && selectedProject.organisationId === organisation.id
          ? selectedProject
          : null
      const nextLayer =
        selectedLayer &&
        selectedLayer.organisationId === organisation.id &&
        (!nextProject || selectedLayer.projectId === nextProject.id)
          ? selectedLayer
          : null

      let autoSelectedProjectId = nextProject?.id ?? ''
      let autoSelectedLayerId = nextLayer?.id ?? ''

      if (!autoSelectedProjectId) {
        const autoSelected = await resolveAutoSelectedProjectAndLayer(organisation.id)
        autoSelectedProjectId = autoSelected.projectId
        autoSelectedLayerId = autoSelected.layerId
      }

      deps.applyFeatureParentSelection({
        organisationId: organisation.id,
        projectId: autoSelectedProjectId,
        layerId: autoSelectedLayerId,
      })
    },
    onReplaceParentProject,
    onReplaceParentLayer,
    onRemoveParentOrganisation(): void {
      resetFeatureParents()
    },
    onRemoveParentProject(): void {
      deps.setIsReplacingParentProject(false)
      deps.setIsReplacingParentLayer(false)
      deps.applyFeatureParentSelection({
        organisationId: deps.getOrganisationIdValue(),
        projectId: '',
        layerId: '',
      })
    },
    onRemoveParentLayer(): void {
      deps.setIsReplacingParentLayer(false)
      deps.applyFeatureParentSelection({
        organisationId: deps.getOrganisationIdValue(),
        projectId: deps.getProjectIdValue(),
        layerId: '',
      })
    },
    resetFeatureParents,
    beginReplaceParentOrganisation(): void {
      if (!deps.getOrganisationIdValue()) return
      deps.setIsReplacingParentOrganisation(true)
    },
    cancelReplaceParentOrganisation(): void {
      deps.setIsReplacingParentOrganisation(false)
    },
    beginReplaceParentProject(): void {
      if (!deps.getProjectIdValue()) return
      deps.setIsReplacingParentProject(true)
    },
    cancelReplaceParentProject(): void {
      deps.setIsReplacingParentProject(false)
    },
    beginReplaceParentLayer(): void {
      if (!deps.getLayerIdValue()) return
      deps.setIsReplacingParentLayer(true)
    },
    cancelReplaceParentLayer(): void {
      deps.setIsReplacingParentLayer(false)
    },
    async onSearchParentOrganisations(
      query: string,
    ): Promise<ParentSectionOrganisationItem[]> {
      const projects = await deps.getCreatableProjectRecords()
      const organisationIds = Array.from(
        new Set(
          projects
            .map(project => project.organisationId)
            .filter(
              (organisationId): organisationId is string =>
                typeof organisationId === 'string' && organisationId.trim().length > 0,
            ),
        ),
      )

      if (organisationIds.length === 0) return []

      return (
        await deps.searchParentOrganisations({
          query,
          organisationIds,
        })
      )
        .map(item => toParentOrganisationItem(item))
        .filter(Boolean) as ParentSectionOrganisationItem[]
    },
    async onSearchParentProjects(query: string): Promise<ParentSectionProjectItem[]> {
      const scopedOrganisationIds = deps.getIsReplacingParentProject()
        ? []
        : deps.getOrganisationIdValue()
          ? [deps.getOrganisationIdValue()]
          : []

      return (
        await deps.getCreatableProjectRecords({
          query,
          organisationIds: scopedOrganisationIds,
        })
      )
        .map(item => toParentProjectItem(item))
        .filter(Boolean) as ParentSectionProjectItem[]
    },
    async onSearchParentLayers(query: string): Promise<ParentSectionLayerItem[]> {
      const scopedOrganisationIds = deps.getIsReplacingParentLayer()
        ? []
        : deps.getOrganisationIdValue()
          ? [deps.getOrganisationIdValue()]
          : []
      const accessibleProjects = await deps.getCreatableProjectRecords({
        organisationIds: scopedOrganisationIds,
      })
      const allowedProjectIds = accessibleProjects
        .map(project => project.id)
        .filter(Boolean) as string[]
      const scopedProjectIds = deps.getIsReplacingParentLayer()
        ? allowedProjectIds
        : deps.getProjectIdValue()
          ? [deps.getProjectIdValue()]
          : allowedProjectIds

      if (scopedProjectIds.length === 0) return []

      return (
        await deps.searchParentLayers({
          query,
          organisationIds: scopedOrganisationIds,
          projectIds: scopedProjectIds,
        })
      )
        .map(item => toParentLayerItem(item))
        .filter(Boolean) as ParentSectionLayerItem[]
    },
  }
}
