// I18N
import { getI18n, m } from '#lib/i18n.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

export type ProjectNameSource = {
  useAllInOrgContext?: boolean
  i18n?: Partial<
    Record<LocaleKey, { name?: string | null; nameShort?: string | null }>
  > | null
}

/**
 * Resolves a project's label for a standalone title or an organisation breadcrumb.
 * @param project - Project or compact project ancestor with translated names.
 * @param preferences - Current translation preferences.
 * @param options - Name variant, organisation context and translation fallback policy.
 * @returns Localised All in organisation context when enabled, otherwise the chosen name.
 * @remarks Full titles never use All. Short names fall back to full names and vice versa.
 */
export function getProjectDisplayName(
  project: ProjectNameSource | null | undefined,
  preferences: Partial<UserPreferences>,
  options: {
    variant?: 'full' | 'short'
    inOrganisationContext?: boolean
    useFallbacks?: boolean
  } = {},
): string | null {
  if (!project) return null
  const {
    variant = 'short',
    inOrganisationContext = false,
    useFallbacks = true,
  } = options
  if (variant === 'short' && inOrganisationContext && project.useAllInOrgContext) {
    return m.filters__all()
  }
  const i18nPreferences = useFallbacks
    ? preferences
    : { ...preferences, fallbackLocales: [] }
  const fields = variant === 'full' ? ['name', 'nameShort'] : ['nameShort', 'name']
  for (const field of fields) {
    const name = getI18n(project, field, i18nPreferences, '', !useFallbacks).trim()
    if (name) return name
  }
  return null
}
