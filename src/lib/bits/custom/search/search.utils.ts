import type { SearchResultMap } from './search.types'

export function isSearchResultDisabled<T>(
  item: T,
  resultMap: SearchResultMap<T>,
): boolean {
  return resultMap.disabled?.(item) ?? false
}

export function getFirstEnabledResultButton(
  rootEl: ParentNode | null,
): HTMLButtonElement | null {
  if (!rootEl) return null
  return rootEl.querySelector<HTMLButtonElement>(
    '[data-search-result-item="true"]:not([disabled])',
  )
}
