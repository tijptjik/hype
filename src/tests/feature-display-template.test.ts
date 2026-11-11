// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  readCurrentFeatureRevision,
  saveFeatureEdit,
} from '../lib/db/services/featureLifecycle'
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
