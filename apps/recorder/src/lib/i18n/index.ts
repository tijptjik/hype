// MESSAGES
import { en } from './en'
// PREFERENCES
import { preferences } from '../preferences.svelte'
export type MessageKey = keyof typeof en
const catalogues = { en }

/** Resolve an interface message with named interpolation.
 * @param key Stable catalogue key. @param values Named content, never executable markup.
 * @returns Localized plain text. @remarks Only English is selectable until another complete catalogue ships.
 */
export function t(
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  return catalogues[preferences.language][key].replace(
    /\{(\w+)\}/g,
    (token, name: string) => String(values[name] ?? token),
  )
}

/** Translate known backend/codec failures and avoid displaying untranslated server prose.
 * @param cause Error or server message. @param fallback Context-specific message key.
 * @returns Localized user-facing failure, preserving field names as data.
 */
export function errorMessage(cause: unknown, fallback: MessageKey): string {
  const raw =
    typeof cause === 'string'
      ? cause
      : ((cause as { body?: { message?: string }; message?: string } | null)?.body
          ?.message ?? (cause as Error | null)?.message)
  const message = typeof raw === 'string' ? raw : undefined
  const key = (Object.keys(en) as MessageKey[]).find(key => en[key] === message)
  if (key) return t(key)
  for (const [prefix, key] of [
    ['Invalid value for ', 'invalid_field'],
    ['Value outside limits for ', 'outside_field_limits'],
  ] as const) {
    if (message?.startsWith(prefix))
      return t(key, { field: message.slice(prefix.length) })
  }
  return t(fallback)
}
