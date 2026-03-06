// I18N
import { m } from '$lib/i18n'
// ICONS
import FormInputIcon from 'virtual:icons/lucide/form-input'
import ImageIcon from 'virtual:icons/lucide/image'
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
} as const satisfies Record<FacetType, FacetType>

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
} as const satisfies Record<FacetType, { label: () => string; icon: Component | null }>

export const ADMIN_FACET_LABEL_OVERRIDES_BY_RESOURCE: Partial<
  Record<FirstClassResource, Partial<Record<FacetType, () => string>>>
> = {
  feature: {
    images: () => m.feature__images(),
  },
}

export const ADMIN_SUPPORTED_FACETS_BY_RESOURCE: Partial<
  Record<FirstClassResource, readonly FacetType[]>
> = {
  hub: [ADMIN_FACETS.core, ADMIN_FACETS.images],
  organisation: [ADMIN_FACETS.core, ADMIN_FACETS.capabilities, ADMIN_FACETS.images],
  project: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.capabilities,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.images,
  ],
  layer: [ADMIN_FACETS.core, ADMIN_FACETS.fields],
  feature: [ADMIN_FACETS.core, ADMIN_FACETS.address, ADMIN_FACETS.images],
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
