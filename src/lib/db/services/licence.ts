// TYPES
import type {
  ProjectLicense,
  ProjectLicenseHistoryEntry,
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
//    - appendProjectLicenseHistory
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

const publicDomainAliasLabels = new Set(['unlicense', 'the unlicense', 'wtfpl', 'wtf'])
const knownGeneratedProjectLicenseLabels = new Set([
  'CC0',
  'PDDL',
  'CC0 / PDDL',
  'Copyright',
  'CC BY',
  'CC BY-SA',
  'CC BY-NC',
  'CC BY-NC-SA',
  'CC BY-ND',
  'CC BY-NC-ND',
  'ODC-By',
  'ODC-ODbL',
  'CC BY / ODC-By',
  'CC BY-SA / ODC-ODbL',
])

/**
 * Coerces loose persisted boolean-like values into `boolean | null`.
 *
 * @param value - Raw persisted value.
 * @param fallback - Fallback used when coercion fails.
 * @returns Normalized booleanish value.
 */
function toBooleanOrNull(value: unknown, fallback: boolean | null): boolean | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return fallback
}

/**
 * Coerces loose persisted boolean-like values into a strict boolean.
 *
 * @param value - Raw persisted value.
 * @param fallback - Fallback used when coercion fails.
 * @returns Strict boolean value.
 */
function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toBooleanOrNull(value, fallback)
  return normalized ?? fallback
}

/**
 * Canonicalizes a license label for case-insensitive comparisons.
 *
 * @param label - License label to normalize.
 * @returns Lowercased trimmed label.
 */
function normalizeLicenseLabelValue(label: string | null | undefined): string {
  return label?.trim().toLowerCase() ?? ''
}

/**
 * Detects custom labels that should be treated as public-domain releases.
 *
 * @param label - Persisted or user-provided license label.
 * @returns `true` when the label is one of the recognized PD aliases.
 */
export function isRecognizedPublicDomainLicenseLabel(
  label: string | null | undefined,
): boolean {
  return publicDomainAliasLabels.has(normalizeLicenseLabelValue(label))
}

/**
 * Detects whether a label is part of the built-in generated-license vocabulary.
 *
 * @param label - Persisted or user-provided license label.
 * @returns `true` when the label is one of the known generated labels.
 */
export function isKnownGeneratedProjectLicenseLabel(
  label: string | null | undefined,
): boolean {
  const normalized = label?.trim() ?? ''
  return knownGeneratedProjectLicenseLabels.has(normalized)
}

/**
 * Infers rights flags from a recognized persisted or user-entered license label.
 *
 * @param mediaType - Media scope whose label is being interpreted.
 * @param label - Persisted or user-provided license label.
 * @returns Partial rights when the label is recognized, otherwise `null`.
 */
export function inferProjectLicenseRightsFromLabel(
  mediaType: ProjectLicenseMediaType,
  label: string | null | undefined,
): Partial<ProjectLicenseRights> | null {
  const normalized = label?.trim() ?? ''

  if (!normalized) return null

  if (normalized === 'CC0' || normalized === 'PDDL' || normalized === 'CC0 / PDDL') {
    return {
      license: normalized,
      isPublicDomain: true,
      isAllRightsReserved: false,
      BY: false,
      SA: false,
      NC: false,
      ND: false,
    }
  }

  if (normalized === 'Copyright') {
    return {
      license: normalized,
      isPublicDomain: false,
      isAllRightsReserved: true,
      BY: null,
      SA: true,
      NC: true,
      ND: true,
    }
  }

  const sharedBy = { isPublicDomain: false, isAllRightsReserved: false, BY: true }

  switch (normalized) {
    case 'CC BY':
    case 'ODC-By':
    case 'CC BY / ODC-By':
      return { license: normalized, ...sharedBy, SA: false, NC: false, ND: false }
    case 'CC BY-SA':
    case 'ODC-ODbL':
    case 'CC BY-SA / ODC-ODbL':
      return { license: normalized, ...sharedBy, SA: true, NC: false, ND: false }
    case 'CC BY-NC':
      return { license: normalized, ...sharedBy, SA: false, NC: true, ND: false }
    case 'CC BY-NC-SA':
      return { license: normalized, ...sharedBy, SA: true, NC: true, ND: false }
    case 'CC BY-ND':
      return { license: normalized, ...sharedBy, SA: false, NC: false, ND: true }
    case 'CC BY-NC-ND':
      return { license: normalized, ...sharedBy, SA: false, NC: true, ND: true }
    default:
      return mediaType === 'all' && isKnownGeneratedProjectLicenseLabel(normalized)
        ? { license: normalized, ...sharedBy, SA: false, NC: false, ND: false }
        : null
  }
}

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
    isPublicDomain: false,
    isAllRightsReserved: false,
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
      history: [],
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
 * Normalizes stored license history into the canonical audit-trail shape.
 *
 * @param history - Raw persisted history payload.
 * @returns Canonical history entries.
 */
function normalizeProjectLicenseHistory(
  history: unknown,
): ProjectLicenseHistoryEntry[] {
  if (!Array.isArray(history)) return []

  return history.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []

    const publishedAt =
      typeof (entry as { publishedAt?: unknown }).publishedAt === 'string'
        ? (entry as { publishedAt: string }).publishedAt
        : ''
    const attribution =
      typeof (entry as { attribution?: unknown }).attribution === 'string'
        ? (entry as { attribution: string }).attribution
        : typeof (entry as { licenses?: { attribution?: unknown } }).licenses
              ?.attribution === 'string'
          ? ((entry as { licenses: { attribution: string } }).licenses.attribution ??
            '')
          : ''
    const rawLicenses =
      (entry as { licenses?: Partial<Record<ProjectLicenseMediaType, unknown>> })
        .licenses ?? {}
    const hasAllLicense = typeof rawLicenses.all === 'string'
    const hasLeafLicenses =
      typeof rawLicenses.image === 'string' ||
      typeof rawLicenses.text === 'string' ||
      typeof rawLicenses.data === 'string'

    if (!publishedAt) return []

    return [
      {
        publishedAt,
        attribution,
        licenses: hasLeafLicenses
          ? {
              image:
                typeof rawLicenses.image === 'string'
                  ? rawLicenses.image
                  : defaultLicenseLabelByMediaType.image,
              text:
                typeof rawLicenses.text === 'string'
                  ? rawLicenses.text
                  : defaultLicenseLabelByMediaType.text,
              data:
                typeof rawLicenses.data === 'string'
                  ? rawLicenses.data
                  : defaultLicenseLabelByMediaType.data,
            }
          : {
              all: hasAllLicense
                ? (rawLicenses.all as string)
                : defaultLicenseLabelByMediaType.all,
            },
      },
    ]
  })
}

/**
 * Converts a license payload into one audit-trail snapshot entry.
 *
 * @param license - License payload to snapshot.
 * @param publishedAt - Publication timestamp for the snapshot.
 * @returns Audit-trail entry derived from the license payload.
 */
function toProjectLicenseHistoryEntry(
  license: ProjectLicense,
  publishedAt: string,
): ProjectLicenseHistoryEntry {
  return {
    publishedAt,
    attribution: license.meta.attribution,
    licenses: license.meta.allMediaSameRights
      ? {
          all: license.media.all.license,
        }
      : {
          image: license.media.image.license,
          text: license.media.text.license,
          data: license.media.data.license,
        },
  }
}

/**
 * Reduces a history entry to its comparison signature.
 *
 * @param entry - History entry to compare.
 * @returns Stable JSON signature for duplicate detection.
 */
function toComparableLicenseHistoryEntry(
  entry: ProjectLicenseHistoryEntry | null | undefined,
): string {
  return JSON.stringify({
    attribution: entry?.attribution ?? '',
    licenses: entry?.licenses ?? {},
  })
}

export function appendProjectLicenseHistory(
  license: ProjectLicense,
  publishedAt: string,
): ProjectLicense {
  const nextEntry = toProjectLicenseHistoryEntry(license, publishedAt)
  const history = normalizeProjectLicenseHistory(license.meta.history)
  const previousEntry = history.at(-1)

  if (
    previousEntry &&
    toComparableLicenseHistoryEntry(previousEntry) ===
      toComparableLicenseHistoryEntry(nextEntry)
  ) {
    return {
      ...license,
      meta: {
        ...license.meta,
        history,
      },
    }
  }

  return {
    ...license,
    meta: {
      ...license.meta,
      history: [...history, nextEntry],
    },
  }
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

  // ODC has no NC variant, so NC-selected data falls back to the corresponding CC label.
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
  mediaType: ProjectLicenseMediaType,
  rights: Partial<ProjectLicenseRights> | null | undefined,
  defaults: ProjectLicenseRights,
): ProjectLicenseRights {
  const license = rights?.license ?? defaults.license
  const inferredRights = inferProjectLicenseRightsFromLabel(mediaType, license)
  const normalizedFlags = projectLicenseRightsKeys.reduce(
    (accumulator, key) => {
      accumulator[key] = toBooleanOrNull(rights?.[key], defaults[key])
      return accumulator
    },
    {} as Pick<ProjectLicenseRights, (typeof projectLicenseRightsKeys)[number]>,
  )

  const inferredIsPublicDomain =
    license === 'CC0' || license === 'PDDL' || license === 'CC0 / PDDL'
  const inferredIsAllRightsReserved = license === 'Copyright'
  const isPublicDomain =
    normalizeBoolean(rights?.isPublicDomain, defaults.isPublicDomain) ||
    inferredIsPublicDomain
  const isAllRightsReserved =
    normalizeBoolean(rights?.isAllRightsReserved, defaults.isAllRightsReserved) ||
    (!isPublicDomain && inferredIsAllRightsReserved)

  const canonicalFlags = isPublicDomain
    ? { BY: false, SA: false, NC: false, ND: false }
    : isAllRightsReserved
      ? { BY: null, SA: true, NC: true, ND: true }
      : normalizedFlags

  // Prefer explicit label-derived rights when the license string matches a known preset.
  return {
    license,
    isPublicDomain: inferredRights?.isPublicDomain ?? isPublicDomain,
    isAllRightsReserved: inferredRights?.isAllRightsReserved ?? isAllRightsReserved,
    ...(inferredRights
      ? {
          BY: inferredRights.BY ?? canonicalFlags.BY,
          SA: inferredRights.SA ?? canonicalFlags.SA,
          NC: inferredRights.NC ?? canonicalFlags.NC,
          ND: inferredRights.ND ?? canonicalFlags.ND,
        }
      : canonicalFlags),
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
      history: normalizeProjectLicenseHistory(parsed.meta?.history),
    },
    // Normalize each media scope through the same helper so legacy booleans stay consistent.
    media: Object.fromEntries(
      projectLicenseMediaTypes.map(mediaType => [
        mediaType,
        normalizeProjectLicenseRights(
          mediaType,
          parsed.media?.[mediaType],
          defaults.media[mediaType],
        ),
      ]),
    ) as ProjectLicense['media'],
  }
}

export { getCombinedLicenseLabel }
