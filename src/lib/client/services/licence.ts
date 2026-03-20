// DB
import {
  createDefaultProjectLicense,
  getCombinedLicenseLabel,
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
  if (license.meta.isPublicDomain) return 'publicDomain'
  if (license.meta.isAllRightsReserved) return 'allRightsReserved'
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

  return {
    meta: {
      allMediaSameRights: true,
      attribution,
      isAllRightsReserved: !isPublicDomain,
      isPublicDomain,
    },
    media: {
      all: {
        license: isPublicDomain ? 'CC0 / PDDL' : 'Copyright',
        BY: isPublicDomain ? false : null,
        SA: isPublicDomain ? false : null,
        NC: isPublicDomain ? false : true,
        ND: isPublicDomain ? false : true,
      },
      image: {
        license: isPublicDomain ? 'CC0' : 'Copyright',
        BY: isPublicDomain ? false : null,
        SA: isPublicDomain ? false : null,
        NC: isPublicDomain ? false : true,
        ND: isPublicDomain ? false : true,
      },
      text: {
        license: isPublicDomain ? 'CC0' : 'Copyright',
        BY: isPublicDomain ? false : null,
        SA: isPublicDomain ? false : null,
        NC: isPublicDomain ? false : true,
        ND: isPublicDomain ? false : true,
      },
      data: {
        license: isPublicDomain ? 'PDDL' : 'Copyright',
        BY: isPublicDomain ? false : null,
        SA: isPublicDomain ? false : null,
        NC: isPublicDomain ? false : true,
        ND: isPublicDomain ? false : true,
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

  return {
    meta: {
      allMediaSameRights,
      attribution,
      isAllRightsReserved: false,
      isPublicDomain: false,
    },
    media: {
      all: {
        ...allRights,
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
  if (license.meta.isAllRightsReserved || license.meta.isPublicDomain) return false

  return (
    license.media.all.license !==
      getCombinedLicenseLabel({
        BY: license.media.all.BY,
        SA: license.media.all.SA,
        NC: license.media.all.NC,
        ND: license.media.all.ND,
      }) ||
    projectLicenseLeafMediaTypes.some(
      mediaType =>
        license.media[mediaType].license !==
        getStandardLicenseLabel(mediaType, license.media[mediaType]),
    )
  )
}

export {
  createDefaultProjectLicense,
  normalizeProjectLicense,
  projectLicenseLeafMediaTypes,
}
