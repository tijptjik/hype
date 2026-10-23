// ADDRESS
import { addressComponentValue } from './presentation'
import { formatFloor, formatUnit } from './address3d'
import { emptyFeatureAddress } from './featureAddress'
import { addressDivisionName, groupAddressDivisions } from './divisions'
// TYPES
import type { FeatureAddress } from './featureAddress'
import type { AddressDivision } from './divisions'
import type { LocaleKey } from '#lib/types.js'
import type { LocationPosition } from '#lib/locations/model.js'

export const ADDRESS_BLOCKS = [
  'unit',
  'building',
  'premises',
  'street',
  'administrative',
  'locality',
  'landform',
] as const
export type AddressBlock = (typeof ADDRESS_BLOCKS)[number]

/** Adapt retained Location evidence to the ordinary Feature address display.
 * @param position Retained position, including structured source content. @returns Display-only address.
 */
export function positionAddress(
  position: LocationPosition | null | undefined,
): FeatureAddress {
  return position
    ? {
        ...emptyFeatureAddress(),
        source: position.address,
        coordinates: position.geometry.coordinates,
        matchStatus: position.address.status,
      }
    : emptyFeatureAddress()
}

/** Group components without dropping cleared fields or merging unrelated address levels.
 * @param address Source content and Feature corrections. @param locale Display language.
 * @param divisions Resolved geographic memberships. @returns Seven ordered display blocks.
 */
export function addressBlocks(
  address: FeatureAddress,
  locale: LocaleKey,
  divisions: AddressDivision[] = [],
): Record<AddressBlock, string> {
  const value = (field: Parameters<typeof addressComponentValue>[2]): string => {
    const details = address.unitDetails
    if (field === 'floorExpression' && details && Object.hasOwn(details, 'floorRef'))
      return formatFloor(details, locale)
    if (field === 'unitExpression' && details && Object.hasOwn(details, 'unitRef'))
      return formatUnit(details, locale)
    return addressComponentValue(address, locale, field)
  }
  const join = (values: string[]): string =>
    [...new Set(values.filter(Boolean))].join(locale === 'en' ? ', ' : ' ')
  const groups = groupAddressDivisions(divisions)
  const geographic = (key: 'administrative' | 'locality' | 'landform'): string =>
    groups
      .find(group => group.key === key)
      ?.paths.map(path =>
        path.map(item => addressDivisionName(item, locale)).join(' › '),
      )
      .join(' / ') ?? ''
  return {
    unit: join(
      locale === 'en'
        ? [value('unitPortion'), value('unitExpression'), value('floorExpression')]
        : [value('floorExpression'), value('unitExpression'), value('unitPortion')],
    ),
    building: value('buildingName'),
    premises: join([
      value('blockExpression'),
      value('phaseExpression'),
      value('premisesName'),
    ]),
    street:
      locale === 'en'
        ? [value('buildingNumberExpression'), value('streetName')]
            .filter(Boolean)
            .join(' ')
        : `${value('streetName')}${value('buildingNumberExpression') ? value('buildingNumberExpression') + (locale === 'zhHans' ? '号' : '號') : ''}`,
    administrative: geographic('administrative'),
    locality: geographic('locality'),
    landform: geographic('landform'),
  }
}
