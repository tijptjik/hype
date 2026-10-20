// CATALOGUE
import { CARD_STYLE_CATALOG, resolveCardStyle } from './cardStyle.js'

/** Renderers remain independent of the persisted and user-facing style names. */
export const FEATURE_CARD_TYPES = ['standard', 'portal-band', 'breadline'] as const
export type FeatureCardType = (typeof FEATURE_CARD_TYPES)[number]

/**
 * Resolves a display renderer from persisted hierarchy selections.
 * @param options Project style, optional layer override and localized description.
 * @returns The registered renderer, using Flexible for unset choices.
 * @remarks No project-specific experiments override saved settings.
 */
export function resolveFeatureCardType(options: {
  description?: string | null
  project?: { cardStyleCode?: unknown } | null
  layer?: { cardStyleCode?: unknown } | null
}): FeatureCardType {
  const code = resolveCardStyle(
    options.project?.cardStyleCode,
    options.layer?.cardStyleCode,
  )
  // Empty rich-text paragraphs and placeholder dashes count as no description.
  if (code === 'flexible') {
    const text = (options.description ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
      .trim()
    return text && text !== '-' ? 'standard' : 'portal-band'
  }
  return CARD_STYLE_CATALOG.find(style => style.code === code)?.cardType ?? 'standard'
}
