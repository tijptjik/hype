// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  type FeatureAddress,
} from './featureAddress'
import { setAddressBlock, setAddressExpression } from './addressExpressions'

export type MapMissingParts = {
  block?: { type: string; ref: string; label: string }
  number?: string
}

/** Find unambiguous missing parts in containing-building evidence.
 * @param address Current draft. @param labels Contained building labels. @param number Map number.
 * @returns Suggestions only; existing fields and explicit clears are never replaced.
 */
export function missingMapParts(
  address: FeatureAddress,
  labels: string[],
  number: string | null,
): MapMissingParts {
  const fields = Object.keys(ADDRESS_LOCALES).map(locale =>
    getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES),
  )
  const explicit = (keys: string[]): boolean =>
    Object.values(address.overrides).some(values =>
      keys.some(key => Object.hasOwn(values, key)),
    )
  const result: MapMissingParts = {}
  if (
    number &&
    !fields.some(
      value =>
        value.buildingNumberExpression ||
        value.buildingNumberFrom ||
        value.buildingNumberTo,
    ) &&
    !explicit(['buildingNumberExpression', 'buildingNumberFrom', 'buildingNumberTo'])
  )
    result.number = number
  if (
    !fields.some(value => value.blockExpression || value.blockRef || value.blockType) &&
    !explicit(['blockExpression', 'blockRef', 'blockType'])
  ) {
    const blocks = new Map<string, NonNullable<MapMissingParts['block']>>()
    for (const label of labels) {
      const match =
        /(?:^|\s)(Block|Tower|Building|House|Villa)\s+([A-Z]|[IVX]{1,6}|\d+[A-Z]?)$/i.exec(
          label.trim(),
        )
      if (!match) continue
      const type = match[1].toLowerCase(),
        ref = match[2].toUpperCase()
      blocks.set(`${type}:${ref}`, {
        type,
        ref,
        label: `${type[0].toUpperCase()}${type.slice(1)} ${ref}`,
      })
    }
    if (blocks.size === 1) result.block = [...blocks.values()][0]
  }
  return result
}

/** Apply only still-missing suggested parts at explicit user acceptance.
 * @param address Latest draft. @param suggestion Map evidence. @returns Updated draft with original source intact.
 */
export function applyMapMissingParts(
  address: FeatureAddress,
  suggestion: MapMissingParts,
): FeatureAddress {
  const missing = missingMapParts(
    address,
    suggestion.block ? [suggestion.block.label] : [],
    suggestion.number ?? null,
  )
  if (missing.block)
    address = setAddressBlock(
      address,
      'en',
      missing.block.type,
      missing.block.ref,
      true,
    )
  if (missing.number)
    address = setAddressExpression(
      address,
      'en',
      'buildingNumberExpression',
      missing.number,
    )
  return address
}
