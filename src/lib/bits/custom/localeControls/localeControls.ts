// I18N
import * as m from '#lib/paraglide/messages.js'
// TYPES
import type {
  LocaleControlLabels,
  LocaleOption,
  LocaleSelection,
} from './localeControls.types.js'

// Resolve labels when read so request-local and changing UI locales remain isolated.
export const defaultLocaleControlLabels: LocaleControlLabels = {
  get multilingual() {
    return m.locale_controls_multilingual()
  },
  get add() {
    return m.locale_controls_add()
  },
  get search() {
    return m.locale_controls_search()
  },
  get noResults() {
    return m.locale_controls_no_results()
  },
  get close() {
    return m.locale_controls_close()
  },
  get selected() {
    return m.locale_controls_selected()
  },
  moveEarlier: name => m.locale_controls_move_earlier({ name }),
  moveLater: name => m.locale_controls_move_later({ name }),
  remove: name => m.locale_controls_remove({ name }),
  get atLeastOne() {
    return m.locale_controls_at_least_one()
  },
  changed: (name, action) =>
    action === 'reveal'
      ? m.locale_controls_revealed({ name })
      : action === 'add'
        ? m.locale_controls_added({ name })
        : action === 'remove'
          ? m.locale_controls_removed({ name })
          : m.locale_controls_visibility_changed({ name }),
  moved: (name, position, total) =>
    m.locale_controls_moved({ name, position: String(position), total: String(total) }),
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
