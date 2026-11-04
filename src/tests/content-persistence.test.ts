// @vitest-environment node
// TEST
import { afterEach, describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
// CONTRACTS
import {
  adaptContentMap,
  contentMapToStorage,
  contentRowsToForm,
} from '#lib/i18n/contentRecords.js'
import {
  FeatureI18nByLocaleFormData,
  FeatureDraftI18nByLocaleFormData,
  FeatureAdminProfileAPI,
  FeatureCompactProfileAPI,
  FeaturePropertyI18nByLocaleFormData,
} from '#lib/db/zod/schema/feature.js'
import { feature, featureI18n } from '#lib/db/schema/feature.js'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import { saveLinkedFeatureForm } from '#lib/db/services/locationEdit.js'
import { createI18n, updateI18n } from '#lib/db/services/feature.js'
import { getGenAiState, toggleGenAiField } from '#lib/client/services/form.js'
import { prepareFeatureFormRelations } from '#lib/db/services/locationRelations.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import { materializeLocationAdoption } from '#lib/locations/adoptionMaterialize.js'
import { materializeLocationReset } from '#lib/locations/reset.js'
import { toFeatureFormInput } from '#lib/client/services/feature.js'
import {
  projectFeatureAddress,
  emptyFeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { translateContentField } from '#lib/api/external/translation.js'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'
import { ContentLocaleSettingsSchema } from '#lib/content-locales/settings.js'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { createProfileTranslator } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'

vi.mock('#lib/client/services/task.js', () => ({ upsertNewFeatureDraft: vi.fn() }))
const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const store of stores.splice(0)) store.sqlite.close()
})

function fixture() {
  const store = setupLifecycleDatabase()
  stores.push(store)
  for (const [name, table] of [
    ['feature', feature],
    ['featureI18n', featureI18n],
  ] as const) {
    const existing = new Set(
      store.sqlite
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map(row => row.name),
    )
    for (const column of Object.values(getTableColumns(table)))
      if (!existing.has(column.name))
        store.sqlite.exec(
          `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
        )
  }
  store.sqlite.exec(`CREATE UNIQUE INDEX feature_locale ON featureI18n(featureId,locale);
    CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER,PRIMARY KEY(featureId,propertyId,locale));
    INSERT INTO property(id,key,audience) VALUES ('prop','test','public');`)
  const save = async (id: string, i18n: Record<string, any>, properties?: any[]) => {
    const statements = prepareFeatureFormRelations(
      store.db,
      id,
      sql`1`,
      i18n,
      properties,
    )
    if (statements.length) await store.db.batch(statements as never)
  }
  const read = (id = 'f') =>
    contentRowsToForm(
      store.sqlite
        .prepare('SELECT * FROM featureI18n WHERE featureId=?')
        .all(id) as never,
    )
  return { ...store, save, read }
}
const japanese = {
  title: '喫茶店',
  titleGen: false,
  description: '<p>説明</p>',
  descriptionGen: true,
  displayAddress: '手動住所',
  displayAddressGen: false,
  addressProperties: {},
}
const legacy = {
  en: { title: 'Cafe', titleGen: false },
  zhHant: { title: '咖啡店', titleGen: true },
  zhHans: { title: '咖啡馆', titleGen: false },
}
const facts = {
  names: { en: 'Location', 'zh-hant': '場所', ja: '場所名' },
  phoneNumber: [],
  brands: [],
  location: {
    geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
    address: {
      status: 'unresolved' as const,
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: {},
    },
  },
}

describe('dynamic Feature content persistence', () => {
  it('validates legacy and canonical maps, empty added rows and a fourth-only title', () => {
    expect(
      FeatureI18nByLocaleFormData.parse({ ...legacy, ja: japanese, fr: { title: '' } })
        .ja,
    ).toEqual(japanese)
    expect(
      FeatureI18nByLocaleFormData.parse({ ja: japanese, 'zh-Hant': { title: '' } })
        .zhHant.title,
    ).toBe('')
    expect(FeatureI18nByLocaleFormData.safeParse({ ja: { title: ' ' } }).success).toBe(
      false,
    )
    expect(FeatureDraftI18nByLocaleFormData.parse({ ja: { title: '' } }).ja.title).toBe(
      '',
    )
    expect(FeatureI18nByLocaleFormData.safeParse({ bad_tag: japanese }).success).toBe(
      false,
    )
    expect(
      toFeatureFormInput({
        i18n: { 'zh-Hant': { title: '傳統' }, ja: japanese },
      } as never).data.i18n.zhHant.title,
    ).toBe('傳統')
    expect(
      FeaturePropertyI18nByLocaleFormData.parse({
        ja: { value: '値', valueGen: false },
      }).ja.value,
    ).toBe('値')
  })

  it('rejects alias collisions and embedded identity mismatches before writing', () => {
    expect(() => adaptContentMap({ zhHant: 'a', 'zh-Hant': 'b' })).toThrow('collision')
    expect(() =>
      contentRowsToForm([
        { locale: 'zh-hant', title: 'a' },
        { locale: 'zh-Hant', title: 'b' },
      ]),
    ).toThrow('collision')
    expect(() => contentMapToStorage({ ja: { locale: 'en', title: 'a' } })).toThrow(
      'map key',
    )
    expect(
      FeatureI18nByLocaleFormData.safeParse({
        zhHant: { title: 'a' },
        'zh-Hant': { title: 'b' },
      }).success,
    ).toBe(false)
  })

  it('saves, reloads, clones, and retains hidden fourth locales and verification during unrelated edits', async () => {
    const { save, read, sqlite } = fixture()
    const input = FeatureI18nByLocaleFormData.parse({ ...legacy, ja: japanese })
    const properties = [
      {
        propertyId: 'prop',
        value: null,
        i18n: {
          en: { value: 'English', valueGen: true },
          ja: { value: '値', valueGen: false },
        },
      },
    ]
    await save('f', input, properties)
    expect(read().ja).toMatchObject({
      ...japanese,
      titleGen: 0,
      descriptionGen: 1,
      displayAddressGen: 0,
      addressProperties: '{}',
    })
    await save('f', { en: { description: 'Unrelated edit' } }, [
      { ...properties[0], i18n: { en: { value: 'Changed' } } },
    ])
    expect(read().ja).toMatchObject({
      title: japanese.title,
      titleGen: 0,
      descriptionGen: 1,
    })
    expect(read().en).toMatchObject({
      title: 'Cafe',
      titleGen: 0,
      description: 'Unrelated edit',
    })
    expect(
      sqlite
        .prepare("SELECT value,valueGen FROM featurePropertyI18n WHERE locale='ja'")
        .get(),
    ).toEqual({ value: '値', valueGen: 0 })
    // Use Drizzle to recover JSON/boolean types, then the same read/form adapters used by callers.
    const rows = await stores[0].db.select().from(featureI18n)
    const projected = FeatureAdminProfileAPI.shape.i18n.parse(contentRowsToForm(rows))!
    expect(projected.ja.descriptionGen).toBe(true)
    expect(FeatureCompactProfileAPI.shape.i18n.parse(projected)?.ja.title).toBe(
      japanese.title,
    )
    const cloned = toFeatureFormInput({
      id: 'f',
      i18n: projected,
      properties: [],
    } as never)
    expect(cloned.data.i18n.ja).toEqual(japanese)
    await save('clone', FeatureI18nByLocaleFormData.parse(cloned.data.i18n))
    expect(read('clone').ja).toMatchObject({
      title: japanese.title,
      titleGen: 0,
      descriptionGen: 1,
    })
    await save('f', { ja: { title: '', description: '', descriptionGen: false } })
    expect(read().ja).toMatchObject({
      title: '',
      description: '',
      titleGen: 0,
      descriptionGen: 0,
    })
  })

  it('integrates configured order, hidden bulk translation, draft recovery and database reload', async () => {
    const { save, read, db } = fixture()
    const defaults = resolveContentLocales({
      organisationSettings: ContentLocaleSettingsSchema.parse({
        contentLocales: ['ja', 'en', 'zh-Hant', 'zh-Hans'],
      }),
      userLocale: 'en',
    })
    const values = FeatureI18nByLocaleFormData.parse({
      ...legacy,
      en: { ...legacy.en, description: 'Source description', descriptionGen: false },
      zhHans: { ...legacy.zhHans, description: 'Keep this', descriptionGen: false },
      ja: { ...japanese, description: '', descriptionGen: false },
    })
    const state = restoreProfileLocales(defaults.locales, values)
    expect(state.selectedLocales[0]).toBe('ja')
    state.visibleLocales = ['en']
    const translate = createProfileTranslator({
      values: () => values,
      context: () => 'f',
      locked: () => false,
      translate: async (_source, target) => ({
        status: 'translated',
        text: `${target} translated`,
      }),
      apply: (field, locale, text) => {
        const row = values[contentFormKey(locale)]
        row[field] = text
        row[`${field}Gen`] = true
      },
    })
    await translate.run('en', 'description', state.selectedLocales)
    expect(values.ja.description).toBe('ja translated')
    expect(values.zhHans.description).toBe('Keep this')
    expect(values.zhHans.descriptionGen).toBe(false)
    expect(values.ja.title).toBe(japanese.title)
    expect(values.ja.titleGen).toBe(false)
    // Exercise the serialized draft boundary before submitting dynamic form data.
    const draft = JSON.parse(JSON.stringify({ values, state }))
    const recovered = restoreProfileLocales(['en'], draft.values, draft.state)
    expect(recovered.selectedLocales[0]).toBe('ja')
    expect(recovered.visibleLocales).toEqual(['en'])
    await save('f', FeatureI18nByLocaleFormData.parse(draft.values))
    await save('f', { en: { description: 'Unrelated follow-up' } })
    expect(read().ja).toMatchObject({
      title: japanese.title,
      titleGen: 0,
      description: 'ja translated',
      descriptionGen: 1,
    })
    const rows = await db.select().from(featureI18n)
    const reloaded = toFeatureFormInput({
      id: 'f',
      i18n: contentRowsToForm(rows),
      properties: [],
    } as never)
    expect(reloaded.data.i18n.ja).toMatchObject({
      titleGen: false,
      descriptionGen: true,
      description: 'ja translated',
    })
  })

  it('preserves additional locales through the legacy create/update service entry points', async () => {
    const { db, read } = fixture()
    await createI18n(
      db,
      FeatureI18nByLocaleFormData.parse({ ...legacy, ja: japanese }),
      'f',
    )
    await updateI18n(db, { en: { description: 'Changed' } }, 'f')
    expect(read().ja).toMatchObject({
      title: japanese.title,
      titleGen: 0,
      descriptionGen: 1,
    })
  })

  it('keeps independent fourth-language titles on an older-client linked save', async () => {
    const { db, sqlite, save, read } = fixture()
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    await save('f', { en: { title: 'Independent' }, ja: japanese })
    sqlite.exec(
      "INSERT INTO hub VALUES ('core','core'); INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');",
    )
    const target = await createLocalLocation(
      db,
      'p',
      { state: 'manual', facts },
      'actor',
    )
    expect(
      (
        await linkInitialFeatureLocation(db, {
          featureId: 'f',
          projectId: 'p',
          ...target,
          expectedFeatureModifiedAt: 'original',
          actorId: 'actor',
          nameMode: 'independent',
        })
      ).status,
    ).toBe('linked')
    const updatedAt = sqlite
      .prepare("SELECT modifiedAt FROM feature WHERE id='f'")
      .get()!.modifiedAt as string
    const result = await saveLinkedFeatureForm(db, {
      featureId: 'f',
      projectId: 'p',
      actorId: 'actor',
      updatedAt,
      data: {},
      i18n: { en: { description: 'Changed' } },
    })
    expect(result.status).toBe('saved')
    expect(read().ja).toMatchObject({
      title: japanese.title,
      description: japanese.description,
      titleGen: 0,
      descriptionGen: 1,
    })
  })

  it('updates verification for the requested content tag without changing English', () => {
    let state = { data: { i18n: { en: { titleGen: false }, ja: { titleGen: true } } } }
    const form = {
      fields: {
        value: () => state,
        set: (next: typeof state) => {
          state = next
        },
      },
    }
    toggleGenAiField(form as never, 'ja', 'title')
    expect(getGenAiState(form, 'ja', 'title')).toBe(false)
    expect(state.data.i18n.en.titleGen).toBe(false)
  })

  it('keeps per-query parameter counts bounded with many content locales', async () => {
    const { save, read } = fixture()
    const rows = Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [
        `en-x-l${i}`,
        { title: String(i), titleGen: false },
      ]),
    )
    await save('f', rows)
    expect(Object.keys(read())).toHaveLength(120)
  })

  it('retains authored extra-locale addresses through the existing address engine', () => {
    const input = {
      geometry: facts.location.geometry,
      addressMeta: { address: emptyFeatureAddress() },
      i18n: { ja: japanese },
    }
    expect(projectFeatureAddress(input).i18n.ja).toEqual(japanese)
  })
})

describe('dynamic inherited names', () => {
  it('projects all source names, clears absent translations and retains description provenance', () => {
    const input = {
      facts,
      locationFacts: facts,
      overrides: {},
      data: {},
      i18n: {
        ja: japanese,
        fr: { title: 'Old name', description: 'French', descriptionGen: true },
      },
    }
    const projected = materializeEffectiveLocation(input)
    expect(projected.i18n.ja).toMatchObject({
      title: '場所名',
      titleGen: false,
      description: japanese.description,
      descriptionGen: true,
      displayAddress: japanese.displayAddress,
    })
    expect(projected.i18n.fr).toMatchObject({
      title: '',
      description: 'French',
      descriptionGen: true,
    })
    expect(
      materializeLocationAdoption({ ...input, fieldGroup: 'facts' }).i18n.fr.title,
    ).toBe('')
    expect(
      materializeLocationReset({
        ...input,
        reset: {
          expectedRevision: 'v',
          names: ['ja'],
          phoneNumber: false,
          location: false,
        },
      }).i18n.ja.title,
    ).toBe('場所名')
  })
})

describe('single-field translation provider', () => {
  it('accepts canonical and legacy tags and returns a field result without mutating input', async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _options?: RequestInit) =>
        new Response(JSON.stringify([{ translations: [{ text: '喫茶店' }] }]), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const input = Object.freeze({ text: 'Cafe', source: 'en', target: 'ja' })
    expect(await translateContentField(input, 'region', 'key')).toEqual({
      status: 'translated',
      text: '喫茶店',
      source: 'en',
      target: 'ja',
    })
    expect(String(fetcher.mock.calls[0][0])).toContain('to=ja')
    await translateContentField({ ...input, target: 'zhHant' }, 'region', 'key')
    expect(String(fetcher.mock.calls[1][0])).toContain('to=yue')
  })
  it('distinguishes unsupported pairs, provider errors and malformed successes from stored manual content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 400036 } }), { status: 400 }),
      ),
    )
    expect(
      (
        await translateContentField(
          { text: 'Cafe', source: 'en', target: 'tlh' },
          'r',
          'k',
        )
      ).status,
    ).toBe('unsupported')
    expect(
      FeatureI18nByLocaleFormData.parse({ tlh: { title: 'Manual text' } }).tlh.title,
    ).toBe('Manual text')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    )
    expect(
      (
        await translateContentField(
          { text: 'Cafe', source: 'en', target: 'ja' },
          'r',
          'k',
        )
      ).status,
    ).toBe('error')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(
      (
        await translateContentField(
          { text: 'Cafe', source: 'en', target: 'ja' },
          'r',
          'k',
        )
      ).status,
    ).toBe('error')
  })
})
