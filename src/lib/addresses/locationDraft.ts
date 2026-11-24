// SHARED ADDRESS CONTRACT
import { parseAddressContent } from '#lib/addresses/parseAddress.js'
import { formatFloor, formatUnit } from './address3d'
import { parseStreetNumber } from './streetNumber.js'
import {
  LocalAddressI18nSchema,
  LocalLocationAddressSchema,
} from './localLocationAddress'
import type { LocalLocationAddress } from './localLocationAddress'
// FEATURE ADDRESS
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
} from './featureAddress'
import {
  SUBJECTIVE_DIVISIONS,
  authoredDivisionOverrides,
  markerDerivedAddressContent,
} from './divisions'
import type { FeatureAddress } from './featureAddress'

/** Copy geocoded content into a locally authored proposal without claiming canonical IDs.
 * @param original Current Feature address, including unit details and original text.
 * @param geocoded Optional explicitly selected geocoder result.
 * @returns Editable SaanSeoi-compatible content; original unit evidence is preserved.
 */
export function prepareLocalLocationAddress(
  original: FeatureAddress,
  geocoded?: FeatureAddress,
): LocalLocationAddress {
  const labels = Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
      tag,
      getAddressDisplay(original, locale as keyof typeof ADDRESS_LOCALES),
    ]),
  )
  const content = original.source.authored
    ? structuredClone(original.source.authored)
    : parseAddressContent(labels).content
  if (!geocoded) return content
  const record = geocoded.source.rawSource.data
  const attributes =
    record && typeof record === 'object' && 'attributes' in record
      ? record.attributes
      : undefined
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    const candidate = Object.fromEntries(
      Object.entries(attributes).filter(
        ([key]) =>
          key in LocalLocationAddressSchema.shape &&
          !['i18n', 'unit', 'unitI18n'].includes(key),
      ),
    )
    const validated = LocalLocationAddressSchema.safeParse({ ...content, ...candidate })
    if (validated.success) Object.assign(content, validated.data)
  }
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const source = getAddressLocale(geocoded, locale as keyof typeof ADDRESS_LOCALES)
    const row = Object.fromEntries(
      Object.keys(LocalAddressI18nSchema.shape)
        .filter(key => key in source)
        .map(key => [key, source[key as keyof typeof source]]),
    )
    const parsed = LocalAddressI18nSchema.safeParse(row)
    if (parsed.success) content.i18n[tag] = parsed.data
  }
  return content
}

/** Wrap authored content for the shared Feature and Location component editor.
 * @param content Local address, independent of publication identity. @returns An editable envelope.
 */
export function localAddressDraft(content: LocalLocationAddress): FeatureAddress {
  const draft = emptyFeatureAddress()
  draft.source.authored = structuredClone(content)
  draft.divisionOverrides = authoredDivisionOverrides(content)
  return draft
}

/** Apply reviewed components while keeping explicit display labels and division selections.
 * @param previous Editor snapshot that supplied the parse input.
 * @param content Reviewed authored address, including existing component edits.
 * @returns An editable draft with the same custom display labels.
 */
export function applyLocalAddressParse(
  previous: FeatureAddress,
  content: LocalLocationAddress,
): FeatureAddress {
  const next = localAddressDraft(content)
  next.divisionOverrides = previous.divisionOverrides
  for (const [tag, label] of Object.entries(localAddressDisplayOverrides(previous)))
    next.overrides[tag] = { formattedAddress: label }
  return next
}

/** Materialize combined-expression edits into the shared authored content contract.
 * @param draft Editor envelope. @returns Structured local content without invented source IDs.
 * @remarks Source evidence is never modified. Parsed number/block/phase fields and generated
 * floor/unit translations are persisted together; changing structure invalidates stale display text.
 */
export function localAddressContent(draft: FeatureAddress): LocalLocationAddress {
  const content = structuredClone(
    draft.association?.content ??
      draft.source.authored ??
      prepareLocalLocationAddress(draft, draft),
  )
  for (const [tag, corrections] of Object.entries(draft.overrides)) {
    const changes = Object.fromEntries(
      Object.entries(corrections).filter(
        ([key]) => key in LocalAddressI18nSchema.shape,
      ),
    )
    if (!Object.keys(changes).length) continue
    if (typeof changes.buildingNumberExpression === 'string') {
      const parsed = parseStreetNumber(changes.buildingNumberExpression)
      if (parsed.valid)
        Object.assign(changes, {
          buildingNumberExpression: parsed.number.expression || null,
          buildingNumberFrom: parsed.number.from,
          buildingNumberTo: parsed.number.to,
          buildingNumberConnector: parsed.number.connector,
        })
    }
    const hasStructure = Object.keys(changes).some(key => key !== 'formattedAddress')
    // Preserve unparsed display text until there is enough structure to rebuild it safely.
    const canRebuild =
      Boolean(changes.streetName) ||
      [
        'buildingName',
        'premisesName',
        'streetName',
        'blockExpression',
        'blockRef',
        'phaseExpression',
        'phaseRef',
      ].some(key =>
        Boolean(content.i18n[tag]?.[key as keyof typeof LocalAddressI18nSchema.shape]),
      )
    content.i18n[tag] = LocalAddressI18nSchema.parse({
      ...content.i18n[tag],
      formattedAddress:
        hasStructure && canRebuild ? '' : (content.i18n[tag]?.formattedAddress ?? ''),
      ...changes,
    })
  }
  if (draft.unitDetails) {
    content.unit = {
      unitRef: Object.hasOwn(draft.unitDetails, 'unitRef')
        ? (draft.unitDetails.unitRef ?? '')
        : (content.unit?.unitRef ?? ''),
      unitType: Object.hasOwn(draft.unitDetails, 'unitType')
        ? (draft.unitDetails.unitType ?? 'U')
        : (content.unit?.unitType ?? 'U'),
      floorRef: Object.hasOwn(draft.unitDetails, 'floorRef')
        ? (draft.unitDetails.floorRef ?? '')
        : (content.unit?.floorRef ?? ''),
      floorType: Object.hasOwn(draft.unitDetails, 'floorType')
        ? (draft.unitDetails.floorType ?? 'F')
        : (content.unit?.floorType ?? 'F'),
      unitPortion: Object.hasOwn(draft.unitDetails, 'unitPortion')
        ? (draft.unitDetails.unitPortion ?? null)
        : (content.unit?.unitPortion ?? null),
    }
    content.unitI18n = {}
    for (const [tag, corrections] of Object.entries(draft.overrides)) {
      if (
        typeof corrections.floorExpression === 'string' ||
        typeof corrections.unitExpression === 'string'
      ) {
        const locale = Object.entries(ADDRESS_LOCALES).find(
          ([, value]) => value === tag,
        )?.[0] as keyof typeof ADDRESS_LOCALES | undefined
        if (!locale) continue
        const fields = getAddressLocale(draft, locale)
        content.unitI18n[tag] = {
          floorExpression:
            content.unit.floorType === 'X'
              ? String(fields.floorExpression ?? content.unit.floorRef ?? '')
              : formatFloor(content.unit, locale),
          // Persist a composed expression; the editor input intentionally contains only the reference.
          unitExpression:
            content.unit.unitType === 'X'
              ? String(fields.unitExpression ?? content.unit.unitRef ?? '')
              : formatUnit(content.unit, locale),
        }
      }
    }
  }
  // Geography selections live in divisionOverrides, not a duplicate authored ID set.
  for (const field of Object.keys(SUBJECTIVE_DIVISIONS))
    delete content[field as keyof typeof content]
  // Administrative and landform IDs are derived from the marker, never authored corrections.
  return markerDerivedAddressContent(LocalLocationAddressSchema.parse(content))
}

/** Preserve explicit complete labels separately from structured address evidence.
 * @param draft Editable address and retained complete labels.
 * @returns Effective label overrides; component edits clear obsolete complete labels.
 */
export function localAddressDisplayOverrides(
  draft: FeatureAddress,
): Record<string, string> {
  const labels = { ...draft.source.displayOverrides }
  for (const [tag, corrections] of Object.entries(draft.overrides)) {
    if (Object.hasOwn(corrections, 'formattedAddress'))
      labels[tag] = String(corrections.formattedAddress ?? '')
    else if (Object.keys(corrections).length) delete labels[tag]
  }
  return labels
}

/** Capture the exact display inputs for review while retaining structured fields separately.
 * @param draft Current editor snapshot with any complete display overrides.
 * @param locationKind Entity kind used by the display fields.
 * @returns Existing authored content and source labels, including explicit empty labels.
 */
export function localAddressParseInput(
  draft: FeatureAddress,
  locationKind?: string,
): { content: LocalLocationAddress; source: Record<string, string> } {
  const content = localAddressContent(draft)
  const source = localAddressDisplayOverrides(draft)
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const label = getAddressDisplay(
      draft,
      locale as keyof typeof ADDRESS_LOCALES,
      [],
      locationKind,
    )
    if (label || content.i18n[tag])
      source[tag] ??= label || content.i18n[tag]?.formattedAddress || ''
  }
  for (const [tag, row] of Object.entries(content.i18n))
    source[tag] ??= row.formattedAddress

  return { content, source }
}
