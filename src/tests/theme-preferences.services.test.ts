// @vitest-environment node
// TESTING
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// SERVICES
import {
  readThemePreferences,
  writeThemePreferences,
} from '#lib/api/services/themePreferences.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ThemePreferences } from '#lib/themes/preferences.js'

let sqlite: DatabaseSync
let db: Database
const settings: ThemePreferences = {
  uiTheme: 'hype-light',
  mapStyle: 'hyperLight',
  syncUiAndMap: true,
  useActiveMapStyle: true,
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'CREATE TABLE user (id TEXT PRIMARY KEY, preferences TEXT, updatedAt INTEGER)',
  )
  sqlite.prepare('INSERT INTO user VALUES (?, ?, 0)').run(
    'user',
    JSON.stringify({
      fallbackLocales: ['en', 'zh-hant'],
      admin: { isPrimaryPanelCollapsed: true },
      future: { preserve: true },
    }),
  )
  sqlite.prepare('INSERT INTO user VALUES (?, ?, 0)').run('other', '{}')
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        run: async () => sqlite.prepare(sql).run(...params),
        raw: async () => {
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
  } as never) as Database
})
afterEach(() => sqlite.close())

/** Reads the exact persisted JSON, independently of API shaping. @returns Stored preferences. */
function stored(): Record<string, unknown> {
  return JSON.parse(
    (
      sqlite.prepare("SELECT preferences FROM user WHERE id='user'").get() as {
        preferences: string
      }
    ).preferences,
  )
}

describe('persisted account appearance', () => {
  it('patches only theme preferences and reads them back on a separate login', async () => {
    expect(await readThemePreferences(db, 'user')).toBeNull()
    await writeThemePreferences(db, 'user', settings)
    expect(stored()).toEqual({
      fallbackLocales: ['en', 'zh-hant'],
      admin: { isPrimaryPanelCollapsed: true },
      future: { preserve: true },
      theme: settings,
    })
    expect(await readThemePreferences(db, 'user')).toEqual(settings)
    expect(await readThemePreferences(db, 'other')).toBeNull()
  })

  it('preserves language updates committed before a later appearance update', async () => {
    await writeThemePreferences(db, 'user', settings)
    sqlite
      .prepare(
        "UPDATE user SET preferences=json_set(preferences,'$.fallbackLocales',json(?)) WHERE id='user'",
      )
      .run('["zh-hans"]')
    await writeThemePreferences(db, 'user', { ...settings, uiTheme: 'breadline-light' })
    expect(stored()).toMatchObject({
      fallbackLocales: ['zh-hans'],
      theme: { uiTheme: 'breadline-light' },
    })
  })

  it.each(['malformed', 'null', '[]', '{"theme":{"uiTheme":"unknown"}}'])(
    'handles legacy payload %s',
    async payload => {
      sqlite.prepare("UPDATE user SET preferences=? WHERE id='user'").run(payload)
      expect(await readThemePreferences(db, 'user')).toBeNull()
      await writeThemePreferences(db, 'user', settings)
      expect(await readThemePreferences(db, 'user')).toEqual(settings)
    },
  )
})
