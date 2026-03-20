// API
import { normalizeBoolean, toBooleanOrNull } from '$lib/api/services'
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
// 1.1 LICENSE CONSTANTS
//    - projectLicenseMediaTypes
//    - projectLicenseLeafMediaTypes
//
// 1.2 LICENSE DEFAULTS
//    - createConditionalRightsDefaults
//    - createDefaultProjectLicense
//
// 2.1 LICENSE READ HELPERS
//    - parseProjectLicense
//    - getStandardLicenseLabel
//    - getCombinedLicenseLabel
//
// 2.2 LICENSE NORMALIZATION
//    - normalizeProjectLicenseRights
//    - normalizeProjectLicense

const projectLicenseRightsKeys = ['BY', 'SA', 'NC', 'ND'] as const
const defaultLicenseLabelByMediaType = {
  all: 'CC BY-SA / ODC-ODbL',
  image: 'CC BY-SA',
  text: 'CC BY-SA',
  data: 'ODC-ODbL',
} as const satisfies Record<ProjectLicenseMediaType, string>

export const projectLicenseMediaTypes = [
  'all',
  'image',
  'text',
  'data',
] as const satisfies ProjectLicenseMediaType[]

export const projectLicenseLeafMediaTypes = ['image', 'text', 'data'] as const

/********************
 *  1.2 LICENSE DEFAULTS
 ************/

/**
 * Builds the default rights object for a media scope under the conditional-license flow.
 *
 * @param mediaType - Media scope to initialize.
 * @returns Default conditional rights for the requested media scope.
 */
function createConditionalRightsDefaults(
  mediaType: ProjectLicenseMediaType,
): ProjectLicenseRights {
  return {
    license: defaultLicenseLabelByMediaType[mediaType],
    BY: true,
    SA: true,
    NC: false,
    ND: false,
  }
}

/**
 * Builds the canonical default project license payload.
 *
 * @param attribution - Optional attribution string persisted in the license metadata.
 * @returns Default conditional license payload.
 */
export function createDefaultProjectLicense(attribution = ''): ProjectLicense {
  return {
    meta: {
      allMediaSameRights: true,
      attribution,
      isAllRightsReserved: false,
      isPublicDomain: false,
    },
    media: Object.fromEntries(
      projectLicenseMediaTypes.map(mediaType => [
        mediaType,
        createConditionalRightsDefaults(mediaType),
      ]),
    ) as ProjectLicense['media'],
  }
}

/********************
 *  2.1 LICENSE READ HELPERS
 ************/

/**
 * Parses persisted project-license input into a typed object when possible.
 *
 * @param value - Stored JSON string or object payload.
 * @returns Parsed license object, or `undefined` when the input is empty or invalid.
 */
export function parseProjectLicense(value: unknown): ProjectLicense | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed) as ProjectLicense
    } catch {
      return undefined
    }
  }

  if (typeof value === 'object') {
    return value as ProjectLicense
  }

  return undefined
}

/**
 * Resolves a standard license label from the selected rights flags.
 *
 * @param mediaType - Leaf media type being labeled.
 * @param rights - Rights flags used to derive the standard label.
 * @returns Standard license label, or `Custom license` when no standard label fits.
 */
export function getStandardLicenseLabel(
  mediaType: Exclude<ProjectLicenseMediaType, 'all'>,
  rights: Pick<ProjectLicenseRights, 'BY' | 'SA' | 'NC' | 'ND'>,
): string {
  const by = rights.BY === true
  const sa = rights.SA === true
  const nc = rights.NC === true
  const nd = rights.ND === true

  if (!by && !sa && !nc && !nd) {
    return mediaType === 'data' ? 'PDDL' : 'CC0'
  }

  if (!by || (nd && sa)) return 'Custom license'

  if (mediaType === 'data' && !nc && !nd) {
    return sa ? 'ODC-ODbL' : 'ODC-By'
  }

  const tokens = ['BY']
  if (nc) tokens.push('NC')
  if (nd) tokens.push('ND')
  else if (sa) tokens.push('SA')

  return `CC ${tokens.join('-')}`
}

/**
 * Resolves the combined `all`-media label from the shared text/data rights flags.
 *
 * @param rights - Rights flags used to derive the combined label.
 * @returns Shared label when text and data match, otherwise a joined text/data label.
 */
function getCombinedLicenseLabel(
  rights: Pick<ProjectLicenseRights, 'BY' | 'SA' | 'NC' | 'ND'>,
): string {
  const textLicense = getStandardLicenseLabel('text', rights)
  const dataLicense = getStandardLicenseLabel('data', rights)

  return textLicense === dataLicense ? textLicense : `${textLicense} / ${dataLicense}`
}

/********************
 *  2.2 LICENSE NORMALIZATION
 ************/

/**
 * Normalizes one media-scope rights object onto the canonical persisted shape.
 *
 * @param rights - Partial or legacy rights payload for a media scope.
 * @param defaults - Default rights used when fields are missing.
 * @returns Normalized rights object.
 */
function normalizeProjectLicenseRights(
  rights: Partial<ProjectLicenseRights> | null | undefined,
  defaults: ProjectLicenseRights,
): ProjectLicenseRights {
  const normalizedFlags = projectLicenseRightsKeys.reduce(
    (accumulator, key) => {
      accumulator[key] = toBooleanOrNull(rights?.[key], defaults[key])
      return accumulator
    },
    {} as Pick<ProjectLicenseRights, (typeof projectLicenseRightsKeys)[number]>,
  )

  return {
    license: rights?.license ?? defaults.license,
    ...normalizedFlags,
  }
}

/**
 * Normalizes partial or legacy project-license payloads into the full persisted shape.
 *
 * @param license - Partial persisted license payload.
 * @param fallbackAttribution - Attribution fallback used when the payload omits it.
 * @returns Fully normalized project license.
 */
export function normalizeProjectLicense(
  license: ProjectLicense | null | undefined,
  fallbackAttribution = '',
): ProjectLicense {
  const defaults = createDefaultProjectLicense(fallbackAttribution)
  const parsed = license ?? defaults

  return {
    meta: {
      allMediaSameRights: normalizeBoolean(parsed.meta?.allMediaSameRights, true),
      attribution: parsed.meta?.attribution ?? fallbackAttribution,
      isAllRightsReserved: normalizeBoolean(parsed.meta?.isAllRightsReserved, false),
      isPublicDomain: normalizeBoolean(parsed.meta?.isPublicDomain, false),
    },
    // Normalize each media scope through the same helper so legacy booleans stay consistent.
    media: Object.fromEntries(
      projectLicenseMediaTypes.map(mediaType => [
        mediaType,
        normalizeProjectLicenseRights(
          parsed.media?.[mediaType],
          defaults.media[mediaType],
        ),
      ]),
    ) as ProjectLicense['media'],
  }
}

export { getCombinedLicenseLabel }
