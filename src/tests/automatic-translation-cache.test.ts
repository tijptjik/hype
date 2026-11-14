// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { publicationSqlite } from './fixtures/publicationSqlite'
import * as schema from '#lib/db/schema/index.js'
import { cacheResourceTranslations } from '#lib/db/services/automaticTranslationCache.js'
import { prepareAutomaticTranslationSubmission } from '#lib/db/services/automaticTranslation.js'
import { signAutomaticTranslation } from '#lib/i18n/automaticReceipt.server.js'
import { resolveContentField, translationSourceHash } from '#lib/i18n/automatic.js'
import type { Database } from '#lib/types.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(close => {
    close()
  })
  vi.restoreAllMocks()
})
function database() {
  const fixture = publicationSqlite(schema, 100)
  cleanups.push(() => fixture.sqlite.close())
  fixture.sqlite.exec(`CREATE TABLE layer(id text PRIMARY KEY, modifiedAt text NOT NULL);
    CREATE TABLE layerI18n(layerId text NOT NULL, locale text NOT NULL, name text NOT NULL, nameGen integer NOT NULL DEFAULT 1, nameShort text NOT NULL, nameShortGen integer NOT NULL DEFAULT 1, description text, descriptionGen integer NOT NULL DEFAULT 1, PRIMARY KEY(layerId,locale));`)
  const migration = readFileSync(
    'migrations/0233_automatic_translation_values.sql',
    'utf8',
  )
  fixture.sqlite.exec(
    migration
      .split('\n')
      .filter(line => line.startsWith('ALTER TABLE `layerI18n`'))
      .join('\n'),
  )
  fixture.sqlite.exec(
    `INSERT INTO layer VALUES ('layer','revision-1'); INSERT INTO layerI18n(layerId,locale,name,nameGen,nameShort,nameShortGen) VALUES ('layer','en','Hello',0,'',0);`,
  )
  return { ...fixture, db: fixture.db as unknown as Database }
}
it('persists a generated target separately and never fills its published name', async () => {
  const { db, sqlite } = database()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ translations: [{ text: 'Bonjour' }] }])),
  )
  const rows = await cacheResourceTranslations({
    db,
    resource: 'layer',
    id: 'layer',
    targets: ['fr'],
    key: 'provider',
    secret: 'test-secret',
  })
  expect(
    sqlite
      .prepare("SELECT name,isAutomaticOnly FROM layerI18n WHERE locale='fr'")
      .get(),
  ).toMatchObject({ name: '', isAutomaticOnly: 1 })
  expect(resolveContentField(rows, 'name', 'fr').value).toBe('Hello')
  expect(resolveContentField(rows, 'name', 'fr', true)).toMatchObject({
    value: 'Bonjour',
    kind: 'automatic',
  })
  sqlite.exec("UPDATE layerI18n SET name='Changed' WHERE locale='en'")
  const changed = Object.fromEntries(
    (await db.select().from(schema.layerI18n)).map(row => [row.locale, row]),
  )
  expect(resolveContentField(changed, 'name', 'fr', true).value).toBe('Changed')
})
it('rejects forged provenance and attributes explicit acceptance on the server', async () => {
  const { db } = database()
  const automatic = {
    value: 'Bonjour',
    sourceLocale: 'en',
    sourceText: 'Hello',
    sourceHash: await translationSourceHash('Hello'),
    provider: 'azure-translator',
    model: null,
    generatedAt: new Date().toISOString(),
    receipt: '',
  }
  automatic.receipt = await signAutomaticTranslation(automatic, 'fr', 'test-secret')
  const rows = {
    fr: {
      name: 'Bonjour révisé',
      nameGen: true,
      autoTranslated: { name: automatic },
      translationProvenance: {
        name: {
          ...automatic,
          acceptedValue: 'Bonjour révisé',
          acceptedBy: 'pending',
          acceptedAt: new Date().toISOString(),
        },
      },
    },
  }
  await prepareAutomaticTranslationSubmission({
    db,
    resource: 'layer',
    id: 'layer',
    rows,
    actorId: 'editor',
    secret: 'test-secret',
  })
  expect(rows.fr.translationProvenance.name).toMatchObject({
    acceptedBy: 'editor',
    acceptedValue: 'Bonjour révisé',
    value: 'Bonjour',
  })
  expect(rows.fr.nameGen).toBe(false)
  automatic.value = 'Forged'
  await expect(
    prepareAutomaticTranslationSubmission({
      db,
      resource: 'layer',
      id: 'layer',
      rows,
      actorId: 'editor',
      secret: 'test-secret',
    }),
  ).rejects.toMatchObject({ status: 400 })
})

it('never translates or returns stored fields absent from the authorized projection', async () => {
  const { db, sqlite } = database()
  sqlite.exec(
    "UPDATE layerI18n SET description='Private draft',descriptionGen=0 WHERE locale='en'",
  )
  const provider = vi.fn(async () =>
    Response.json([{ translations: [{ text: 'Bonjour' }] }]),
  )
  vi.stubGlobal('fetch', provider)
  const rows = await cacheResourceTranslations({
    db,
    resource: 'layer',
    id: 'layer',
    targets: ['fr'],
    key: 'provider',
    secret: 'test-secret',
    authorizedRows: { en: { name: 'Hello', nameGen: false } },
  })
  expect(provider).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(rows)).not.toContain('Private draft')
  expect(rows.en).toMatchObject({ name: 'Hello' })
  expect(resolveContentField(rows, 'name', 'fr', true).kind).toBe('automatic')
})
it('does not cache a visible snapshot over a different current source', async () => {
  const { db, sqlite } = database()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ translations: [{ text: 'Ancien' }] }])),
  )
  await cacheResourceTranslations({
    db,
    resource: 'layer',
    id: 'layer',
    targets: ['fr'],
    key: 'provider',
    secret: 'test-secret',
    authorizedRows: { en: { name: 'Old accepted title', nameGen: false } },
  })
  expect(
    sqlite.prepare("SELECT * FROM layerI18n WHERE locale='fr'").get(),
  ).toBeUndefined()
})

it('keeps automatic Feature values scoped to their property as well as their locale', async () => {
  const fixture = publicationSqlite(schema, 100)
  cleanups.push(() => fixture.sqlite.close())
  fixture.sqlite.exec(`CREATE TABLE feature(id text PRIMARY KEY,modifiedAt text);
    CREATE TABLE featurePropertyI18n(featureId text,propertyId text,locale text,value text,valueGen integer DEFAULT 0,PRIMARY KEY(featureId,propertyId,locale));`)
  const migration = readFileSync(
    'migrations/0233_automatic_translation_values.sql',
    'utf8',
  )
  fixture.sqlite.exec(
    migration
      .split('\n')
      .filter(line => line.startsWith('ALTER TABLE `featurePropertyI18n`'))
      .join('\n'),
  )
  fixture.sqlite.exec(`INSERT INTO feature VALUES ('f','revision-1');
    INSERT INTO featurePropertyI18n(featureId,propertyId,locale,value) VALUES ('f','a','en','First'),('f','b','en','Second');`)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ translations: [{ text: 'Premier' }] }])),
  )
  const rows = await cacheResourceTranslations({
    db: fixture.db as unknown as Database,
    resource: 'featureProperty',
    id: 'f',
    propertyId: 'a',
    targets: ['fr'],
    key: 'provider',
    secret: 'test-secret',
  })
  expect(resolveContentField(rows, 'value', 'fr', true).value).toBe('Premier')
  expect(
    fixture.sqlite
      .prepare(
        "SELECT propertyId,value,isAutomaticOnly FROM featurePropertyI18n WHERE locale='fr'",
      )
      .all(),
  ).toEqual([{ propertyId: 'a', value: null, isAutomaticOnly: 1 }])
  expect(
    fixture.sqlite
      .prepare("SELECT value FROM featurePropertyI18n WHERE propertyId='b'")
      .get(),
  ).toMatchObject({ value: 'Second' })
})

it('retains known legacy AI origin when an editor confirms a stored generated value', async () => {
  const { db, sqlite } = database()
  sqlite.exec(
    "UPDATE layerI18n SET name='Old machine text', nameGen=1 WHERE locale='en'",
  )
  const rows: Record<string, Record<string, unknown>> = {
    en: { name: 'Reviewed text', nameGen: false },
  }
  await prepareAutomaticTranslationSubmission({
    db,
    resource: 'layer',
    id: 'layer',
    rows,
    actorId: 'reviewer',
  })
  expect(rows.en.translationProvenance).toEqual({
    name: {
      origin: 'legacy-ai',
      humanVerified: true,
      value: 'Old machine text',
      acceptedValue: 'Reviewed text',
      acceptedBy: 'reviewer',
      acceptedAt: expect.any(String),
    },
  })
  expect(rows.en.autoTranslated).toBeNull()
})

it('publishes accepted legacy AI without marking it human-verified', async () => {
  const { db, sqlite } = database()
  sqlite.exec("UPDATE layerI18n SET name='Machine text', nameGen=1 WHERE locale='en'")
  const rows: Record<string, Record<string, unknown>> = {
    en: {
      name: 'Machine text',
      nameGen: false,
      translationProvenance: {
        name: {
          origin: 'legacy-ai',
          value: 'Machine text',
          acceptedValue: 'Machine text',
          humanVerified: false,
          acceptedBy: 'pending',
          acceptedAt: new Date().toISOString(),
        },
      },
    },
  }
  await prepareAutomaticTranslationSubmission({
    db,
    resource: 'layer',
    id: 'layer',
    rows,
    actorId: 'reviewer',
  })
  expect(rows.en.translationProvenance).toMatchObject({
    name: {
      humanVerified: false,
      acceptedBy: 'reviewer',
      acceptedValue: 'Machine text',
    },
  })
  expect(resolveContentField(rows, 'name', 'en').value).toBe('Machine text')
})

it('accepts an unchanged AI source but still rejects a genuinely changed source', async () => {
  const { db, sqlite } = database()
  sqlite.exec("UPDATE layerI18n SET nameGen=1 WHERE locale='en'")
  const automatic = {
    value: 'Bonjour',
    sourceLocale: 'en',
    sourceText: 'Hello',
    sourceHash: await translationSourceHash('Hello'),
    provider: 'azure-translator',
    model: null,
    generatedAt: new Date().toISOString(),
    receipt: '',
  }
  automatic.receipt = await signAutomaticTranslation(automatic, 'fr', 'test-secret')
  const submitted = () => ({
    fr: {
      name: 'Bonjour',
      autoTranslated: { name: automatic },
      translationProvenance: {
        name: {
          ...automatic,
          humanVerified: false,
          acceptedValue: 'Bonjour',
          acceptedBy: 'pending',
          acceptedAt: new Date().toISOString(),
        },
      },
    },
  })
  const rows = submitted()
  await prepareAutomaticTranslationSubmission({
    db,
    resource: 'layer',
    id: 'layer',
    rows,
    actorId: 'editor',
    secret: 'test-secret',
  })
  expect(rows.fr.translationProvenance.name).toMatchObject({
    acceptedBy: 'editor',
    humanVerified: false,
  })
  sqlite.exec("UPDATE layerI18n SET name='Different text' WHERE locale='en'")
  await expect(
    prepareAutomaticTranslationSubmission({
      db,
      resource: 'layer',
      id: 'layer',
      rows: submitted(),
      actorId: 'editor',
      secret: 'test-secret',
    }),
  ).rejects.toMatchObject({ status: 409 })
})

it('persists verification changes for accepted AI while preserving its stored receipt', async () => {
  const { db, sqlite } = database()
  const accepted = {
    origin: 'legacy-ai',
    value: 'Hello',
    acceptedValue: 'Hello',
    humanVerified: false,
    acceptedBy: 'original-reviewer',
    acceptedAt: '2026-11-01T00:00:00.000Z',
  }
  sqlite
    .prepare('UPDATE layerI18n SET translationProvenance=? WHERE locale=?')
    .run(JSON.stringify({ name: accepted }), 'en')
  for (const humanVerified of [true, false]) {
    const rows = {
      en: {
        name: 'Hello',
        nameGen: false,
        translationProvenance: {
          name: { ...accepted, humanVerified, value: 'forged replacement history' },
        },
      },
    }
    await prepareAutomaticTranslationSubmission({
      db,
      resource: 'layer',
      id: 'layer',
      rows,
      actorId: 'reviewer',
    })
    expect(rows.en.translationProvenance.name).toEqual({ ...accepted, humanVerified })
    expect(rows.en.nameGen).toBe(false)
    const edited = { en: { ...rows.en, name: 'Authored after toggling' } }
    await prepareAutomaticTranslationSubmission({
      db,
      resource: 'layer',
      id: 'layer',
      rows: edited,
      actorId: 'reviewer',
    })
    expect(edited.en.name).toBe('Authored after toggling')
    expect(edited.en.translationProvenance.name.humanVerified).toBe(!humanVerified)
    sqlite
      .prepare('UPDATE layerI18n SET translationProvenance=? WHERE locale=?')
      .run(JSON.stringify(rows.en.translationProvenance), 'en')
  }
})

it('rejects verification of an acceptance that changed after the editor loaded it', async () => {
  const { db, sqlite } = database()
  const accepted = {
    origin: 'legacy-ai',
    value: 'Hello',
    acceptedValue: 'Hello',
    humanVerified: false,
    acceptedBy: 'reviewer',
    acceptedAt: '2026-11-01T00:00:00.000Z',
  }
  sqlite
    .prepare('UPDATE layerI18n SET translationProvenance=? WHERE locale=?')
    .run(JSON.stringify({ name: accepted }), 'en')
  await expect(
    prepareAutomaticTranslationSubmission({
      db,
      resource: 'layer',
      id: 'layer',
      actorId: 'reviewer',
      rows: {
        en: {
          name: 'Old value',
          nameGen: false,
          translationProvenance: {
            name: {
              ...accepted,
              acceptedValue: 'Old value',
              humanVerified: true,
            },
          },
        },
      },
    }),
  ).rejects.toMatchObject({ status: 409 })
})
