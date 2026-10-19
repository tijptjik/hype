// SVELTEKIT
import { error } from '@sveltejs/kit'
// ZOD
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
import {
  readThemePreferences,
  writeThemePreferences,
} from '#lib/api/services/themePreferences.js'
// THEME
import { ThemePreferencesSchema } from '#lib/themes/preferences.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getThemePreferences
// COMMAND
// - saveThemePreferences
//
// ═══════════════════════

/**
 * Reads appearance settings for the current session account.
 * @param params - Expected account id, checked against the current session.
 * @returns Saved theme settings, or null before an account has saved any.
 */
export const getThemePreferences = guardedQuery(
  z.object({ accountId: z.string().min(1) }),
  async ({ accountId }, { db, user }) => {
    if (!user) return null
    if (accountId !== user.id) throw error(403, 'INSUFFICIENT_ROLE')
    return readThemePreferences(db, user.id)
  },
)

/**
 * Persists appearance settings for the current session account.
 * @param params - Expected account id and validated UI/map preferences.
 * @returns The persisted appearance settings.
 * @remarks Callers cannot select another user's account, including super-admin callers.
 */
export const saveThemePreferences = guardedCommand(
  z.object({ accountId: z.string().min(1), preferences: ThemePreferencesSchema }),
  async ({ accountId, preferences }, { db, user }) => {
    if (!user) throw error(401, 'AUTH_REQUIRED')
    if (accountId !== user.id) throw error(403, 'INSUFFICIENT_ROLE')
    await writeThemePreferences(db, user.id, preferences)
    return preferences
  },
)
