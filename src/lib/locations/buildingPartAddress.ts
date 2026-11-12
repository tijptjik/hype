// ADDRESS
import { parseAddressContent } from '@saanseoi/address'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

/** Parse a part's own label without inheriting a descendant's floor or unit.
 * @param address Building placement and relationship evidence. @param names Authored part labels.
 * @returns Address with parsed unit content; labels themselves remain the part's unchanged display names.
 */
export function buildingPartAddress(
  address: FeatureAddress,
  names: Record<string, string>,
): FeatureAddress {
  const parsed = parseAddressContent(names).content
  const content = {
    ...localAddressContent(address),
    unit: parsed.unit,
    unitI18n: parsed.unitI18n,
  }
  return {
    ...address,
    unitDetails: parsed.unit ?? undefined,
    source: { ...address.source, authored: content },
    overrides: Object.fromEntries(
      Object.entries(address.overrides).map(([tag, values]) => [
        tag,
        Object.fromEntries(
          Object.entries(values).filter(
            ([key]) => !['unitExpression', 'floorExpression'].includes(key),
          ),
        ),
      ]),
    ),
    ...(address.association
      ? { association: { ...address.association, content } }
      : {}),
  }
}
