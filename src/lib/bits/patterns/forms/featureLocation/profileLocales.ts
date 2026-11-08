// CONTENT LOCALES
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { hasProfileText, type ProfileValues } from './profileTranslation'

export type ProfileLocaleState = {
  selectedLocales: string[]
  visibleLocales: string[]
  expanded: boolean
}

/** Initialize or recover form-local order, preserving content outside shared defaults.
 * @param defaults Effective configured order. @param values Complete content map.
 * @param saved Optional draft toolbar state. @returns Canonical ordered selection and visibility.
 */
export function restoreProfileLocales(
  defaults: readonly string[],
  values: ProfileValues,
  saved?: ProfileLocaleState,
): ProfileLocaleState {
  const selectedLocales = normalizeContentLocales(
    saved?.selectedLocales?.length ? saved.selectedLocales : defaults,
  )
  const stored = normalizeContentLocales(
    Object.entries(values)
      .filter(
        ([, row]) => hasProfileText(row?.title) || hasProfileText(row?.description),
      )
      .map(([tag]) => tag),
  ).sort()
  const extra = stored.filter(tag => !selectedLocales.includes(tag))
  selectedLocales.push(...extra)
  const visibleLocales = saved
    ? normalizeContentLocales([...(saved.visibleLocales ?? []), ...extra]).filter(tag =>
        selectedLocales.includes(tag),
      )
    : [...selectedLocales]
  if (!visibleLocales.length && selectedLocales.length)
    visibleLocales.push(selectedLocales[0])
  return { selectedLocales, visibleLocales, expanded: saved?.expanded ?? false }
}
