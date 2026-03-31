import type { Point } from 'geojson'
import type { AppCtx } from '$lib/context/app.svelte'
import type { OmniCtx } from '$lib/context/omni.svelte'
import type { FeatureFieldSectionItem } from '$lib/bits/patterns/forms/formFeatureFieldsSection'
import { sortFeatureProperties } from '$lib/client/services/property'
import { NewFeatureMode, OmniMode } from '$lib/enums'
import type {
  Feature,
  FeatureFormInput,
  FeatureProperty,
} from '$lib/db/zod/schema/feature.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { CurrentUser, UserProfile } from '$lib/db/zod/schema/user.types'
import type { SessionUser, UserRoleDisco } from '$lib/types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. NEW FEATURE FLOW
// - initAddNewFeature
//
// 1. FORM SHAPING
// - toEmptyFeatureFormInput
// - toFeatureFormInput
// - getProgrammaticFeatureInputEntries
//
// 2. USER PROJECTIONS
// - toCurrentContributorUser
// - toCurrentAuthorizationUser
//
// 3. PROPERTY PROJECTIONS
// - toLayerBackedFeatureProperties
// - getNonTranslatableFeatureFieldItems
// - getTranslatableSpecifierProperties
// ---

export const DEFAULT_NEW_FEATURE_COORDINATES: [number, number] = [
  114.1693671540923, 22.319307515052614,
]

// ---
/********************
 *  0. NEW FEATURE FLOW
 ************/
// +++ New Feature Flow

/**
 * Initializes the admin add-feature flow from the current active layer selection.
 * @param appCtx App context containing active layer state and new-feature setters.
 * @param omniCtx Omni context controlling the global creation mode.
 * @param e Triggering UI event.
 * @returns Nothing.
 */
export const initAddNewFeature = async (appCtx: AppCtx, omniCtx: OmniCtx, e: Event) => {
  const activeLayers = appCtx.state.prisms.layer
  const singleActiveLayer =
    activeLayers.length === 1 ? appCtx.cache.layer.get(activeLayers[0]) : null

  e.preventDefault()
  e.stopPropagation()
  omniCtx.setMode(OmniMode.newFeature)

  if (activeLayers.length === 1) {
    if (singleActiveLayer) {
      const hierarchy = await appCtx.getHierarchy(singleActiveLayer)
      appCtx.setNewFeature({
        organisationId: hierarchy.organisation?.id,
        projectId: hierarchy.project?.id,
        layerId: hierarchy.layer?.id,
        feature: {
          organisationId: hierarchy.organisation?.id,
          projectId: hierarchy.project?.id,
          layerId: hierarchy.layer?.id,
        },
      })
      // Trigger the GeoLocation modal directly.
      appCtx.setNewFeatureMode(NewFeatureMode.location)
    }
  } else {
    // If multiple layers are active, dispatch event to show the layer selection modal.
    appCtx.setNewFeatureMode(NewFeatureMode.parents)
  }
}

// ---
/********************
 *  1. FORM SHAPING
 ************/
// +++ Form Shaping

/**
 * Creates the default form payload for a new feature draft.
 * @returns An empty feature form input with default geometry and i18n structure.
 */
export function toEmptyFeatureFormInput(): FeatureFormInput {
  return {
    meta: {
      mode: 'create',
      isAdminRequest: true,
    },
    data: {
      organisationId: '',
      projectId: '',
      layerId: '',
      contributorId: null,
      geometry: {
        type: 'Point',
        coordinates: DEFAULT_NEW_FEATURE_COORDINATES,
      },
      addressMeta: {},
      isIntangible: false,
      isVisitable: true,
      isPendingReview: false,
      i18n: {
        en: {
          title: '',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
        zhHans: {
          title: '',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
        zhHant: {
          title: '',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
      },
      properties: [],
    },
  }
}

/**
 * Normalizes a feature entity into the editable feature form shape.
 * @param value Feature entity to project into the form.
 * @returns A fully shaped feature form input.
 */
export function toFeatureFormInput(
  value: Feature | null | undefined,
): FeatureFormInput {
  if (!value) return toEmptyFeatureFormInput()

  return {
    meta: {
      id: value.id,
      updatedAt: value.modifiedAt,
      mode: 'update',
      isAdminRequest: true,
    },
    data: {
      organisationId: value.organisationId,
      projectId: value.projectId,
      layerId: value.layerId,
      contributorId: value.contributorId,
      geometry: value.geometry as Point,
      addressMeta: value.addressMeta ?? {},
      isIntangible: value.isIntangible,
      isVisitable: value.isVisitable,
      isPendingReview: value.isPendingReview,
      i18n: {
        en: {
          title: value.i18n?.en?.title ?? '',
          titleGen: value.i18n?.en?.titleGen ?? false,
          description: value.i18n?.en?.description ?? '',
          descriptionGen: value.i18n?.en?.descriptionGen ?? false,
          displayAddress: value.i18n?.en?.displayAddress ?? '',
          displayAddressGen: value.i18n?.en?.displayAddressGen ?? false,
          addressProperties: value.i18n?.en?.addressProperties ?? {},
        },
        zhHans: {
          title: value.i18n?.zhHans?.title ?? '',
          titleGen: value.i18n?.zhHans?.titleGen ?? false,
          description: value.i18n?.zhHans?.description ?? '',
          descriptionGen: value.i18n?.zhHans?.descriptionGen ?? false,
          displayAddress: value.i18n?.zhHans?.displayAddress ?? '',
          displayAddressGen: value.i18n?.zhHans?.displayAddressGen ?? false,
          addressProperties: value.i18n?.zhHans?.addressProperties ?? {},
        },
        zhHant: {
          title: value.i18n?.zhHant?.title ?? '',
          titleGen: value.i18n?.zhHant?.titleGen ?? false,
          description: value.i18n?.zhHant?.description ?? '',
          descriptionGen: value.i18n?.zhHant?.descriptionGen ?? false,
          displayAddress: value.i18n?.zhHant?.displayAddress ?? '',
          displayAddressGen: value.i18n?.zhHant?.displayAddressGen ?? false,
          addressProperties: value.i18n?.zhHant?.addressProperties ?? {},
        },
      },
      properties:
        value.properties?.map(property => ({
          propertyId: property.propertyId,
          value: property.value ?? '',
          propertyValueId: property.propertyValueId ?? '',
          i18n: {
            en: {
              value: property.i18n?.en?.value ?? '',
              valueGen: property.i18n?.en?.valueGen ?? false,
            },
            zhHans: {
              value: property.i18n?.zhHans?.value ?? '',
              valueGen: property.i18n?.zhHans?.valueGen ?? false,
            },
            zhHant: {
              value: property.i18n?.zhHant?.value ?? '',
              valueGen: property.i18n?.zhHant?.valueGen ?? false,
            },
          },
          property: property.property,
          propertyValue: property.propertyValue,
        })) ?? [],
    },
  }
}

/**
 * Serializes feature form fields into hidden-input name/value entries for programmatic form submission.
 *
 * @param value Current feature form input state.
 * @returns Flat hidden-input entries preserving nested feature form data.
 */
export function getProgrammaticFeatureInputEntries(
  value: FeatureFormInput['data'] | null | undefined,
): Array<{ name: string; value: string }> {
  const entries: Array<{ name: string; value: string }> = []
  const featureData = value

  const appendEntry = (name: string, entryValue: unknown): void => {
    if (entryValue === undefined || entryValue === null) return
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean' ||
      typeof entryValue === 'bigint'
    ) {
      entries.push({ name, value: String(entryValue) })
    }
  }

  const appendNestedEntries = (path: string, entryValue: unknown): void => {
    if (entryValue === undefined || entryValue === null) return
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean' ||
      typeof entryValue === 'bigint'
    ) {
      entries.push({ name: path, value: String(entryValue) })
      return
    }
    if (Array.isArray(entryValue)) {
      entryValue.forEach((item, index) => {
        appendNestedEntries(`${path}[${index}]`, item)
      })
      return
    }
    if (typeof entryValue === 'object') {
      Object.entries(entryValue as Record<string, unknown>).forEach(([key, nested]) => {
        appendNestedEntries(`${path}.${key}`, nested)
      })
    }
  }

  appendEntry('data.isIntangible', Boolean(featureData?.isIntangible))
  appendEntry('data.isVisitable', Boolean(featureData?.isVisitable))
  appendEntry('data.isPendingReview', Boolean(featureData?.isPendingReview))

  const geometry = featureData?.geometry as Point | undefined
  if (geometry?.type) appendEntry('data.geometry.type', geometry.type)
  geometry?.coordinates?.forEach((coordinate, index) => {
    appendEntry(`data.geometry.coordinates[${index}]`, coordinate)
  })

  appendNestedEntries('data.addressMeta', featureData?.addressMeta ?? {})
  ;(['en', 'zhHans', 'zhHant'] as const).forEach(locale => {
    const localeI18n = featureData?.i18n?.[locale]
    appendEntry(`data.i18n.${locale}.displayAddress`, localeI18n?.displayAddress ?? '')
    appendEntry(
      `data.i18n.${locale}.displayAddressGen`,
      Boolean(localeI18n?.displayAddressGen),
    )
    appendNestedEntries(
      `data.i18n.${locale}.addressProperties`,
      localeI18n?.addressProperties ?? {},
    )
  })

  ;(featureData?.properties ?? []).forEach((property, index) => {
    appendEntry(`data.properties[${index}].propertyId`, property.propertyId)
    appendEntry(`data.properties[${index}].value`, property.value ?? '')
    appendEntry(
      `data.properties[${index}].propertyValueId`,
      property.propertyValueId ?? '',
    )

    if (property.property?.isTranslatable) {
      const propertyI18n = property.i18n ?? {}
      ;(['en', 'zhHans', 'zhHant'] as const).forEach(locale => {
        appendEntry(
          `data.properties[${index}].i18n.${locale}.value`,
          propertyI18n[locale]?.value ?? '',
        )
        appendEntry(
          `data.properties[${index}].i18n.${locale}.valueGen`,
          Boolean(propertyI18n[locale]?.valueGen),
        )
      })
    }
  })

  return entries
}

// ---
/********************
 *  2. USER PROJECTIONS
 ************/
// +++ User Projections

/**
 * Projects the current app user into the subset needed for contributor UI.
 * @param user Current app user from app context.
 * @returns Contributor-facing user fields or `null` when no user is present.
 */
export function toCurrentContributorUser(
  user: CurrentUser | UserProfile | SessionUser | null | undefined,
): {
  id: string | null
  name: string | null
  attribution: string | null
  image: string | null
} | null {
  if (!user) return null

  return {
    id: 'id' in user ? (user.id ?? null) : null,
    name: 'name' in user ? (user.name ?? null) : null,
    attribution: 'attribution' in user ? (user.attribution ?? null) : null,
    image: 'image' in user ? (user.image ?? null) : null,
  }
}

/**
 * Projects the current app user into the subset needed for auth checks.
 * @param user Current app user from app context.
 * @returns Authorization-facing user fields or `null` when no user is present.
 */
export function toCurrentAuthorizationUser(
  user: CurrentUser | UserProfile | SessionUser | null | undefined,
): {
  id: string | null
  isAnonymous: boolean | null
  superAdmin: boolean | null
  roles: UserRoleDisco[]
} | null {
  if (!user) return null

  return {
    id: 'id' in user ? (user.id ?? null) : null,
    isAnonymous: 'isAnonymous' in user ? (user.isAnonymous ?? null) : null,
    superAdmin: 'superAdmin' in user ? (user.superAdmin ?? null) : null,
    roles: 'roles' in user && Array.isArray(user.roles) ? user.roles : [],
  }
}

// ---
/********************
 *  3. PROPERTY PROJECTIONS
 ************/
// +++ Property Projections

type FeaturePropertyDefinition = NonNullable<FeatureProperty['property']>
type FeaturePropertyValueOption = NonNullable<
  FeaturePropertyDefinition['values']
>[number]
type FeatureFormProperty = NonNullable<FeatureFormInput['data']['properties']>[number]
type FeaturePropertyWithDefinition = FeatureFormProperty & {
  property: FeaturePropertyDefinition
}

/**
 * Derives the feature-property rows implied by the selected layer.
 *
 * @param layer Resolved layer with visible classifier/specifier properties.
 * @param currentProperties Existing feature property rows.
 * @returns A sorted property collection aligned to the layer definition.
 */
export function toLayerBackedFeatureProperties(
  layer: Layer | null | undefined,
  currentProperties: FeatureFormInput['data']['properties'] | null | undefined,
): FeatureFormInput['data']['properties'] {
  if (!layer) return []

  const currentByPropertyId = new Map(
    (currentProperties ?? []).map(property => [property.propertyId, property]),
  )
  const seenPropertyIds = new Set<string>()

  // Keep only visible classifier/specifier properties and preserve any existing entered values.
  const nextProperties = (layer.properties ?? [])
    .filter(layerProperty => {
      const property = layerProperty.property
      const propertyId = layerProperty.propertyId ?? ''
      if (!propertyId || seenPropertyIds.has(propertyId)) return false
      seenPropertyIds.add(propertyId)
      return (
        layerProperty.isVisible === true &&
        property &&
        (property.type === 'classifier' || property.type === 'specifier')
      )
    })
    .map(layerProperty => {
      const propertyId = layerProperty.propertyId ?? ''
      const current = currentByPropertyId.get(propertyId)
      if (current) {
        return {
          ...current,
          property: layerProperty.property,
        }
      }

      return {
        propertyId,
        value: '',
        propertyValueId: '',
        i18n: {
          en: { value: '', valueGen: false },
          zhHans: { value: '', valueGen: false },
          zhHant: { value: '', valueGen: false },
        },
        property: layerProperty.property,
        propertyValue: null,
      }
    })

  return sortFeatureProperties(
    nextProperties as Omit<FeatureProperty, 'featureId'>[],
  ) as FeatureFormInput['data']['properties']
}

/**
 * Narrows a feature property to entries that include a hydrated property definition.
 *
 * @param property Feature property candidate.
 * @returns Whether the property has a loaded definition.
 */
function hasFeaturePropertyDefinition(
  property: FeatureFormProperty,
): property is FeaturePropertyWithDefinition {
  return property.property != null
}

/**
 * Builds form field items for classifier and non-translatable specifier properties.
 *
 * @param params Input properties and UI bindings for the feature fields section.
 * @returns Field-section items consumable by `FormFeatureFieldsSection`.
 */
export function getNonTranslatableFeatureFieldItems({
  properties,
  localeKey,
  isEditing,
  onChange,
}: {
  properties: FeatureFormInput['data']['properties'] | null | undefined
  localeKey: 'en' | 'zhHans' | 'zhHant'
  isEditing: boolean
  onChange: (propertyId: string, nextValue: string | boolean) => void
}): FeatureFieldSectionItem[] {
  return (properties ?? [])
    .filter(hasFeaturePropertyDefinition)
    .filter(
      property =>
        property.property.type === 'classifier' ||
        (property.property.type === 'specifier' && !property.property.isTranslatable),
    )
    .map(property => ({
      property: property.property,
      value: property.value ?? '',
      checked: property.value === 'true',
      isEditing,
      options:
        property.property.values?.map((option: FeaturePropertyValueOption) => ({
          value: option.id,
          label:
            option.i18n?.[localeKey]?.value ?? option.i18n?.en?.value ?? option.value,
        })) ?? [],
      onChange: (nextValue: string | boolean) => {
        onChange(property.propertyId, nextValue)
      },
    }))
}

/**
 * Selects translatable specifier properties for locale-specific editing.
 *
 * @param properties Feature properties from the current form state.
 * @returns Specifier properties that support translated values.
 */
export function getTranslatableSpecifierProperties(
  properties: FeatureFormInput['data']['properties'] | null | undefined,
): FeatureFormProperty[] {
  return (properties ?? []).filter(
    property =>
      property.property?.type === 'specifier' &&
      Boolean(property.property?.isTranslatable),
  )
}
