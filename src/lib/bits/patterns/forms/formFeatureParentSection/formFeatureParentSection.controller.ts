// AUTHORIZATION
import { canCreateFeatureForProject } from '#lib/api/services/authz/feature.js'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'
import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '#lib/bits/patterns/forms/formParentSection/index.js'

/********************
 *  TABLE OF CONTENTS
 ************/
// - filterCreatableParentProjects
// - createFeatureParentSearchPrisms
// - toParentOrganisationItem
// - toParentProjectItem
// - toParentLayerItem
// - createFeatureParentSectionController

export type ParentOrganisationRecord = {
  id?: string | null
  code?: string | null
  i18n?: ParentSectionOrganisationItem['i18n'] | null
  image?: ParentSectionOrganisationItem['image'] | null
}

export type ParentProjectRecord = {
  flags?: ParentSectionProjectItem['flags']
  id?: string | null
  organisationId?: string | null
  code?: string | null
  i18n?: ParentSectionProjectItem['i18n'] | null
  image?: ParentSectionProjectItem['image'] | null
}

export type ParentLayerRecord = {
  metadata?: ParentSectionLayerItem['metadata'] | null
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
  setIsReplacingParentProject: (value: boolean) => void
  setIsReplacingParentLayer: (value: boolean) => void
  applyFeatureParentSelection: (params: ParentSelectionParams) => void
}

type AutoSelectedProjectAndLayer = {
  projectId: string
  layerId: string
}

/**
 * Filters project choices without requiring project staff to read their parent organisation.
 * @param params Available projects, current actor and a hub lookup for hub-admin-only grants.
 * @returns Projects where the actor may create or assign Features.
 * @remarks Direct project/organisation grants are sufficient; hub ancestry is read only for hub admins.
 */
export async function filterCreatableParentProjects<
  T extends { id: string; organisationId: string },
>(params: {
  projects: T[]
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  getOrganisationHubId: (id: string) => Promise<string | null>
}): Promise<T[]> {
  const hubs = new Map<string, Promise<string | null>>()
  const allowed = await Promise.all(
    params.projects.map(async project => {
      const canCreate = (resourceHubId: string | null): boolean =>
        canCreateFeatureForProject({
          user: params.user,
          userRoles: params.userRoles,
          resource: {
            organisationId: project.organisationId,
            projectId: project.id,
            layerId: '',
            resourceHubId,
          },
        })
      if (canCreate(null)) return true
      if (!params.userRoles.some(role => role.type === 'hub' && role.role === 'admin'))
        return false
      // Only hub-scoped grants need ancestor resolution, shared across sibling projects.
      const hub =
        hubs.get(project.organisationId) ??
        params.getOrganisationHubId(project.organisationId)
      hubs.set(project.organisationId, hub)
      return canCreate(await hub)
    }),
  )
  return params.projects.filter((_, index) => allowed[index])
}

/**
 * Restrict parent searches to the active organisation/project scope without
 * over-constraining layer searches.
 *
 * @param params Optional organisation/project filters for remote queries.
 * @returns Search prism arrays keyed by parent resource type.
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
 *
 * @param organisation Raw organisation-like record.
 * @returns A normalized parent-section organisation item, or `null` when unusable.
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
 *
 * @param project Raw project-like record.
 * @returns A normalized parent-section project item, or `null` when unusable.
 */
export function toParentProjectItem(
  project: ParentProjectRecord | null | undefined,
): ParentSectionProjectItem | null {
  if (!project?.id) return null
  return {
    flags: project.flags,
    id: project.id,
    organisationId: project.organisationId ?? '',
    code: project.code ?? '',
    i18n: project.i18n ?? null,
    image: project.image ?? null,
  }
}

/**
 * Converts a layer record into the parent-section item shape.
 *
 * @param layer Raw layer-like record.
 * @returns A normalized parent-section layer item, or `null` when unusable.
 */
export function toParentLayerItem(
  layer: ParentLayerRecord | null | undefined,
): ParentSectionLayerItem | null {
  if (!layer?.id) return null
  return {
    id: layer.id,
    metadata: layer.metadata ?? undefined,
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
 *
 * @param deps Page-owned state readers/writers and remote search adapters.
 * @returns A controller object with parent search and replacement handlers.
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

    // When a single project is creatable under an organisation, probe for a single viable layer too.
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

    // Preserve still-valid upstream/downstream selections so project swaps only clear invalid children.
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
    },
    cancelReplaceParentOrganisation(): void {},
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
