import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const sql = readFileSync('sql/routines/backfill_user_language_fallbacks.sql', 'utf8')

describe('language fallback backfill', () => {
  it('updates every account, preserves unrelated settings and is idempotent', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, preferences TEXT NOT NULL)')
    const original = [
      { fallbackLocales: [], admin: { isPrimaryPanelCollapsed: true } },
      { fallbackLocales: ['zhHans'], allowMachineTranslation: true },
      { isTranslateButtonVisible: false },
      { fallbackLocales: ['en', 'zh-hant'], extra: 'preserved' },
    ]
    const insert = db.prepare('INSERT INTO user VALUES (?, ?)')
    original.forEach((preferences, id) => {
      insert.run(String(id), JSON.stringify(preferences))
    })
    db.exec(sql)
    const rows = db.prepare('SELECT * FROM user ORDER BY id').all()
    rows.forEach((row, id) => {
      const { fallbackLocales, ...rest } = JSON.parse(row.preferences as string)
      const { fallbackLocales: _old, ...expected } = original[id] as Record<
        string,
        unknown
      >
      expect(rest).toEqual(expected)
      expect(fallbackLocales).toEqual(expect.arrayContaining(['en', 'zh-hant']))
      expect(fallbackLocales.includes('zh-hans')).toBe(id === 1)
    })
    db.exec(sql)
    expect(db.prepare('SELECT changes() AS count').get()?.count).toBe(0)
    expect(db.prepare('SELECT * FROM user ORDER BY id').all()).toEqual(rows)
    db.close()
  })
})
