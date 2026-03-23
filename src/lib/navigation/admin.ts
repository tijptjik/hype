// SVELTE
import { goto, pushState } from '$app/navigation'
// LIB
import { ADMIN_PATH } from '$lib/constants'
// ENUMS
import { FirstClassResource, ResourcePath, ResourceRefKey } from '$lib/enums'
import type { HeaderCrumb } from '$lib/bits/custom/header'
// TYPES
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { AppCtx } from '$lib/context/app.svelte'
import type { Code, FacetType, Id, NavigableResource, Resource } from '$lib/types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Hub } from '$lib/db/zod/schema/hub.types'

function isNavigable(resource: unknown): resource is NavigableResource {
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

export const getAdminIndexResourceType = (
  pathname: string,
): NavigableResource | false => {
  const resourceType = Object.entries(ResourcePath).find(
    ([_, path]) => pathname === `/admin/${path}` || pathname === `/admin/${path}/`,
  )?.[0]

  return resourceType && isNavigable(resourceType)
    ? (resourceType as NavigableResource)
    : false
}

export const resetAdminIndexResourceRef = (
  adminCtx: AdminCtx,
  pathname: string,
): void => {
  const resourceType = getAdminIndexResourceType(pathname)

  if (!resourceType || adminCtx.activeResourceRef === false) {
    return
  }

  adminCtx.setResourceRef(false, resourceType)
}

export const shouldClearAdminFeatureCacheOnNavigate = (
  fromRouteId?: string | null,
  toRouteId?: string | null,
): boolean => {
  if (!fromRouteId || !toRouteId) {
    return false
  }

  const fromIsAdmin = fromRouteId.startsWith('/admin')
  const toIsAdmin = toRouteId.startsWith('/admin')

  return fromIsAdmin !== toIsAdmin
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

  const currentUrl =
    typeof window !== 'undefined' ? new URL(window.location.href) : null
  const targetUrl = currentUrl ? new URL(url, currentUrl.origin) : null
  const isHashOnlyNavigation =
    currentUrl &&
    targetUrl &&
    currentUrl.pathname === targetUrl.pathname &&
    currentUrl.search === targetUrl.search &&
    currentUrl.hash !== targetUrl.hash

  if (isHashOnlyNavigation) {
    pushState(targetUrl.toString(), {})
    return
  }

  void goto(url, { noScroll: true, keepFocus: true, replaceState: false })
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
): Promise<HeaderCrumb[]> {
  try {
    const currentResource = await appCtx.getResourceByRef(resourceType, resourceRef)
    if (!currentResource) {
      return []
    }

    const hierarchy = await appCtx.getHierarchy(currentResource)
    const hierarchyHub = (hierarchy as { hub?: unknown }).hub
    const breadcrumbs: HeaderCrumb[] = []

    const getHubCrumbName = (value: unknown): string => {
      const code =
        typeof (value as { code?: unknown })?.code === 'string'
          ? ((value as { code: string }).code ?? '').trim()
          : ''
      const i18n = (value as { i18n?: Record<string, { nameShort?: string | null }> })
        ?.i18n
      const shortName = (
        i18n?.en?.nameShort ??
        i18n?.zhHans?.nameShort ??
        i18n?.zhHant?.nameShort ??
        ''
      ).trim()
      return code || shortName || 'Hub'
    }

    if (resourceType === FirstClassResource.hub) {
      return [{ name: getHubCrumbName(hierarchyHub ?? currentResource) }]
    }

    if (hierarchyHub) {
      breadcrumbs.push({ name: getHubCrumbName(hierarchyHub) })
    }

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

    if (
      organisationCode &&
      hierarchy.organisation &&
      resourceType !== FirstClassResource.organisation
    ) {
      const organisationName =
        appCtx.getContextualOrganisationName(hierarchy.organisation, false, false) ??
        hierarchy.organisation.code
      breadcrumbs.push({
        name: organisationName,
        href: `${ADMIN_PATH}/${ResourcePath.organisation}/${organisationCode}`,
      })
    }

    if (hierarchy.project && resourceType !== FirstClassResource.project) {
      const projectName =
        appCtx.getContextualProjectName(hierarchy.project, false, false) ??
        hierarchy.project.code
      breadcrumbs.push({
        name: projectName,
        href: `${ADMIN_PATH}/${ResourcePath.project}/${hierarchy.project.code}`,
      })
    }

    if (hierarchy.layer && resourceType !== FirstClassResource.layer) {
      const layerName =
        appCtx.getContextualLayerName(hierarchy.layer, false, false) ??
        hierarchy.layer.id
      breadcrumbs.push({
        name: layerName,
        href: `${ADMIN_PATH}/${ResourcePath.layer}/${hierarchy.layer.id}`,
      })
    }

    if (hierarchy.feature && resourceType !== FirstClassResource.feature) {
      const feature = hierarchy.feature as Parameters<
        typeof appCtx.getContextualFeatureName
      >[0]
      const featureName =
        appCtx.getContextualFeatureName(feature) ?? hierarchy.feature.id
      breadcrumbs.push({
        name: featureName,
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
