// SVELTE
import { goto } from '$app/navigation'
// LIB
import { ADMIN_PATH } from '$lib/constants'
// ENUMS
import { FirstClassResource, ResourcePath, ResourceRefKey } from '$lib/enums'
// TYPES
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { AppCtx } from '$lib/context/app.svelte'
import type {
  Code,
  FacetType,
  Id,
  Resource,
  Organisation,
  Project,
  Hub,
} from '$lib/types'

function isNavigable(resource: unknown): resource is FirstClassResource {
  return (
    Object.values(FirstClassResource).includes(resource as FirstClassResource) &&
    resource !== FirstClassResource.property
  )
}

export const getResourcePathPart = (resource?: FirstClassResource) => {
  if (!resource) return null
  return ResourcePath[resource]
}

export const getUrlForResourceIndex = (resource: FirstClassResource) => {
  return `${ADMIN_PATH}/${getResourcePathPart(resource)}`
}

export const getResourceRef = (
  adminCtx: AdminCtx,
  resource: FirstClassResource,
  id: Id,
) => {
  if (!resource) return false
  const refKey = ResourceRefKey[resource as keyof typeof ResourceRefKey]
  const entity = adminCtx.appCtx.cache[resource].get(id)
  if (!entity) return false
  return entity[refKey as keyof Resource]
}

export const getUrlForResource = (
  adminCtx: AdminCtx,
  resource: FirstClassResource,
  id: Id,
  facet?: string,
) => {
  const ref = getResourceRef(adminCtx, resource, id)
  if (!ref) return null
  return `${ADMIN_PATH}/${getResourcePathPart(resource)}/${ref}${facet ? `#${facet}` : ''}`
}

export const navigateOnAdmin = (
  adminCtx: AdminCtx,
  resource: FirstClassResource | false,
  entityRef?: Id | Code,
  facet?: FacetType,
  queryParams?: Record<string, string>,
) => {
  let url = `${ADMIN_PATH}`
  if (resource && isNavigable(resource)) {
    url += `/${ResourcePath[resource]}`
    adminCtx.setResourceType(resource)
  } else {
    adminCtx.setResourceType(false)
    if (resource) {
      console.warn(`Attempted to navigate to a non-navigable resource: ${resource}`)
      return
    }
  }

  if (entityRef) {
    url += `/${entityRef}`
    adminCtx.setResourceRef(entityRef)
  } else {
    adminCtx.setResourceRef(false)
  }

  if (queryParams) url += `?${new URLSearchParams(queryParams).toString()}`
  if (facet) {
    url += `#${facet}`
    adminCtx.setFacet(facet)
  } else {
    adminCtx.setFacet(false)
  }
  goto(url)
}

export async function navigateOnAdminById(
  adminCtx: AdminCtx,
  resourceType: FirstClassResource | false,
  id: Id,
  facet?: FacetType,
  queryParams?: Record<string, string>,
): Promise<void> {
  let ref = id
  if (
    resourceType === FirstClassResource.organisation ||
    resourceType === FirstClassResource.project ||
    resourceType === FirstClassResource.hub
  ) {
    const resource = await adminCtx.appCtx.getResourceById(resourceType, id)
    if (resource) {
      ref = (resource as Organisation | Project | Hub).code
    }
  }
  navigateOnAdmin(adminCtx, resourceType, ref, facet, queryParams)
}

export async function getBreadcrumbs(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  resourceRef: Id | Code,
): Promise<{ name: string; href: string }[]> {
  try {
    const currentResource = await appCtx.getResourceByRef(resourceType, resourceRef)
    if (!currentResource) {
      return []
    }

    const hierarchy = await appCtx.getHierarchy(currentResource)
    const breadcrumbs: { name: string; href: string }[] = []

    const projectOrganisationCode = async (): Promise<string | null> => {
      if (resourceType !== FirstClassResource.project) return null
      const projectResource = currentResource as {
        code?: unknown
        organisationId?: unknown
      }
      const hierarchyOrgCode = hierarchy.organisation?.code
      const currentCode =
        typeof projectResource.code === 'string' ? projectResource.code : null
      const organisationId =
        typeof projectResource.organisationId === 'string'
          ? projectResource.organisationId
          : null

      // Guard against stale/partial hierarchy where organisation code collapses to project code.
      if (
        hierarchyOrgCode &&
        currentCode &&
        hierarchyOrgCode === currentCode &&
        organisationId &&
        typeof appCtx.getOrganisationById === 'function'
      ) {
        const parentOrganisation = await appCtx.getOrganisationById(organisationId)
        if (parentOrganisation?.code) return parentOrganisation.code
      }
      return hierarchyOrgCode ?? null
    }

    const organisationCode =
      resourceType === FirstClassResource.project
        ? await projectOrganisationCode()
        : (hierarchy.organisation?.code ?? null)

    if (organisationCode && resourceType !== 'organisation') {
      breadcrumbs.push({
        name: appCtx.getContextualOrganisationName(
          hierarchy.organisation,
          false,
          false,
        ),
        href: `${ADMIN_PATH}/${ResourcePath.organisation}/${organisationCode}`,
      })
    }

    if (hierarchy.project && resourceType !== 'project') {
      breadcrumbs.push({
        name: appCtx.getContextualProjectName(hierarchy.project, false, false),
        href: `${ADMIN_PATH}/${ResourcePath.project}/${hierarchy.project.code}`,
      })
    }

    if (hierarchy.layer && resourceType !== 'layer') {
      breadcrumbs.push({
        name: appCtx.getContextualLayerName(hierarchy.layer, false, false),
        href: `${ADMIN_PATH}/${ResourcePath.layer}/${hierarchy.layer.id}`,
      })
    }

    if (hierarchy.feature && resourceType !== 'feature') {
      breadcrumbs.push({
        name: appCtx.getContextualFeatureName(hierarchy.feature, false),
        href: `${ADMIN_PATH}/${ResourcePath.feature}/${hierarchy.feature.id}`,
      })
    }

    return breadcrumbs
  } catch (error) {
    console.error('Failed to generate breadcrumbs:', error)
    return []
  }
}

export const goToNextTask = (adminCtx: AdminCtx) => {
  let nextIndex: number | undefined
  const currentIndex = adminCtx.filteredTasks.findIndex(
    task => task.id === adminCtx.activeResourceRef,
  )
  const taskCount = adminCtx.filteredTasks.length

  if (currentIndex !== -1) {
    if (currentIndex < taskCount - 1) {
      nextIndex = currentIndex + 1
    } else if (currentIndex === taskCount - 1 && taskCount > 1) {
      nextIndex = currentIndex - 1
    } else {
      nextIndex = undefined
    }
  }
  const nextTaskId =
    nextIndex !== undefined ? adminCtx.filteredTasks[nextIndex].id : undefined
  adminCtx.invalidateAndRefresh(FirstClassResource.task)
  navigateOnAdmin(adminCtx, FirstClassResource.task, nextTaskId)
}
