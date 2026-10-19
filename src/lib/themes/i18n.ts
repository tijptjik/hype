// I18N
import * as m from '../paraglide/messages.js'
// TYPES
import type { Locale } from '#lib/types.js'
import type { ThemeId } from './themes.types'

/**
 * Resolves a UI palette name in the active or requested language.
 * @param id - Stable theme identifier.
 * @param locale - Optional language override; defaults to the active language.
 * @returns Localized theme name.
 */
export function getThemeName(id: ThemeId, locale?: Locale): string {
  const names = {
    'hype-black': m.theme_name_nullspace,
    'hype-dark': m.theme_name_nebula,
    'hype-light': m.theme_name_oblivion,
    'breadline-light': m.theme_name_milque,
    'breadline-dark': m.theme_name_rye,
  }
  return names[id]({}, locale ? { locale } : undefined)
}
