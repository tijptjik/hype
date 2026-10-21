// VALIDATION
import { z } from 'zod'
// ADDRESS
import { getAddressDisplay, getAddressLocale } from '#lib/addresses/featureAddress.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
// DOMAIN
import { locationDistance } from './searchPresentation'

export const DiscoveryRadiusSchema = z.number().int().min(50).max(1000)
export const NearbyPlacesInputSchema = z.strictObject({
  coordinates: z.tuple([
    z.number().finite().min(113.7).max(114.6),
    z.number().finite().min(22.1).max(22.6),
  ]),
  radius: DiscoveryRadiusSchema,
})

/** Normalize bilingual address/name evidence without treating punctuation as identity.
 * @param value Display text. @returns Search tokens including Chinese character pairs.
 */
function tokens(value: string): Set<string> {
  const normalized = value.normalize('NFKC').toLowerCase()
  return new Set([
    ...(normalized.match(/[a-z0-9]+/g) ?? []),
    ...(normalized.match(/[\p{Script=Han}]+/gu) ?? []).flatMap(word =>
      word.length === 1
        ? [word]
        : Array.from(word.slice(1), (_, i) => word.slice(i, i + 2)),
    ),
  ])
}

/** Compare text evidence; missing evidence contributes no bonus or conflict.
 * @param left Original text. @param right Candidate text. @returns Token overlap from zero to one.
 */
export function textAgreement(left: string, right: string): number {
  const a = tokens(left)
  const b = tokens(right)
  if (!a.size || !b.size) return 0
  return [...a].filter(token => b.has(token)).length / Math.max(a.size, b.size)
}

/** Rank discovery previews using distance and meaningful address components.
 * @param origin Current Feature or selected Address.
 * @param candidate Candidate address with its actual geometry.
 * @param coordinates Feature pin, independent of candidate selection.
 * @param radius Search radius in metres.
 * @returns Score and transparent evidence; this never establishes Location identity.
 */
export function scoreDiscovery(
  origin: FeatureAddress,
  candidate: FeatureAddress,
  coordinates: number[],
  radius: number,
): { score: number; distance: number; addressAgreement: number } {
  const distance = locationDistance(coordinates, candidate.coordinates ?? coordinates)
  let addressAgreement = 0
  for (const locale of ['en', 'zhHant', 'zhHans'] as const) {
    const a = getAddressLocale(origin, locale)
    const b = getAddressLocale(candidate, locale)
    const fields = [
      ['buildingName', 0.4],
      ['streetName', 0.25],
      ['buildingNumberExpression', 0.15],
      ['unitExpression', 0.2],
    ] as const
    const structured = fields.reduce(
      (score, [field, weight]) =>
        score +
        weight *
          textAgreement(
            typeof a[field] === 'string' ? (a[field] as string) : '',
            typeof b[field] === 'string' ? (b[field] as string) : '',
          ),
      0,
    )
    addressAgreement = Math.max(
      addressAgreement,
      structured,
      0.35 *
        textAgreement(
          getAddressDisplay(origin, locale),
          getAddressDisplay(candidate, locale),
        ),
    )
  }
  return {
    distance,
    addressAgreement,
    score: 0.55 / (1 + distance / radius) + 0.45 * addressAgreement,
  }
}
