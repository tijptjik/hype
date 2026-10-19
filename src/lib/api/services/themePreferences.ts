// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { user } from '#lib/db/schema/user.js'
import { ThemePreferencesSchema } from '#lib/themes/preferences.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ThemePreferences } from '#lib/themes/preferences.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// READ
// - readThemePreferences
// WRITE
// - writeThemePreferences
//
// ═══════════════════════

/**
 * Reads validated appearance settings without exposing other account preferences.
 * @param db - Request-scoped database.
 * @param userId - Authoritative session user id.
 * @returns Saved appearance, or null for accounts without valid appearance settings.
 */
export async function readThemePreferences(
  db: Database,
  userId: string,
): Promise<ThemePreferences | null> {
  const row = await db
    .select({ preferences: user.preferences })
    .from(user)
    .where(eq(user.id, userId))
    .get()
  try {
    const result = ThemePreferencesSchema.safeParse(
      JSON.parse(row?.preferences ?? '{}').theme,
    )
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Atomically patches appearance settings, preserving every unrelated preference key.
 * @param db - Request-scoped database.
 * @param userId - Authoritative session user id.
 * @param preferences - Validated appearance settings.
 * @returns Nothing once the account preference update is persisted.
 * @remarks The SQL patch prevents concurrent language/admin changes from being overwritten.
 */
export async function writeThemePreferences(
  db: Database,
  userId: string,
  preferences: ThemePreferences,
): Promise<void> {
  // Repair malformed legacy payloads while preserving valid preference objects.
  await db
    .update(user)
    .set({
      preferences: sql`json_set(
      CASE WHEN json_valid(${user.preferences}) THEN
        CASE WHEN json_type(${user.preferences}) = 'object' THEN ${user.preferences} ELSE '{}' END
      ELSE '{}' END,
      '$.theme', json(${JSON.stringify(preferences)})
    )`,
    })
    .where(eq(user.id, userId))
    .run()
}
