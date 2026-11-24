// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  type FeatureNameRule,
  featureNameTextValue,
  generateFeatureName,
} from '#lib/features/locationPolicy.js'

const rule = {
  base: 'feature' as 'feature' | 'location',
  conditions: [
    {
      propertyId: 'paid',
      locales: {
        en: {
          true: 'Paid',
          false: 'Free',
          null: 'Unknown',
          placement: 'suffix' as const,
          separator: ' ',
        },
        'zh-Hant': {
          true: '收費',
          false: '免費',
          null: '未知',
          placement: 'prefix' as const,
          separator: '：',
        },
      },
    },
  ],
}

/** Create actual SQLite triggers over the naming dependencies, with a retained legacy row. */
function fixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA recursive_triggers=ON;
    CREATE TABLE feature(id TEXT PRIMARY KEY,nameTemplate TEXT,isDraft INTEGER DEFAULT 0,projectId TEXT);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,titleGen INTEGER,description TEXT,descriptionGen INTEGER,displayAddress TEXT,displayAddressGen INTEGER,addressProperties TEXT,PRIMARY KEY(featureId,locale));
    CREATE TABLE featureRevision(featureId TEXT);
    CREATE TABLE featureRevisionWriteScope(featureId TEXT PRIMARY KEY,token TEXT);
    CREATE TABLE property(id TEXT PRIMARY KEY,dataType TEXT,audience TEXT,component TEXT);
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,value TEXT,PRIMARY KEY(featureId,propertyId));
    CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,PRIMARY KEY(featureId,propertyId,locale));
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
    CREATE TABLE location(id TEXT PRIMARY KEY,state TEXT,ownerOrganisationId TEXT);
    CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,facts TEXT);
    CREATE TABLE locationSharedRevision(id TEXT PRIMARY KEY,locationId TEXT,corrections TEXT);
    CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY,locationId TEXT,factsRevisionId TEXT,acceptancePolicy TEXT,acceptedOverrides TEXT);
    INSERT INTO project VALUES ('p','org');
    INSERT INTO property VALUES ('paid','boolean','public','ToggleField');
    INSERT INTO feature VALUES ('f',NULL,0,'p');
    INSERT INTO featureI18n(featureId,locale,title) VALUES ('f','en','Original'),('f','zh-hant','原名');`)
  db.prepare('UPDATE feature SET nameTemplate=?').run(
    JSON.stringify({
      rule,
      baseNames: { en: 'Bakery', 'zh-Hant': '麵包店' },
      overrides: { 'zh-Hant': '自訂' },
    }),
  )
  db.exec(readFileSync('migrations/0220_feature_name_materialization.sql', 'utf8'))
  db.exec(readFileSync('migrations/0224_feature_naming_toggle_fields.sql', 'utf8'))
  db.exec(readFileSync('migrations/0225_feature_naming_text_presence.sql', 'utf8'))
  db.exec(readFileSync('migrations/0226_feature_naming_text_values.sql', 'utf8'))
  db.exec(readFileSync('migrations/0228_feature_naming_phone_values.sql', 'utf8'))
  db.exec(readFileSync('migrations/0230_feature_naming_local_phone.sql', 'utf8'))
  db.exec(
    "ALTER TABLE feature ADD COLUMN organisationId TEXT; UPDATE feature SET organisationId='org'; CREATE TABLE organisation(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY)",
  )
  db.exec(readFileSync('migrations/0234_display_template_registry.sql', 'utf8'))
  db.exec(readFileSync('migrations/0235_feature_display_templates.sql', 'utf8'))
  return db
}

/** Read a single localized materialized row. */
function row(db: DatabaseSync, locale = 'en') {
  return db
    .prepare(
      "SELECT baseName,nameOverride,title FROM featureI18n WHERE featureId='f' AND locale=?",
    )
    .get(locale)
}

describe('persisted feature naming', () => {
  it('moves legacy localized inputs without losing empty overrides or changing rules', () => {
    const db = fixture()
    try {
      expect(row(db)).toEqual({
        baseName: 'Bakery',
        nameOverride: null,
        title: 'Bakery Unknown',
      })
      expect(row(db, 'zh-hant')).toEqual({
        baseName: '麵包店',
        nameOverride: '自訂',
        title: '自訂',
      })
      expect(
        JSON.parse(
          db.prepare('SELECT nameTemplate FROM feature').get()!.nameTemplate as string,
        ),
      ).toEqual({ rule })
      db.exec("UPDATE featureI18n SET nameOverride='' WHERE locale='en'")
      expect(row(db)!.title).toBe('')
    } finally {
      db.close()
    }
  })
  it('refreshes on base, property, visibility, override and rule edits without suffix accumulation', () => {
    const db = fixture()
    try {
      db.exec("INSERT INTO featureProperty VALUES ('f','paid','true')")
      expect(row(db)!.title).toBe('Bakery Paid')
      db.exec("UPDATE featureI18n SET baseName='Shop' WHERE locale='en'")
      db.exec("UPDATE featureProperty SET value='false'")
      expect(row(db)!.title).toBe('Shop Free')
      db.exec("UPDATE property SET audience='internal'")
      expect(row(db)!.title).toBe('Shop Free')
      db.exec("UPDATE featureI18n SET title='Forged generated title' WHERE locale='en'")
      expect(row(db)!.title).toBe('Shop Free')
      db.exec("UPDATE property SET dataType='text',component='ToggleField'")
      expect(row(db)!.title).toBe('Shop Free')
      db.exec("UPDATE featureProperty SET value='true'")
      expect(row(db)!.title).toBe('Shop Paid')
      db.exec("UPDATE property SET component='InputField'")
      expect(row(db)!.title).toBe('Shop Unknown')
      db.exec("UPDATE property SET component='ToggleField'")
      db.exec('DELETE FROM featureProperty')
      expect(row(db)!.title).toBe('Shop Unknown')
      db.exec('UPDATE feature SET nameTemplate=NULL')
      expect(row(db)!.title).toBe('Shop')
      expect(row(db, 'zh-hant')!.title).toBe('麵包店')
      db.exec("UPDATE featureI18n SET baseName='Direct name' WHERE locale='en'")
      expect(row(db)!.title).toBe('Direct name')
    } finally {
      db.close()
    }
  })
  it('uses accepted location names, follows accepted changes and leaves missing translations unresolved', () => {
    const db = fixture()
    try {
      db.prepare('UPDATE feature SET nameTemplate=?').run(
        JSON.stringify({ rule: { ...rule, base: 'location' } }),
      )
      expect(row(db)!.title).toBe('')
      db.exec(`INSERT INTO location VALUES ('loc','active',NULL);
        INSERT INTO locationRevision VALUES ('v1','loc','{"schemaVersion":1,"common":{"names":{"en":"Venue"}}}');
        INSERT INTO featureLocation VALUES ('f','loc','v1',NULL,NULL);`)
      expect(row(db)!.title).toBe('Venue Unknown')
      db.exec(
        `INSERT INTO locationRevision VALUES ('v2','loc','{"schemaVersion":1,"common":{"names":{"en":"Renamed"}}}');`,
      )
      expect(row(db)!.title).toBe('Venue Unknown')
      db.exec("UPDATE featureLocation SET factsRevisionId='v2'")
      expect(row(db)!.title).toBe('Renamed Unknown')
      db.exec(
        `UPDATE featureLocation SET acceptedOverrides='{"names":{"en":{"mode":"override","value":"Local"}}}'`,
      )
      expect(row(db)!.title).toBe('Local Unknown')
      db.exec(
        `UPDATE featureLocation SET acceptedOverrides='{"names":{"en":{"mode":"clear"}}}'`,
      )
      expect(row(db)!.title).toBe('')
      expect(row(db)!.baseName).toBe('Bakery')
      db.exec('DELETE FROM featureLocation')
      expect(row(db)!.title).toBe('')
    } finally {
      db.close()
    }
  })
  it('matches preview evaluation for ordered conditions and each boolean state', () => {
    const db = fixture()
    try {
      const ordered = {
        ...rule,
        conditions: [
          ...rule.conditions,
          {
            ...rule.conditions[0],
            locales: {
              en: {
                true: 'Prefix',
                false: '',
                null: '',
                placement: 'prefix' as const,
                separator: ': ',
              },
            },
          },
        ],
      }
      db.prepare('UPDATE feature SET nameTemplate=?').run(
        JSON.stringify({ rule: ordered }),
      )
      for (const value of [true, false, null]) {
        db.exec('DELETE FROM featureProperty')
        if (value !== null)
          db.prepare('INSERT INTO featureProperty VALUES (?,?,?)').run(
            'f',
            'paid',
            String(value),
          )
        expect(row(db)!.title).toBe(
          generateFeatureName({
            rule: ordered,
            locale: 'en',
            featureName: 'Bakery',
            properties: { paid: value },
          }),
        )
      }
      db.exec(
        "INSERT INTO feature(id,nameTemplate,isDraft,projectId) VALUES ('plain',NULL,0,'p'); INSERT INTO featureI18n(featureId,locale,title) VALUES ('plain','en','Plain')",
      )
      expect(
        db
          .prepare("SELECT baseName,title FROM featureI18n WHERE featureId='plain'")
          .get(),
      ).toEqual({ baseName: 'Plain', title: 'Plain' })
    } finally {
      db.close()
    }
  })
})

it('saves real accepted revisions against materialized titles and retains immutable history', async () => {
  const { lifecycleFixture } = await import('./fixtures/featureLifecycle')
  const { saveFeatureEdit, readCurrentFeatureRevision } = await import(
    '#lib/db/services/featureLifecycle.js'
  )
  const { sql } = await import('drizzle-orm')
  const f = lifecycleFixture()
  try {
    const initial = await f.initialize()
    const before = f.sqlite
      .prepare('SELECT content FROM featureRevision WHERE id=?')
      .get(initial.revisionId)
    f.sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,state TEXT,ownerOrganisationId TEXT);
      CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,facts TEXT);
      CREATE TABLE locationSharedRevision(id TEXT PRIMARY KEY,locationId TEXT,corrections TEXT);`)
    // Replace the plain-name fixture view with the production naming migration.
    // The schema-driven fixture already contains the two columns added by the migration.
    f.sqlite.exec(
      readFileSync('migrations/0220_feature_name_materialization.sql', 'utf8')
        .replace(
          /ALTER TABLE featureI18n ADD COLUMN (baseName|nameOverride) TEXT;/g,
          '',
        )
        .replace(
          'CREATE VIEW featureComputedName AS',
          'DROP VIEW featureComputedName; CREATE VIEW featureComputedName AS',
        ),
    )
    const command = {
      featureId: 'f',
      actorId: 'editor',
      guard: sql`1`,
      validate: () => [],
    }
    let current = await readCurrentFeatureRevision(f.db, command)
    await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: current!.revisionId,
      expectedVersion: current!.version,
      derive: content => {
        content.profile.nameTemplate = { rule }
        content.translations.en.title.value = 'Authored'
        return content
      },
    })
    expect(row(f.sqlite)!.title).toBe('Authored Unknown')
    current = await readCurrentFeatureRevision(f.db, command)
    expect(current!.content.translations.en.title.value).toBe('Authored')
    await saveFeatureEdit(f.db, {
      ...command,
      expectedRevisionId: current!.revisionId,
      expectedVersion: current!.version,
      derive: content => {
        content.translations.en.title.value = 'Edited'
        return content
      },
    })
    expect(row(f.sqlite)!.title).toBe('Edited Unknown')
    expect(
      f.sqlite
        .prepare('SELECT content FROM featureRevision WHERE id=?')
        .get(initial.revisionId),
    ).toEqual(before)
    expect(() =>
      f.sqlite.exec("UPDATE featureI18n SET baseName='Unaudited' WHERE featureId='f'"),
    ).toThrow('attributed revision')
    expect(() =>
      f.sqlite.exec("UPDATE featureI18n SET title='Forged' WHERE featureId='f'"),
    ).toThrow('attributed revision')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionWriteScope').get()!.n,
    ).toBe(0)
  } finally {
    f.sqlite.close()
  }
})

it('edits the authored base and localized override instead of feeding the displayed title back', async () => {
  const { toFeatureFormInput } = await import('#lib/client/services/feature.js')
  const form = toFeatureFormInput({
    id: 'f',
    nameTemplate: { rule },
    i18n: {
      en: { baseName: 'Bakery', title: 'Bakery Paid', nameOverride: 'Custom' },
      zhHant: { baseName: '麵包店', title: '收費：麵包店', nameOverride: null },
    },
  } as never)
  expect(form.data.i18n.en.title).toBe('Bakery')
  expect(form.data.i18n.zhHant.title).toBe('麵包店')
  expect(form.data.nameOverrides).toEqual({ en: 'Custom' })
})

it('materializes short-text presence with preview parity and localized refreshes', () => {
  const db = fixture()
  const presenceRule = {
    base: 'feature' as const,
    conditions: [
      {
        propertyId: 'caption',
        test: 'hasValue' as const,
        locales: {
          en: {
            true: 'Named',
            false: 'Unnamed',
            null: 'WRONG',
            placement: 'suffix' as const,
            separator: ' - ',
          },
        },
      },
    ],
  }
  try {
    db.exec("INSERT INTO property VALUES ('caption','text','internal','InputField')")
    db.prepare('UPDATE feature SET nameTemplate=?').run(
      JSON.stringify({ rule: presenceRule }),
    )
    for (const value of [
      null,
      '',
      '   ',
      '\t\n\u00a0',
      'false',
      '0',
      'Sign',
      '  Sign  ',
    ]) {
      db.exec("DELETE FROM featureProperty WHERE propertyId='caption'")
      if (value !== null)
        db.prepare('INSERT INTO featureProperty VALUES (?,?,?)').run(
          'f',
          'caption',
          value,
        )
      expect(row(db)!.title).toBe(
        generateFeatureName({
          rule: presenceRule,
          locale: 'en',
          featureName: 'Bakery',
          properties: { caption: value },
        }),
      )
      expect(row(db)!.title).toBe(
        value?.trim() ? `Bakery - ${value}` : 'Bakery - Unnamed',
      )
    }
    db.exec("UPDATE featureProperty SET value=NULL WHERE propertyId='caption'")
    db.exec("INSERT INTO featurePropertyI18n VALUES ('f','caption','zh-Hant','招牌')")
    expect(row(db)!.title).toBe('Bakery - Unnamed')
    db.exec("INSERT INTO featurePropertyI18n VALUES ('f','caption','en','Caption')")
    expect(row(db)!.title).toBe('Bakery - Caption')
    db.exec("UPDATE featurePropertyI18n SET value='  ' WHERE locale='en'")
    expect(row(db)!.title).toBe('Bakery - Unnamed')
    db.exec("UPDATE featurePropertyI18n SET value='Caption' WHERE locale='en'")
    db.exec("DELETE FROM featurePropertyI18n WHERE locale='en'")
    expect(row(db)!.title).toBe('Bakery - Unnamed')
    db.exec("UPDATE featureProperty SET value='Caption' WHERE propertyId='caption'")
    expect(row(db)!.title).toBe('Bakery - Caption')
    db.exec("UPDATE property SET component='ToggleField' WHERE id='caption'")
    expect(row(db)!.title).toBe('Bakery - Unnamed')
  } finally {
    db.close()
  }
})

it('materializes phone values and the missing-phone fallback', () => {
  const db = fixture()
  try {
    db.exec("INSERT INTO property VALUES ('phone','text','internal','PhoneField')")
    const phoneRule: FeatureNameRule = {
      base: 'feature',
      conditions: [
        {
          propertyId: 'phone',
          test: 'hasValue',
          locales: {
            en: {
              true: '',
              false: 'No phone',
              null: '',
              placement: 'suffix',
              separator: ' - ',
            },
          },
        },
      ],
    }
    db.prepare('UPDATE feature SET nameTemplate=?').run(
      JSON.stringify({ rule: phoneRule }),
    )
    expect(row(db)!.title).toBe('Bakery - No phone')
    db.exec("INSERT INTO featureProperty VALUES ('f','phone','+852 2345 6789')")
    expect(row(db)!.title).toBe('Bakery - 2345 6789')
    db.prepare("UPDATE featureProperty SET value=? WHERE propertyId='phone'").run(
      JSON.stringify(['+85222505339', '+85299999999']),
    )
    expect(row(db)?.title).toBe('Bakery - 22505339')
    db.prepare("UPDATE featureProperty SET value=? WHERE propertyId='phone'").run(
      '+44 12345678',
    )
    expect(row(db)?.title).toBe('Bakery - +44 12345678')
    // The editor preview must decode the same first phone as the persisted SQL view.
    for (const value of [
      '[]',
      '[""]',
      '[null]',
      '  ',
      '["+85222505339","+85299999999"]',
      '+44 12345678',
    ]) {
      db.prepare("UPDATE featureProperty SET value=? WHERE propertyId='phone'").run(
        value,
      )
      const preview = generateFeatureName({
        rule: phoneRule,
        locale: 'en',
        featureName: 'Bakery',
        properties: { phone: featureNameTextValue(value, 'PhoneField') },
      })
      expect(preview).toBe(row(db)!.title)
      if (!featureNameTextValue(value, 'PhoneField').trim())
        expect(preview).toBe('Bakery - No phone')
    }
    // An empty fallback must suppress the phone separator/icon as well as the empty value.
    phoneRule.conditions[0].locales.en.false = ''
    phoneRule.conditions[0].locales.en.separator = ' 📱'
    db.prepare('UPDATE feature SET nameTemplate=?').run(
      JSON.stringify({ rule: phoneRule }),
    )
    db.exec("UPDATE featureProperty SET value='[]' WHERE propertyId='phone'")
    expect(row(db)!.title).toBe('Bakery')
    expect(
      generateFeatureName({
        rule: phoneRule,
        locale: 'en',
        featureName: 'Bakery',
        properties: { phone: featureNameTextValue('[]', 'PhoneField') },
      }),
    ).toBe('Bakery')
    expect(featureNameTextValue('[]', 'InputField')).toBe('[]')
  } finally {
    db.close()
  }
})

it('materializes central output through the real naming triggers and drops a foreign owner', () => {
  const db = fixture()
  try {
    db.exec(
      `BEGIN;
       INSERT INTO organisation(id) VALUES('org'); INSERT INTO user(id) VALUES('editor');
       INSERT INTO displayTemplate(id,organisationId,code,version) VALUES('central','org','central',1);
       INSERT INTO displayTemplateRevision VALUES('central',1,'{}','editor','2026-11-12'); COMMIT;`,
    )
    db.prepare('UPDATE feature SET nameTemplate=? WHERE id=?').run(
      JSON.stringify({
        rule: {
          base: 'feature',
          conditions: [],
          registry: { id: 'central', version: 1 },
        },
      }),
      'f',
    )
    db.exec(
      "INSERT INTO featureDisplayTemplateOutput VALUES('f','en','central',1,'AROME - Central')",
    )
    expect(row(db)?.title).toBe('AROME - Central')
    expect(row(db)?.baseName).toBe('Bakery')
    db.exec(
      "UPDATE featureI18n SET nameOverride='' WHERE featureId='f' AND locale='en'",
    )
    expect(row(db)?.title).toBe('')
    db.exec(
      "UPDATE featureI18n SET nameOverride=NULL WHERE featureId='f' AND locale='en'; UPDATE feature SET organisationId='other' WHERE id='f'",
    )
    expect(row(db)?.title).toBe('Bakery')
  } finally {
    db.close()
  }
})
