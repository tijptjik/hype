// TYPES
import type {
  LocaleControlLabels,
  LocaleOption,
  LocaleSelection,
} from './localeControls.types.js'

export const defaultLocaleControlLabels: LocaleControlLabels = {
  multilingual: 'Multilingual',
  add: 'Add language',
  search: 'Search languages',
  noResults: 'No languages found',
  close: 'Close language search',
  selected: 'Selected',
  moveEarlier: name => `Move ${name} earlier`,
  moveLater: name => `Move ${name} later`,
  remove: name => `Remove ${name}`,
  atLeastOne: 'Keep at least one language visible.',
  changed: (name, action) =>
    `${name}: ${action === 'reveal' ? 'revealed' : action === 'add' ? 'added' : action === 'remove' ? 'removed' : 'visibility changed'}.`,
  moved: (name, position, total) =>
    `${name} moved to position ${position} of ${total}.`,
}

/**
 * Match catalogue labels, autonyms, canonical tags and legacy aliases.
 * @param options Catalogue records with names already localized by the caller.
 * @param query User-entered search text.
 * @returns Matching records in catalogue order.
 */
export function searchLocaleOptions(
  options: readonly LocaleOption[],
  query: string,
): LocaleOption[] {
  const normalize = (value: string): string =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\s_-]/g, '')
  const needle = normalize(query.trim())
  return options.filter(option =>
    [option.tag, option.name, option.autonym, ...(option.aliases ?? [])].some(value =>
      normalize(value).includes(needle),
    ),
  )
}

/**
 * Resolve displayed rows without changing selected locales or content.
 * @param state The caller's ordered selection and visible subset.
 * @param expanded Whether multilingual fields are expanded.
 * @returns Ordered visible tags; collapsed always uses the first selected tag.
 */
export function displayedLocales(state: LocaleSelection, expanded: boolean): string[] {
  const visible = state.selectedLocales.filter(tag =>
    state.visibleLocales.includes(tag),
  )
  return expanded && visible.length ? visible : state.selectedLocales.slice(0, 1)
}

/** Compact locale prefix for row labels and chips; full names remain accessible.
 * @param tag Canonical or legacy content-locale tag.
 * @returns A short script label or compact language code, retaining region variants.
 */
export function shortLocaleLabel(tag: string): string {
  const normalized = tag.replace('zhHant', 'zh-Hant').replace('zhHans', 'zh-Hans')
  if (/^zh-hant(?:-|$)/i.test(normalized)) return '繁中'
  if (/^zh-hans(?:-|$)/i.test(normalized)) return '简中'
  if (normalized === 'ja') return '日'
  if (normalized === 'ko') return '韓'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}
