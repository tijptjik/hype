// TYPES
import type { FeatureCardType } from './cardType.js'

/** Stable persisted codes; add new renderers here and register them in a migration. */
export const CARD_STYLE_CODES = [
  'full',
  'no-description',
  'flexible',
  'breadline',
] as const
export type CardStyleCode = (typeof CARD_STYLE_CODES)[number]

/** Default for new projects and unset presentation choices. */
export const DEFAULT_CARD_STYLE: CardStyleCode = 'flexible'

/** Shared catalogue for admin previews and public card rendering. */
export const CARD_STYLE_CATALOG = [
  { code: 'full', cardType: 'standard', preview: '/cardStyles/full.svg' },
  { code: 'flexible', cardType: null, preview: '/cardStyles/flexible.svg' },
  { code: 'breadline', cardType: 'breadline', preview: '/cardStyles/breadline.svg' },
  {
    code: 'no-description',
    cardType: 'portal-band',
    preview: '/cardStyles/no-description.svg',
  },
] as const satisfies ReadonlyArray<{
  code: CardStyleCode
  cardType: FeatureCardType | null
  preview: string
}>

/**
 * Narrows untrusted or older presentation values to a registered style.
 * @param value Persisted or form-supplied value.
 * @returns Whether the value is a supported card style code.
 */
export function isCardStyleCode(value: unknown): value is CardStyleCode {
  return CARD_STYLE_CODES.some(code => code === value)
}

/**
 * Resolves the effective style with layer-over-project inheritance.
 * @param projectCode Saved project choice; absent values use Flexible.
 * @param layerCode Optional layer override; null/absent values inherit.
 * @returns A supported style code, falling back safely to Flexible.
 */
export function resolveCardStyle(
  projectCode?: unknown,
  layerCode?: unknown,
): CardStyleCode {
  if (isCardStyleCode(layerCode)) return layerCode
  return isCardStyleCode(projectCode) ? projectCode : DEFAULT_CARD_STYLE
}
