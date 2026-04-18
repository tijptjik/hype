// I18N
import { m } from '$lib/i18n'
// ICONS
import FormInputIcon from 'virtual:icons/lucide/form-input'
import FileTextIcon from 'virtual:icons/lucide/file-text'
import ImageIcon from 'virtual:icons/lucide/image'
import Layers3Icon from 'virtual:icons/lucide/layers-3'
import MapPinIcon from 'virtual:icons/lucide/map-pin'
import ShieldCheckIcon from 'virtual:icons/lucide/shield-check'
import TagIcon from 'virtual:icons/lucide/tag'
import type { Component } from 'svelte'
// ENUMS
import type { FirstClassResource } from '$lib/enums'
// TYPES
import type { FacetType } from '$lib/types'

export const ADMIN_FACETS = {
  core: 'core',
  capabilities: 'capabilities',
  address: 'address',
  images: 'images',
  fields: 'fields',
  layers: 'layers',
  policies: 'policies',
} as const satisfies Record<FacetType, FacetType>

export type HubFacet = 'core' | 'layers' | 'fields' | 'images' | 'policies'
export type OrganisationFacet = 'core' | 'capabilities' | 'fields' | 'images'
export type ProjectFacet = 'core' | 'capabilities' | 'layers' | 'fields' | 'images'
export type LayerFacet = 'core' | 'fields'

export const ADMIN_FACET_DEFINITIONS = {
  [ADMIN_FACETS.core]: {
    label: () => m.resources__profile(),
    icon: FormInputIcon,
  },
  [ADMIN_FACETS.capabilities]: {
    label: () => m.resources__capabilities(),
    icon: ShieldCheckIcon,
  },
  [ADMIN_FACETS.address]: {
    label: () => m.feature__address(),
    icon: MapPinIcon,
  },
  [ADMIN_FACETS.images]: {
    label: () => m.organisation__images(),
    icon: ImageIcon,
  },
  [ADMIN_FACETS.fields]: {
    label: () => m.project__fields(),
    icon: TagIcon,
  },
  [ADMIN_FACETS.layers]: {
    label: () => m.maps__layers(),
    icon: Layers3Icon,
  },
  [ADMIN_FACETS.policies]: {
    label: () => 'Policies',
    icon: FileTextIcon,
  },
} as const satisfies Record<FacetType, { label: () => string; icon: Component | null }>

export const ADMIN_FACET_ACTION_LABEL_DEFINITIONS = {
  [ADMIN_FACETS.core]: () => m.admin__forms_common_descriptors(),
  [ADMIN_FACETS.capabilities]: () => m.resources__capabilities(),
  [ADMIN_FACETS.address]: () => m.feature__address(),
  [ADMIN_FACETS.images]: () => m.feature__images(),
  [ADMIN_FACETS.fields]: () => m.admin__forms_common_fields(),
  [ADMIN_FACETS.layers]: () => m.maps__layers(),
  [ADMIN_FACETS.policies]: () => 'Policies',
} as const satisfies Record<FacetType, () => string>

export const ADMIN_FACET_LABEL_OVERRIDES_BY_RESOURCE: Partial<
  Record<FirstClassResource, Partial<Record<FacetType, () => string>>>
> = {
  feature: {
    images: () => m.feature__images(),
  },
}

export const ADMIN_FACET_ACTION_LABEL_OVERRIDES_BY_RESOURCE: Partial<
  Record<FirstClassResource, Partial<Record<FacetType, () => string>>>
> = {
  feature: {
    fields: () => m.feature__fields_title(),
  },
}

export const ADMIN_SUPPORTED_FACETS_BY_RESOURCE: Partial<
  Record<FirstClassResource, readonly FacetType[]>
> = {
  hub: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.layers,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.policies,
    ADMIN_FACETS.images,
  ],
  organisation: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.capabilities,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.images,
  ],
  project: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.capabilities,
    ADMIN_FACETS.layers,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.images,
  ],
  layer: [ADMIN_FACETS.core, ADMIN_FACETS.fields],
  feature: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.address,
    ADMIN_FACETS.images,
  ],
  task: [ADMIN_FACETS.core],
}

export const getAdminFacetSetForResource = (
  resourceType: FirstClassResource,
): readonly FacetType[] =>
  ADMIN_SUPPORTED_FACETS_BY_RESOURCE[resourceType] ?? [ADMIN_FACETS.core]

export const getSupportedFacetForResource = (
  resourceType: FirstClassResource,
  facet: FacetType | false | undefined,
): FacetType | undefined => {
  if (!facet) return undefined
  return getAdminFacetSetForResource(resourceType).includes(facet) ? facet : undefined
}

export const getAdminFacetTabsForResource = (
  resourceType: FirstClassResource,
  options: { coreOnly?: boolean } = {},
): Map<FacetType, { label: string; icon?: Component | null }> => {
  const supported = getAdminFacetSetForResource(resourceType).filter(
    facet => !options.coreOnly || facet === ADMIN_FACETS.core,
  )
  const labelOverrides = ADMIN_FACET_LABEL_OVERRIDES_BY_RESOURCE[resourceType] ?? {}

  return new Map(
    supported.map(facet => {
      const definition = ADMIN_FACET_DEFINITIONS[facet]
      const labelResolver = labelOverrides[facet] ?? definition.label
      return [facet, { label: labelResolver(), icon: definition.icon }] as const
    }),
  )
}

export const getAdminFacetActionLabel = (
  resourceType: FirstClassResource,
  facet: FacetType,
): string => {
  const labelOverrides =
    ADMIN_FACET_ACTION_LABEL_OVERRIDES_BY_RESOURCE[resourceType] ?? {}
  const labelResolver =
    labelOverrides[facet] ?? ADMIN_FACET_ACTION_LABEL_DEFINITIONS[facet]
  return labelResolver()
}

export const getAdminFacetOrderForResource = (
  resourceType: FirstClassResource,
  visibleFacets?:
    | ReadonlyMap<FacetType, unknown>
    | ReadonlySet<FacetType>
    | readonly FacetType[],
): FacetType[] => {
  const supported = getAdminFacetSetForResource(resourceType)
  if (!visibleFacets) return [...supported]

  const isVisible = (facet: FacetType): boolean => {
    if (visibleFacets instanceof Map || visibleFacets instanceof Set) {
      return visibleFacets.has(facet)
    }
    return visibleFacets.includes(facet)
  }

  return supported.filter(isVisible)
}
