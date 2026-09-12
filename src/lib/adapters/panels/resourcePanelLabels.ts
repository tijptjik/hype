// I18N
import { getI18n } from '$lib/i18n'
// TYPES
import type { UserPreferences } from '$lib/db/zod/schema/user.types'

/**
 * Resolves the compact label shared by hierarchy breadcrumbs and selected tags.
 * @param resource - Resource or directly joined ancestor with localized labels.
 * @param preferences - User locale and translation preferences.
 * @param fallback - Identity label to use when no localized name is available.
 * @returns Short name, full name, or the supplied identity fallback.
 * @remarks Preserves authored scope names such as "All". A partial query page
 * cannot establish that a project or layer is its parent's only child.
 */
export function getResourcePanelShortName(
  resource: Parameters<typeof getI18n>[0] | null,
  preferences: Partial<UserPreferences>,
  fallback = '',
): string {
  return (
    getI18n(resource ?? undefined, 'nameShort', preferences, '').trim() ||
    getI18n(resource ?? undefined, 'name', preferences, '').trim() ||
    fallback
  )
}
