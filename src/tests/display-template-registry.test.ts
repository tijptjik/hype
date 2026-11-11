// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  listDisplayTemplates,
  saveDisplayTemplate,
} from '../lib/db/services/displayTemplate'
import {
  DisplayTemplateDefinitionSchema,
  renderLocalizedDisplayTemplate,
} from '../lib/templates/registry'
import type { Database } from '../lib/types'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
function fixture() {
  const f = publicationSqlite({})
  connections.push(f)
  f.sqlite.exec(
    `PRAGMA foreign_keys=ON; CREATE TABLE organisation(id TEXT PRIMARY KEY); INSERT INTO organisation VALUES('a'),('b'); CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES('editor');`,
  )
  f.sqlite.exec(readFileSync('migrations/0234_display_template_registry.sql', 'utf8'))
  return { ...f, db: f.db as unknown as Database }
}
const definition = {
  name: 'Establishment',
  code: 'establishment',
  target: 'location' as const,
  locales: {
    en: '{{ pair(brand.name, branch, " - ") ?? source.name }}',
    'zh-Hant': '{{ source.name }}',
  },
}
const input = {
  id: 'template',
  organisationId: null,
  expectedVersion: 0,
  definition,
  actorId: 'editor',
  guard: sql`1`,
}

describe('central template versions', () => {
  it('publishes atomically, retains history, and rejects stale writers', async () => {
    const f = fixture()
    expect(await saveDisplayTemplate(f.db, input)).toEqual({
      id: 'template',
      version: 1,
    })
    expect(await saveDisplayTemplate(f.db, input)).toBeNull()
    expect(
      await saveDisplayTemplate(f.db, {
        ...input,
        expectedVersion: 1,
        definition: { ...definition, name: 'Updated' },
      }),
    ).toEqual({ id: 'template', version: 2 })
    expect(await saveDisplayTemplate(f.db, { ...input, expectedVersion: 1 })).toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM displayTemplateRevision').get()?.n,
    ).toBe(2)
    expect(() =>
      f.sqlite.exec("UPDATE displayTemplateRevision SET definition='{}'"),
    ).toThrow(/immutable/)
    expect(() => f.sqlite.exec('DELETE FROM displayTemplateRevision')).toThrow(
      /immutable/,
    )
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('isolates Organisation catalogues and cannot rewrite another owner or a code', async () => {
    const f = fixture()
    await saveDisplayTemplate(f.db, input)
    await saveDisplayTemplate(f.db, { ...input, id: 'a-template', organisationId: 'a' })
    await saveDisplayTemplate(f.db, { ...input, id: 'b-template', organisationId: 'b' })
    expect((await listDisplayTemplates(f.db, 'a')).map(row => row.id).sort()).toEqual([
      'a-template',
      'template',
    ])
    expect(
      await saveDisplayTemplate(f.db, {
        ...input,
        id: 'a-template',
        organisationId: 'b',
        expectedVersion: 1,
      }),
    ).toBeNull()
    expect(
      await saveDisplayTemplate(f.db, {
        ...input,
        expectedVersion: 1,
        definition: { ...definition, code: 'renamed' },
      }),
    ).toBeNull()
  })
  it('rolls back a failed authorization fence without creating an identity', async () => {
    const f = fixture()
    expect(await saveDisplayTemplate(f.db, { ...input, guard: sql`0` })).toBeNull()
    expect(await listDisplayTemplates(f.db, null)).toEqual([])
  })
  it('validates target dependencies, locale aliases and missing locales', () => {
    expect(
      DisplayTemplateDefinitionSchema.safeParse({
        ...definition,
        locales: { en: '{{ properties.private }}' },
      }).success,
    ).toBe(false)
    expect(
      DisplayTemplateDefinitionSchema.safeParse({
        ...definition,
        locales: { en: '{{ branchId }}' },
      }).success,
    ).toBe(false)
    expect(
      DisplayTemplateDefinitionSchema.safeParse({
        ...definition,
        target: 'feature',
        locales: { en: '{{ properties.donor }}' },
      }).success,
    ).toBe(true)
    expect(
      DisplayTemplateDefinitionSchema.safeParse({
        ...definition,
        locales: { 'zh-Hant': 'A', 'zh-hant': 'B' },
      }).success,
    ).toBe(false)
    expect(
      DisplayTemplateDefinitionSchema.safeParse({ ...definition, locales: {} }).success,
    ).toBe(false)
  })
  it('honours manual clears and never substitutes another language for a missing expression', () => {
    expect(renderLocalizedDisplayTemplate(definition, 'fr', {}, 'French source')).toBe(
      'French source',
    )
    expect(
      renderLocalizedDisplayTemplate(
        definition,
        'en',
        { 'source.name': 'Source' },
        'Fallback',
        '',
      ),
    ).toBe('')
    expect(
      renderLocalizedDisplayTemplate(
        definition,
        'zh-hant',
        { 'source.name': '原名' },
        'Fallback',
      ),
    ).toBe('原名')
  })
})
