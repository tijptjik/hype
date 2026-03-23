import type { Point } from 'geojson'
import type { AppCtx } from '$lib/context/app.svelte'
import type { OmniCtx } from '$lib/context/omni.svelte'
import { NewFeatureMode, OmniMode } from '$lib/enums'
import type { Feature, FeatureFormInput } from '$lib/db/zod/schema/feature.types'

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
// ---

const DEFAULT_NEW_FEATURE_COORDINATES: [number, number] = [
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
