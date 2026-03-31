// DB
import {
  createDefaultProjectLicense,
  getCombinedLicenseLabel,
  isKnownGeneratedProjectLicenseLabel,
  getStandardLicenseLabel,
  normalizeProjectLicense,
  projectLicenseLeafMediaTypes,
} from '$lib/db/services/licence'
// TYPES
import type {
  ProjectLicense,
  ProjectLicenseMediaType,
  ProjectLicenseRights,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 LICENSE INTENT
//    - getProjectLicenseIntent
//
// 1.2 LICENSE BUILDING
//    - buildPresetProjectLicense
//    - toEffectiveLeafRights
//    - resolveLeafLicenseLabel
//    - buildProjectLicense
//
// 2.1 LICENSE INSPECTION
//    - isCustomProjectLicense

type ProjectLicenseLeafMediaType = (typeof projectLicenseLeafMediaTypes)[number]

export type ProjectLicenseIntent = 'publicDomain' | 'conditional' | 'allRightsReserved'

type ProjectLicenseBuildParams = {
  attribution?: string
  intent: ProjectLicenseIntent
  allMediaSameRights?: boolean
  rights?: Partial<Record<ProjectLicenseMediaType, Partial<ProjectLicenseRights>>>
  customLabels?: Partial<Record<ProjectLicenseLeafMediaType, string>>
  useCustomLabels?: boolean
}

/********************
 *  1.1 LICENSE INTENT
 ************/

/**
 * Resolves the current license intent from the normalized project license.
 *
 * @param license - Project license payload.
 * @returns Intent discriminator used by the project form UI.
 */
export function getProjectLicenseIntent(license: ProjectLicense): ProjectLicenseIntent {
  const allLeafPublicDomain = projectLicenseLeafMediaTypes.every(
    mediaType => license.media[mediaType].isPublicDomain === true,
  )
  const allLeafAllRightsReserved = projectLicenseLeafMediaTypes.every(
    mediaType => license.media[mediaType].isAllRightsReserved === true,
  )

  if (license.meta.isPublicDomain) return 'publicDomain'
  if (license.meta.isAllRightsReserved) return 'allRightsReserved'
  if (allLeafPublicDomain) return 'publicDomain'
  if (allLeafAllRightsReserved) return 'allRightsReserved'
  return 'conditional'
}

/********************
 *  1.2 LICENSE BUILDING
 ************/

/**
 * Builds one of the fixed preset license payloads used by the form intent switcher.
 *
 * @param intent - Non-conditional intent to materialize.
 * @param attribution - Attribution text to persist alongside the preset.
 * @returns Fully built preset license payload.
 */
function buildPresetProjectLicense(
  intent: Exclude<ProjectLicenseIntent, 'conditional'>,
  attribution: string,
): ProjectLicense {
  const isPublicDomain = intent === 'publicDomain'
  const presetFlags = isPublicDomain
    ? { BY: false, SA: false, NC: false, ND: false }
    : { BY: null, SA: true, NC: true, ND: true }

  return {
    meta: {
      allMediaSameRights: true,
      attribution,
      isAllRightsReserved: !isPublicDomain,
      isPublicDomain,
      history: [],
    },
    media: {
      all: {
        license: isPublicDomain ? 'CC0 / PDDL' : 'Copyright',
        isPublicDomain,
        isAllRightsReserved: !isPublicDomain,
        ...presetFlags,
      },
      image: {
        license: isPublicDomain ? 'CC0' : 'Copyright',
        isPublicDomain,
        isAllRightsReserved: !isPublicDomain,
        ...presetFlags,
      },
      text: {
        license: isPublicDomain ? 'CC0' : 'Copyright',
        isPublicDomain,
        isAllRightsReserved: !isPublicDomain,
        ...presetFlags,
      },
      data: {
        license: isPublicDomain ? 'PDDL' : 'Copyright',
        isPublicDomain,
        isAllRightsReserved: !isPublicDomain,
        ...presetFlags,
      },
    },
  }
}

/**
 * Expands submitted rights into a fully shaped leaf-media rights map.
 *
 * @param defaults - Canonical conditional defaults used as the merge base.
 * @param rights - Submitted partial rights keyed by media type.
 * @param allMediaSameRights - Whether `all` rights should be copied to each leaf media scope.
 * @returns Normalized leaf-media rights keyed by media type.
 */
function toEffectiveLeafRights(
  defaults: ProjectLicense,
  rights: Partial<Record<ProjectLicenseMediaType, Partial<ProjectLicenseRights>>>,
  allMediaSameRights: boolean,
): Record<ProjectLicenseLeafMediaType, ProjectLicenseRights> {
  const allRights = {
    ...defaults.media.all,
    ...rights.all,
  }

  // Expand shared `all` rights onto leaf media so the editor can always read one stable shape.
  return Object.fromEntries(
    projectLicenseLeafMediaTypes.map(mediaType => [
      mediaType,
      allMediaSameRights
        ? {
            ...defaults.media[mediaType],
            BY: allRights.BY,
            SA: allRights.SA,
            NC: allRights.NC,
            ND: allRights.ND,
            isPublicDomain:
              rights[mediaType]?.isPublicDomain ??
              defaults.media[mediaType].isPublicDomain,
            isAllRightsReserved:
              rights[mediaType]?.isAllRightsReserved ??
              defaults.media[mediaType].isAllRightsReserved,
          }
        : {
            ...defaults.media[mediaType],
            ...rights[mediaType],
          },
    ]),
  ) as Record<ProjectLicenseLeafMediaType, ProjectLicenseRights>
}

/**
 * Resolves the display label for one leaf media scope, honoring custom labels when enabled.
 *
 * @param mediaType - Leaf media scope to label.
 * @param rights - Effective rights for the media scope.
 * @param useCustomLabels - Whether freeform labels should override derived labels.
 * @param customLabel - Optional freeform label entered by the user.
 * @returns Final display label for the media scope.
 */
function resolveLeafLicenseLabel(
  mediaType: ProjectLicenseLeafMediaType,
  rights: ProjectLicenseRights,
  useCustomLabels: boolean,
  customLabel?: string,
): string {
  if (rights.isPublicDomain) {
    return mediaType === 'data' ? 'PDDL' : 'CC0'
  }

  if (rights.isAllRightsReserved) {
    return 'Copyright'
  }

  if (useCustomLabels) {
    return customLabel?.trim() || 'Custom license'
  }

  return getStandardLicenseLabel(mediaType, rights)
}

/**
 * Builds a project license payload from form-state intent and rights selections.
 *
 * @param params - Form-driven license build parameters.
 * @returns Project license payload ready for submission.
 */
export function buildProjectLicense(params: ProjectLicenseBuildParams): ProjectLicense {
  const {
    attribution = '',
    intent,
    allMediaSameRights = true,
    rights = {},
    customLabels = {},
    useCustomLabels = false,
  } = params

  if (intent !== 'conditional') {
    return buildPresetProjectLicense(intent, attribution)
  }

  const defaults = createDefaultProjectLicense(attribution)
  const allRights = {
    ...defaults.media.all,
    ...rights.all,
  }
  const effectiveLeafRights = toEffectiveLeafRights(
    defaults,
    rights,
    allMediaSameRights,
  )

  // Keep `all` as a summary view while leaf media carry the effective persisted labels.
  return {
    meta: {
      allMediaSameRights,
      attribution,
      isAllRightsReserved: false,
      isPublicDomain: false,
      history: [],
    },
    media: {
      all: {
        ...allRights,
        isPublicDomain: allRights.isPublicDomain ?? false,
        isAllRightsReserved: allRights.isAllRightsReserved ?? false,
        license: useCustomLabels
          ? 'Custom license'
          : getCombinedLicenseLabel(allRights),
      },
      image: {
        ...effectiveLeafRights.image,
        license: resolveLeafLicenseLabel(
          'image',
          effectiveLeafRights.image,
          useCustomLabels,
          customLabels.image,
        ),
      },
      text: {
        ...effectiveLeafRights.text,
        license: resolveLeafLicenseLabel(
          'text',
          effectiveLeafRights.text,
          useCustomLabels,
          customLabels.text,
        ),
      },
      data: {
        ...effectiveLeafRights.data,
        license: resolveLeafLicenseLabel(
          'data',
          effectiveLeafRights.data,
          useCustomLabels,
          customLabels.data,
        ),
      },
    },
  }
}

/********************
 *  2.1 LICENSE INSPECTION
 ************/

/**
 * Detects whether the project uses custom license labels beyond the standard derived labels.
 *
 * @param license - Project license payload.
 * @returns `true` when one or more labels diverge from the standard derived labels.
 */
export function isCustomProjectLicense(license: ProjectLicense): boolean {
  const allLeafPublicDomain = projectLicenseLeafMediaTypes.every(
    mediaType => license.media[mediaType].isPublicDomain === true,
  )
  const allLeafAllRightsReserved = projectLicenseLeafMediaTypes.every(
    mediaType => license.media[mediaType].isAllRightsReserved === true,
  )

  if (
    license.meta.isAllRightsReserved ||
    license.meta.isPublicDomain ||
    allLeafPublicDomain ||
    allLeafAllRightsReserved
  ) {
    return false
  }

  return projectLicenseLeafMediaTypes.some(
    mediaType => !isKnownGeneratedProjectLicenseLabel(license.media[mediaType].license),
  )
}

/**
 * Detects whether a conditional license uses any per-media PD/ARR preset states.
 *
 * @param license - Project license payload.
 * @returns `true` when any leaf media diverges via a per-media preset.
 */
export function hasPerMediaPresetProjectLicense(license: ProjectLicense): boolean {
  if (license.meta.isAllRightsReserved || license.meta.isPublicDomain) return false

  return projectLicenseLeafMediaTypes.some(
    mediaType =>
      license.media[mediaType].license !==
        getStandardLicenseLabel(mediaType, license.media[mediaType]) ||
      license.media[mediaType].isPublicDomain === true ||
      license.media[mediaType].isAllRightsReserved === true,
  )
}

export function toProjectLicenseFilterCache(license: ProjectLicense): {
  isAllRightsReserved: boolean
  isPublicDomain: boolean
  hasLicenseBy: boolean | null
  hasLicenseSa: boolean | null
  hasLicenseNc: boolean | null
  hasLicenseNd: boolean | null
} {
  const normalized = normalizeProjectLicense(license)

  return {
    isAllRightsReserved: normalized.meta.isAllRightsReserved,
    isPublicDomain: normalized.meta.isPublicDomain,
    hasLicenseBy: normalized.media.all.BY,
    hasLicenseSa: normalized.media.all.SA,
    hasLicenseNc: normalized.media.all.NC,
    hasLicenseNd: normalized.media.all.ND,
  }
}

export {
  createDefaultProjectLicense,
  normalizeProjectLicense,
  projectLicenseLeafMediaTypes,
}
