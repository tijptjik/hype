// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  readCurrentFeatureRevision,
  saveFeatureEdit,
} from '../lib/db/services/featureLifecycle'
import { prepareFeatureAcceptedCapture } from '../lib/db/services/featureAcceptedCapture'
import { featureRevisionLocationFixture } from './fixtures/featureRevisionContent'
import { emptyFeatureAddress } from '../lib/addresses/featureAddress'
import { amendSharedCorrections } from '../lib/locations/sharedCorrection'
import { saveDisplayTemplate } from '../lib/db/services/displayTemplate'

const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
async function fixture() {
  const f = lifecycleFixture()
  connections.push(f)
  await f.initialize()
  f.sqlite.exec("INSERT INTO user(id) VALUES('author')")
  f.sqlite.exec(readFileSync('migrations/0234_display_template_registry.sql', 'utf8'))
  f.sqlite.exec(`CREATE VIEW featureComputedName AS SELECT featureId,locale,title FROM featureI18n;
    CREATE VIEW featureAcceptedNamingLocation AS SELECT id featureId,'{}' names FROM feature;`)
  f.sqlite.exec(readFileSync('migrations/0235_feature_display_templates.sql', 'utf8'))
  await saveDisplayTemplate(f.db, {
    id: 'central',
    organisationId: 'org',
    expectedVersion: 0,
    actorId: 'author',
    guard: sql`1`,
    definition: {
      name: 'Test',
      code: 'test',
      target: 'feature',
      locales: { en: '{{ optional(feature.name, "[", "]") }}' },
    },
  })
  return f
}
async function edit(
  f: ReturnType<typeof lifecycleFixture>,
  derive: Parameters<typeof saveFeatureEdit>[1]['derive'],
) {
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  if (!current) throw new Error('Missing accepted revision')
  return saveFeatureEdit(f.db, {
    featureId: 'f',
    actorId: 'author',
    guard: sql`1`,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    revisionBoundary: true,
    derive,
    validate: () => [],
  })
}
describe('accepted Feature template materialization', () => {
  it('assigns centrally, regenerates changed inputs, and retains authored names', async () => {
    const f = await fixture()
    await edit(f, content => {
      content.profile.nameTemplate = {
        rule: {
          base: 'feature',
          conditions: [],
          registry: { id: 'central', version: 1 },
        },
      }
      content.translations.en.title.value = 'AROME'
      return content
    })
    expect(
      f.sqlite
        .prepare(
          "SELECT title,baseName FROM featureI18n WHERE featureId='f' AND locale='en'",
        )
        .get(),
    ).toEqual({ title: '[AROME]', baseName: 'AROME' })
    await edit(f, content => {
      content.translations.en.title.value = 'AROME Bakery'
      return content
    })
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('[AROME Bakery]')
    await edit(f, content => {
      content.translations.en.nameOverride = ''
      return content
    })
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('')
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('rejects foreign Organisation templates without changing accepted content', async () => {
    const f = await fixture()
    f.sqlite.exec("INSERT INTO organisation(id) VALUES('other')")
    await saveDisplayTemplate(f.db, {
      id: 'private',
      organisationId: 'other',
      expectedVersion: 0,
      actorId: 'author',
      guard: sql`1`,
      definition: {
        name: 'Private',
        code: 'private',
        target: 'feature',
        locales: { en: 'Private' },
      },
    })
    const before = f.sqlite
      .prepare("SELECT currentRevisionId FROM feature WHERE id='f'")
      .get()
    await expect(
      edit(f, content => {
        content.profile.nameTemplate = {
          rule: {
            base: 'feature',
            conditions: [],
            registry: { id: 'private', version: 1 },
          },
        }
        return content
      }),
    ).rejects.toThrow('TEMPLATE_UNAVAILABLE_FOR_FEATURE')
    expect(
      f.sqlite.prepare("SELECT currentRevisionId FROM feature WHERE id='f'").get(),
    ).toEqual(before)
  })
  it('holds the accepted template version until explicit regeneration', async () => {
    const f = await fixture()
    await edit(f, content => {
      content.profile.nameTemplate = {
        rule: {
          base: 'feature',
          conditions: [],
          registry: { id: 'central', version: 1 },
        },
      }
      content.translations.en.title.value = 'AROME'
      return content
    })
    await saveDisplayTemplate(f.db, {
      id: 'central',
      organisationId: 'org',
      expectedVersion: 1,
      actorId: 'author',
      guard: sql`1`,
      definition: {
        name: 'Test',
        code: 'test',
        target: 'feature',
        locales: { en: '{{ optional(feature.name, "(", ")") }}' },
      },
    })
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('[AROME]')
    await edit(f, content => {
      if (content.profile.nameTemplate?.rule.registry)
        content.profile.nameTemplate.rule.registry.version = 2
      return content
    })
    expect(
      f.sqlite
        .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
        .get()?.title,
    ).toBe('(AROME)')
  })
})

it('materializes the inherited central template inside new Feature creation', async () => {
  const f = await fixture()
  const { prepareNewLifecycleFeature } = await import(
    '../lib/db/services/featureLifecycleIdentity'
  )
  const { executeRevisionBatch } = await import('../lib/db/services/revisionBatch')
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  if (!current) throw new Error('Missing accepted source')
  const content = structuredClone(current.content)
  content.profile.nameTemplate = {
    rule: { base: 'feature', conditions: [], registry: { id: 'central', version: 1 } },
  }
  content.translations.en.title.value = 'New bakery'
  const created = await prepareNewLifecycleFeature(f.db, {
    featureId: 'new-template-feature',
    actorId: 'author',
    guard: sql`1`,
    scope: current.state,
    content,
  })
  expect(
    f.sqlite.prepare("SELECT id FROM feature WHERE id='new-template-feature'").get(),
  ).toBeUndefined()
  await executeRevisionBatch(f.db, sql`1`, created.statements)
  expect(
    f.sqlite
      .prepare(
        "SELECT title,baseName FROM featureI18n WHERE featureId='new-template-feature' AND locale='en'",
      )
      .get(),
  ).toEqual({ title: '[New bakery]', baseName: 'New bakery' })
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('rejects a stale inspected consumer before template regeneration', async () => {
  const f = await fixture()
  await edit(f, content => {
    content.profile.nameTemplate = {
      rule: {
        base: 'feature',
        conditions: [],
        registry: { id: 'central', version: 1 },
      },
    }
    return content
  })
  const { readDisplayTemplateConsumers } = await import(
    '../lib/db/services/displayTemplateConsumers'
  )
  const page = await readDisplayTemplateConsumers(f.db, {
    organisationId: 'org',
    templateId: 'central',
    after: null,
  })
  const inspected = page.consumers[0]
  expect(inspected.featureId).toBe('f')
  await edit(f, content => {
    content.translations.en.title.value = 'New author value'
    return content
  })
  expect(
    await saveFeatureEdit(f.db, {
      featureId: inspected.featureId,
      actorId: 'author',
      guard: sql`organisationId='org'`,
      expectedRevisionId: inspected.revisionId,
      expectedVersion: inspected.version,
      revisionBoundary: true,
      derive: content => content,
      validate: () => [],
    }),
  ).toBeNull()
  expect(
    f.sqlite
      .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
      .get(),
  ).toEqual({ title: '[New author value]' })
})

it('prepares a template after a Location edit using the exact shared revision queued in the same transaction', async () => {
  const f = await fixture()
  await edit(f, content => {
    content.profile.nameTemplate = {
      rule: {
        base: 'feature',
        conditions: [],
        registry: { id: 'central', version: 1 },
      },
    }
    return content
  })
  const association = featureRevisionLocationFixture()
  const facts = {
    names: { en: 'Accepted venue' },
    phoneNumber: [],
    brands: [],
    location: {
      geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
      address: emptyFeatureAddress().source,
    },
  }
  f.sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,state TEXT,ownerOrganisationId TEXT);
    CREATE TABLE locationRevisionContent(id TEXT PRIMARY KEY,locationId TEXT,facts TEXT);
    CREATE VIEW locationRevision AS SELECT * FROM locationRevisionContent;
    CREATE TABLE locationSharedRevision(id TEXT PRIMARY KEY,locationId TEXT,previousRevisionId TEXT,corrections TEXT);`)
  f.sqlite
    .prepare("INSERT INTO location VALUES (?,'linked',NULL)")
    .run(association.locationId)
  for (const id of new Set([
    association.factsRevisionId,
    association.locationRevisionId,
  ]))
    f.sqlite
      .prepare('INSERT INTO locationRevisionContent VALUES (?,?,?)')
      .run(id, association.locationId, JSON.stringify(facts))
  const corrections = amendSharedCorrections(
    {},
    {
      location: {
        mode: 'override',
        value: {
          ...facts.location,
          geometry: { type: 'Point', coordinates: [114.1, 22.1] },
        },
      },
      names: { mode: 'override', value: { en: 'Corrected venue' } },
    },
    facts,
    {
      actorId: 'author',
      editedAt: '2026-11-14',
      sourceRevisionId: association.factsRevisionId,
    },
  )
  const input = {
    featureId: 'f',
    actorId: 'author',
    guard: sql`1`,
    derive: (content: Parameters<Parameters<typeof edit>[1]>[0]) => {
      content.placement.location = {
        ...association,
        acceptancePolicy: {
          locationSharedRevision: 'pending-shared',
          factsSharedFields: [{ field: 'names', revision: 'pending-shared' }],
        },
      }
      return content
    },
  }
  await expect(prepareFeatureAcceptedCapture(f.db, input)).rejects.toThrow(
    'SHARED_LOCATION_REVISION_UNAVAILABLE',
  )
  await expect(
    prepareFeatureAcceptedCapture(f.db, {
      ...input,
      preparedSharedCorrections: [
        { id: 'pending-shared', locationId: association.locationId, corrections },
      ],
    }),
  ).resolves.toMatchObject({ revisionId: expect.any(String) })
  await expect(
    prepareFeatureAcceptedCapture(f.db, {
      ...input,
      preparedSharedCorrections: [
        { id: 'pending-shared', locationId: 'another-location', corrections },
      ],
    }),
  ).rejects.toThrow('SHARED_LOCATION_REVISION_UNAVAILABLE')
  expect(
    f.sqlite.prepare('SELECT count(*) AS n FROM locationSharedRevision').get()?.n,
  ).toBe(0)
})
