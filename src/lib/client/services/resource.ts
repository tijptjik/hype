import { getLocaleKey } from '$lib/i18n'

// INTERACTIONS
export function focusFirstChildOfResourceIndex(
  event: KeyboardEvent,
  listContainer: HTMLElement | null,
) {
  event.preventDefault()

  // Use setTimeout to ensure virtual list has rendered
  setTimeout(() => {
    // Look specifically for the first row button in the virtual list
    let firstItem = listContainer?.querySelector(
      '.virtual-list-items > div:first-child [role="button"][tabindex="0"]',
    ) as HTMLElement

    if (!firstItem) {
      // Fallback: any focusable row element with tabindex="0"
      firstItem = listContainer?.querySelector(
        '[role="button"][tabindex="0"]',
      ) as HTMLElement
    }

    if (!firstItem) {
      // Another fallback: any element with tabindex="0"
      firstItem = listContainer?.querySelector('[tabindex="0"]') as HTMLElement
    }

    if (firstItem) {
      firstItem.focus()
    } else {
      console.warn('Could not find first item to focus')
    }
  }, 0)
}

/**
 * Builds an optimistic updater for a boolean field on a resource entity payload.
 * Used by resource services to keep a single entity cache entry in sync after fast toggles.
 *
 * @param field Boolean field to override in `data`.
 * @param value Boolean value to assign.
 * @returns A cache updater that patches the entity payload.
 */
export function overrideResourceEntityBoolean<K extends string>(
  field: K,
  value: boolean,
) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

/**
 * Builds an optimistic updater for a boolean field on a specific resource list item.
 * Used by resource services to keep list caches in sync after fast toggle mutations.
 *
 * @param resourceId Id of the list item to patch.
 * @param field Boolean field to override.
 * @param value Boolean value to assign.
 * @returns A cache updater that patches the matching list item.
 */
export function overrideResourceListItemBoolean<K extends string>(
  resourceId: string,
  field: K,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === resourceId ? { ...item, [field]: value } : item,
    ),
  })
}

/**
 * Resolves the best available display name for toast messages from entity data.
 * Used by publish/archive flows so success messages stay readable across resources.
 *
 * @param entity Resource entity wrapper.
 * @param key Preferred display-name field.
 * @returns The best available localized or fallback display label.
 */
export function getNameForToast(
  entity: { data?: Record<string, unknown> | null } | null | undefined,
  key: string = 'shortName',
): string {
  const asTrimmedString = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  const data =
    entity && typeof entity === 'object'
      ? ((entity as { data?: Record<string, unknown> | null }).data ?? undefined)
      : undefined
  if (!data) return ''

  const localeKey = getLocaleKey()
  const i18n =
    data && typeof data === 'object'
      ? ((data as Record<string, unknown>).i18n as
          | Record<string, Record<string, unknown>>
          | undefined)
      : undefined

  const byLocale = asTrimmedString(i18n?.[localeKey]?.[key])
  if (byLocale) return byLocale

  const byRoot = asTrimmedString((data as Record<string, unknown>)[key])
  if (byRoot) return byRoot

  return asTrimmedString((data as Record<string, unknown>).code)
}
