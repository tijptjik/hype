// I18N
import { m } from '#lib/i18n.js'
// NAVIGATION
import { messagingNavigationEnabled } from '#lib/navigation/releases.js'
// ICONS
import RelationshipsIcon from 'virtual:icons/lucide/network'
import ShareIcon from 'virtual:icons/proicons/share'
import FormInputIcon from 'virtual:icons/proicons/button'
import UsersIcon from 'virtual:icons/lucide/users'
import StoreIcon from 'virtual:icons/lucide/store'
import ChatIcon from 'virtual:icons/lucide/message-circle'
import FileTextIcon from 'virtual:icons/proicons/file-text'
import ImageIcon from 'virtual:icons/proicons/photo'
import Layers3Icon from 'virtual:icons/proicons/layers'
import MapPinIcon from 'virtual:icons/proicons/location'
import UpdatesIcon from 'virtual:icons/proicons/arrow-sync'
import SettingsIcon from 'virtual:icons/proicons/settings'
import ShieldCheckIcon from 'virtual:icons/proicons/shield-checkmark'
import TagIcon from 'virtual:icons/proicons/tag'
import type { Component } from 'svelte'
// ENUMS
import type { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { FacetType } from '#lib/context/facets.js'

export const ADMIN_FACETS = {
  share: 'share',
  core: 'core',
  relationships: 'relationships',
  capabilities: 'capabilities',
  messaging: 'messaging',
  users: 'users',
  location: 'location',
  updates: 'updates',
  images: 'images',
  fields: 'fields',
  layers: 'layers',
  features: 'features',
  policies: 'policies',
  advanced: 'advanced',
} as const satisfies Record<FacetType, FacetType>

export type HubFacet =
  | 'share'
  | 'core'
  | 'location'
  | 'layers'
  | 'fields'
  | 'images'
  | 'policies'
  | 'advanced'
export type OrganisationFacet =
  | 'share'
  | 'updates'
  | 'users'
  | 'messaging'
  | 'features'
  | 'advanced'
  | 'core'
  | 'capabilities'
  | 'fields'
  | 'images'
export type ProjectFacet =
  | 'location'
  | 'share'
  | 'features'
  | 'advanced'
  | 'core'
  | 'capabilities'
  | 'layers'
  | 'fields'
  | 'images'
export type LayerFacet =
  | 'location'
  | 'share'
  | 'features'
  | 'core'
  | 'fields'
  | 'advanced'

export const ADMIN_FACET_DEFINITIONS = {
  relationships: {
    label: () => m.location_record_relationships(),
    icon: RelationshipsIcon,
  },
  [ADMIN_FACETS.share]: { label: () => 'Share', icon: ShareIcon },
  [ADMIN_FACETS.users]: { label: () => 'Users', icon: UsersIcon },
  [ADMIN_FACETS.messaging]: { label: () => 'Messaging', icon: ChatIcon },
  [ADMIN_FACETS.features]: { label: () => m.omni__title_features(), icon: MapPinIcon },
  [ADMIN_FACETS.advanced]: { label: () => m.project_advanced(), icon: SettingsIcon },
  [ADMIN_FACETS.core]: {
    label: () => m.resources__profile(),
    icon: FormInputIcon,
  },
  [ADMIN_FACETS.capabilities]: {
    label: () => m.resources__capabilities(),
    icon: ShieldCheckIcon,
  },
  [ADMIN_FACETS.location]: {
    label: () => m.feature_location_title(),
    icon: MapPinIcon,
  },
  [ADMIN_FACETS.updates]: { label: () => m.feature_updates_title(), icon: UpdatesIcon },
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
  relationships: () => m.location_record_relationships(),
  [ADMIN_FACETS.share]: () => 'Share',
  [ADMIN_FACETS.users]: () => 'Users',
  [ADMIN_FACETS.messaging]: () => 'Messaging',
  [ADMIN_FACETS.features]: () => m.omni__title_features(),
  [ADMIN_FACETS.advanced]: () => m.project_advanced(),
  [ADMIN_FACETS.core]: () => m.admin__forms_common_descriptors(),
  [ADMIN_FACETS.capabilities]: () => m.resources__capabilities(),
  [ADMIN_FACETS.location]: () => m.feature_location_title(),
  [ADMIN_FACETS.updates]: () => m.feature_updates_title(),
  [ADMIN_FACETS.images]: () => m.feature__images(),
  [ADMIN_FACETS.fields]: () => m.admin__forms_common_fields(),
  [ADMIN_FACETS.layers]: () => m.maps__layers(),
  [ADMIN_FACETS.policies]: () => 'Policies',
} as const satisfies Record<FacetType, () => string>

export const ADMIN_FACET_LABEL_OVERRIDES_BY_RESOURCE: Partial<
  Record<FirstClassResource, Partial<Record<FacetType, () => string>>>
> = {
  organisation: { updates: () => 'History' },
  project: { updates: () => 'History' },
  layer: { updates: () => 'History' },
  hub: { updates: () => 'History' },
  feature: {
    updates: () => 'History',
    location: () => m.feature_location_title(),
    images: () => m.feature__images(),
  },
}

export const ADMIN_FACET_ACTION_LABEL_OVERRIDES_BY_RESOURCE: Partial<
  Record<FirstClassResource, Partial<Record<FacetType, () => string>>>
> = {
  organisation: { updates: () => 'History' },
  project: { updates: () => 'History' },
  layer: { updates: () => 'History' },
  hub: { updates: () => 'History' },
  feature: {
    updates: () => 'History',
    core: () => m.resources__profile(),
    location: () => m.feature_location_title(),
    fields: () => m.feature__fields_title(),
  },
}

export const ADMIN_SUPPORTED_FACETS_BY_RESOURCE: Partial<
  Record<FirstClassResource, readonly FacetType[]>
> = {
  hub: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.location,
    ADMIN_FACETS.layers,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.policies,
    ADMIN_FACETS.images,
    ADMIN_FACETS.updates,
    ADMIN_FACETS.advanced,
    ADMIN_FACETS.share,
  ],
  organisation: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.features,
    ADMIN_FACETS.users,
    ADMIN_FACETS.capabilities,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.messaging,
    ADMIN_FACETS.updates,
    ADMIN_FACETS.images,
    ADMIN_FACETS.advanced,
    ADMIN_FACETS.share,
  ],
  project: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.location,
    ADMIN_FACETS.features,
    ADMIN_FACETS.capabilities,
    ADMIN_FACETS.layers,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.images,
    ADMIN_FACETS.advanced,
    ADMIN_FACETS.updates,
    ADMIN_FACETS.share,
  ],
  layer: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.location,
    ADMIN_FACETS.features,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.advanced,
    ADMIN_FACETS.updates,
    ADMIN_FACETS.share,
  ],
  feature: [
    ADMIN_FACETS.core,
    ADMIN_FACETS.location,
    ADMIN_FACETS.fields,
    ADMIN_FACETS.images,
    ADMIN_FACETS.updates,
  ],
  location: [ADMIN_FACETS.core, ADMIN_FACETS.relationships, ADMIN_FACETS.features],
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

/**
 * Build the resource's facet tabs with their labels and icons.
 * @param resourceType - Resource whose tabs are being displayed.
 * @param options - Optional restriction to the core facet.
 * @returns Supported facet tabs in display order.
 */
export const getAdminFacetTabsForResource = (
  resourceType: FirstClassResource,
  options: { coreOnly?: boolean } = {},
): Map<FacetType, { label: string; icon?: Component | null }> => {
  const supported = getAdminFacetSetForResource(resourceType).filter(
    facet =>
      (messagingNavigationEnabled || facet !== ADMIN_FACETS.messaging) &&
      (!options.coreOnly || facet === ADMIN_FACETS.core),
  )
  const labelOverrides = ADMIN_FACET_LABEL_OVERRIDES_BY_RESOURCE[resourceType] ?? {}

  return new Map(
    supported.map(facet => {
      const definition = ADMIN_FACET_DEFINITIONS[facet]
      const labelResolver = labelOverrides[facet] ?? definition.label
      const icon =
        resourceType === 'project' && facet === ADMIN_FACETS.policies
          ? StoreIcon
          : definition.icon
      return [facet, { label: labelResolver(), icon }] as const
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
    if ('has' in visibleFacets) {
      return visibleFacets.has(facet)
    }
    return visibleFacets.includes(facet)
  }

  return supported.filter(isVisible)
}
