// CONTENT LOCALES
import { ContentLocaleSettingsFormSchema } from '#lib/content-locales/settings.js'
// TYPES
import type { ContentLocaleSettingsPatch } from '#lib/content-locales/settings.js'

/**
 * Read the remote form's object/JSON transport without materializing inherited defaults.
 * @param value Current remote field value.
 * @returns Editable settings patch, empty until an explicit choice has been made.
 * @remarks Invalid input remains in the form for server validation; rendering never writes.
 */
export function readContentLocaleForm(value: unknown): ContentLocaleSettingsPatch {
  const parsed = ContentLocaleSettingsFormSchema.safeParse(value)
  return parsed.success ? (parsed.data ?? {}) : {}
}

/**
 * Collect nested locale validation errors beside their Advanced editor.
 * @param issues Visible remote form issues.
 * @returns Deduplicated settings error messages.
 */
export function contentLocaleFormIssues(issues: readonly unknown[]): string[] {
  return [
    ...new Set(
      issues.flatMap(issue => {
        if (
          !issue ||
          typeof issue !== 'object' ||
          !('path' in issue) ||
          !('message' in issue)
        )
          return []
        return Array.isArray(issue.path) &&
          issue.path[0] === 'data' &&
          issue.path[1] === 'settings' &&
          typeof issue.message === 'string'
          ? [issue.message]
          : []
      }),
    ),
  ]
}
