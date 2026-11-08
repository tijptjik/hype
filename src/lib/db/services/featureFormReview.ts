// DOMAIN
import { equalRevisionValue } from '#lib/revisions/merge.js'
// SERVICES
import { parseFeatureRevisionSource } from './featureRevisionContent'
import { validateFeaturePhoneProperties } from './feature-property-validation'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

/**
 * Restricts general form publication to currently authorized authored fields.
 * @param previous Current accepted comparison.
 * @param result Proposed or merged content.
 * @param policy Current source definitions, persisted scope and internal-field capabilities.
 * @returns Non-sensitive validation errors; historical context is never an access grant.
 */
export function validateFeatureFormResult(
  previous: FeatureRevisionContent,
  result: FeatureRevisionContent,
  policy: {
    snapshot: RevisionValue
    allowedInternalIds: ReadonlySet<string>
    allowDescriptions: boolean
    resourceHubId?: string | null
    coreHubId?: string | null
  },
): string[] {
  if (!equalRevisionValue(previous.gallery, result.gallery))
    return ['Gallery changes require gallery review']
  if (!equalRevisionValue(previous.placement.location, result.placement.location))
    return ['Location changes require separate Location review']
  const source = parseFeatureRevisionSource(policy.snapshot)
  const definitions = new Map(source.fieldDefinitions.map(row => [String(row.id), row]))
  for (const id of new Set([
    ...Object.keys(previous.properties),
    ...Object.keys(result.properties),
  ])) {
    const before = previous.properties[id],
      after = result.properties[id]
    if (equalRevisionValue(before ?? null, after ?? null)) continue
    const definition = definitions.get(id)
    if (
      (definition?.audience === 'internal' ||
        before?.selection.definition.audience === 'internal' ||
        after?.selection.definition.audience === 'internal') &&
      !policy.allowedInternalIds.has(id)
    )
      return ['Proposal changes a field outside current permissions']
    if (
      after &&
      (!definition ||
        (definition.projectId && definition.projectId !== source.record.projectId) ||
        (definition.organisationId &&
          definition.organisationId !== source.record.organisationId) ||
        (definition.hubId &&
          definition.hubId !== policy.resourceHubId &&
          definition.hubId !== policy.coreHubId))
    )
      return ['A proposed property is no longer available in this Feature scope']
    if (
      previous.placement.location &&
      (definition?.component === 'PhoneField' ||
        before?.selection.definition.component === 'PhoneField')
    )
      return ['Shared phone changes require separate Location review']
    if (after && definition) {
      for (const key of [
        'key',
        'type',
        'component',
        'dataType',
        'dateResolution',
        'timeMaxHour',
        'cardinality',
        'presentation',
        'min',
        'max',
        'audience',
        'isTranslatable',
      ] as const) {
        if (!equalRevisionValue(after.selection.definition[key], definition[key]))
          return ['Property definition changed; refresh the proposal']
      }
      // A conflict resolution cannot forge the historical interpretation of a selected value.
      if (!equalRevisionValue(before?.selection ?? null, after.selection)) {
        const labels = Object.fromEntries(
          source.fieldTranslations
            .filter(row => row.propertyId === id)
            .map(row => [
              String(row.locale),
              { value: row.label, generated: row.labelGen },
            ]),
        )
        const option = source.fieldOptions.find(
          row => row.id === after.selection.propertyValueId && row.propertyId === id,
        )
        const selectedOption = option
          ? {
              id: option.id,
              value: option.value,
              translations: Object.fromEntries(
                source.fieldOptionTranslations
                  .filter(row => row.propertyValueId === option.id)
                  .map(row => [
                    String(row.locale),
                    { value: row.value, generated: row.valueGen },
                  ]),
              ),
            }
          : null
        if (
          !equalRevisionValue(after.selection.definition.labels, labels) ||
          !equalRevisionValue(after.selection.definition.selectedOption, selectedOption)
        )
          return ['Property interpretation changed; refresh the proposal']
      }
    }
  }
  if (
    previous.placement.location &&
    (!equalRevisionValue(previous.placement, result.placement) ||
      previous.profile.isIntangible !== result.profile.isIntangible ||
      !equalRevisionValue(previous.detachedBrands, result.detachedBrands))
  )
    return ['Linked placement changes require separate Location review']
  for (const locale of new Set([
    ...Object.keys(previous.translations),
    ...Object.keys(result.translations),
  ])) {
    const before = previous.translations[locale],
      after = result.translations[locale]
    if (!after) return ['Removing a language requires an explicit locale operation']
    if (
      !policy.allowDescriptions &&
      !equalRevisionValue(before?.description ?? null, after.description)
    )
      return ['Descriptions are disabled for this Feature']
    if (
      previous.placement.location &&
      (!equalRevisionValue(before?.address ?? null, after.address) ||
        (previous.placement.location.acceptancePolicy?.nameMode !== 'independent' &&
          !equalRevisionValue(before?.title ?? null, after.title)))
    )
      return ['Inherited names and addresses require separate Location review']
  }
  return []
}

/**
 * Revalidates changed property values using the existing live form validation rules.
 * @param db Request database.
 * @param previous Accepted content.
 * @param result Fully merged content, including explicit conflict resolutions.
 * @param allowedInternalIds Current access grants resolved by the remote API.
 * @param layerId Persisted Feature layer.
 * @returns Completion or a validation error before any publication statements execute.
 */
export async function validateFeatureFormPropertyValues(
  db: Database,
  previous: FeatureRevisionContent,
  result: FeatureRevisionContent,
  allowedInternalIds: ReadonlySet<string>,
  layerId: string,
): Promise<void> {
  const changed = Object.entries(result.properties).filter(
    ([id, row]) => !equalRevisionValue(previous.properties[id] ?? null, row),
  )
  const values = changed.map(([propertyId, row]) => ({
    propertyId,
    propertyValueId: row.selection.propertyValueId,
    value: row.selection.value,
    valueJson: row.selection.valueJson,
    i18n: Object.fromEntries(
      Object.entries(row.translations).map(([locale, value]) => [
        locale,
        { value: value.value, valueGen: value.generated },
      ]),
    ),
  }))
  const normalized = await validateFeaturePhoneProperties(
    db,
    values,
    allowedInternalIds,
    layerId,
  )
  if (
    normalized.length !== values.length ||
    normalized.some(
      (row, index) =>
        row.propertyValueId !== values[index].propertyValueId ||
        row.value !== values[index].value ||
        row.valueJson !== values[index].valueJson,
    )
  )
    throw new Error(
      'Proposed property values require normalization; save the form again',
    )
}
