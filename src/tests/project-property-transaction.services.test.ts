// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { sql, getTableColumns, getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createPropertyValues,
  listResolvedProjectProperties,
  seedDefaultInheritedPropertiesForProject,
  syncProjectInheritedProperties,
  upsertProjectProperties,
  syncHubProperties,
  syncOrganisationProperties,
} from '#lib/db/services/property.js'
import * as schema from '#lib/db/schema/index.js'
import {
  createProject,
  updateProjectByIdWithConcurrency,
} from '#lib/db/services/project.js'
import {
  toSubmittedLocalPropertiesWithProjectId,
  mergeProjectInheritedPropertySyncItems,
} from '#lib/api/services/project.js'
import { syncProjectLayerPresentation } from '#lib/db/services/layer.js'
import { createDefaultProjectLicense } from '#lib/db/services/licence.js'
import { createHub, updateHubByIdWithConcurrency } from '#lib/db/services/hub.js'
import {
  createOrganisation,
  updateOrganisationByIdWithConcurrency,
} from '#lib/db/services/organisation.js'
// FIXTURES
import { createOrganisationUserTables } from './fixtures/organisationUserTables.js'
import { listOrganisationPropertyHistory } from '#lib/db/services/propertyCatalogRevision.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ProjectPropertyForm } from '#lib/db/zod/schema/property.types.js'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
let writeParameterCounts: number[]
let beforeBatch: (() => void) | undefined
beforeEach(() => {
  batches = []
  writeParameterCounts = []
  beforeBatch = undefined
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  // Include every real selected column so nested hydration runs through Drizzle SQL.
  for (const table of [
    schema.user,
    schema.hubRole,
    schema.hubI18n,
    schema.organisationRole,
    schema.organisationI18n,
    schema.feature,
    schema.task,
    schema.project,
    schema.projectProperty,
    schema.organisation,
    schema.organisationProperty,
    schema.hub,
    schema.hubProperty,
    schema.layer,
    schema.layerProperty,
    schema.property,
    schema.featureProperty,
    schema.featurePropertyI18n,
    schema.propertyI18n,
    schema.propertyValue,
    schema.propertyValueI18n,
  ]) {
    // Enforce the actual property-child cascade edges exercised by these transaction tests.
    const columns = Object.values(getTableColumns(table)).map(column => {
      const parent =
        (table === schema.propertyValue ||
          table === schema.propertyI18n ||
          table === schema.hubProperty ||
          table === schema.organisationProperty) &&
        column.name === 'propertyId'
          ? ' REFERENCES property(id) ON DELETE CASCADE'
          : table === schema.propertyValueI18n && column.name === 'propertyValueId'
            ? ' REFERENCES propertyValue(id) ON DELETE CASCADE'
            : ''
      const contractDefault =
        table === schema.property
          ? (
              {
                dataType: 'text',
                cardinality: 'one',
                presentation: 'text',
                audience: 'public',
                dateResolution: 'day',
                timeMaxHour: '24',
              } as Record<string, string>
            )[column.name]
          : undefined
      return `"${column.name}" ${column.getSQLType()}${parent}${contractDefault ? ` NOT NULL DEFAULT '${contractDefault}'` : ''}`
    })
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(', ')})`)
  }
  createOrganisationUserTables(sqlite)
  sqlite.exec(`CREATE UNIQUE INDEX layer_property_unique ON layerProperty(layerId, propertyId);
    CREATE UNIQUE INDEX organisation_role_key ON organisationRole(organisationId,userId);
    CREATE UNIQUE INDEX organisation_id ON organisation(id);
    CREATE UNIQUE INDEX property_id ON property(id);
    CREATE UNIQUE INDEX hub_property_key ON hubProperty(hubId, propertyId);
    CREATE UNIQUE INDEX organisation_property_key ON organisationProperty(organisationId, propertyId);
    CREATE UNIQUE INDEX property_value_id ON propertyValue(id);
    CREATE UNIQUE INDEX property_value_i18n_key ON propertyValueI18n(propertyValueId, locale);
    CREATE UNIQUE INDEX project_property_unique ON projectProperty(projectId, propertyId);
    INSERT INTO hub (id, code) VALUES ('core', 'core'), ('scoped', 'scoped'), ('outside', 'outside');
    INSERT INTO organisation (id, hubId) VALUES ('org', 'scoped');
    INSERT INTO hubRole(hubId,userId,role) VALUES ('scoped','old','admin');
    INSERT INTO organisationRole(organisationId,userId,role) VALUES ('org','old','owner');
    INSERT INTO project (id, organisationId) VALUES ('project', 'org'), ('other-project', NULL);
    INSERT INTO layer (id, projectId) VALUES ('layer', 'project'), ('second', 'project'), ('other-layer', 'other-project');
    INSERT INTO layerProperty VALUES ('layer', 'old', 1, 1), ('other-layer', 'other', 1, 0);
    INSERT INTO projectProperty VALUES ('project', 'old', 1, 0, 9), ('other-project', 'other', 1, 1, 0);
    INSERT INTO property (id, key, scope, organisationId, hubId, projectId, isDefaultEnabled) VALUES
      ('old', 'old', 'organisation', 'org', NULL, NULL, 0),
      ('new', 'new', 'hub', NULL, 'scoped', NULL, 0),
      ('local', 'local', 'project', NULL, NULL, 'project', 0),
      ('core-prop', 'core-prop', 'hub', NULL, 'core', NULL, 1),
      ('outside-prop', 'outside-prop', 'hub', NULL, 'outside', NULL, 1),
      ('linked-org', 'linked-org', 'organisation', 'other-org', NULL, NULL, 1),
      ('linked-hub', 'linked-hub', 'hub', NULL, 'outside', NULL, 1);
    UPDATE property SET type = 'classifier', component = 'SelectField', isTranslatable = 1,
      isUserContributable = 1, createdAt = '2026-09-08T00:00:00.000Z', modifiedAt = '2026-09-08T00:00:00.000Z';
    INSERT INTO organisationProperty (organisationId, propertyId, rank) VALUES ('org', 'linked-org', 0);
    INSERT INTO hubProperty (hubId, propertyId, rank) VALUES ('scoped', 'linked-hub', 0)`)
  db = drizzle(
    {
      prepare: (sql: string) => ({
        bind: (...params: never[]) => ({
          sql,
          params,
          run: async () => {
            writeParameterCounts.push(params.length)
            if (params.length > 100) throw new Error('D1 parameter budget exceeded')
            sqlite.prepare(sql).run(...params)
            return { success: true, meta: {} }
          },
          raw: async () => {
            const statement = sqlite.prepare(sql)
            statement.setReturnArrays(true)
            return statement.all(...params)
          },
          all: async () => ({
            results: sqlite.prepare(sql).all(...params),
            success: true,
            meta: {},
          }),
        }),
      }),
      batch: async (statements: { sql: string; params: never[] }[]) => {
        batches.push(statements.length)
        beforeBatch?.()
        sqlite.exec('BEGIN')
        try {
          const results = statements.map(({ sql, params }) => {
            writeParameterCounts.push(params.length)
            if (params.length > 100) throw new Error('D1 parameter budget exceeded')
            return { results: sqlite.prepare(sql).all(...params) }
          })
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as never,
    { schema },
  ) as Database
})
afterEach(() => sqlite.close())

/** Captures every layer's settings for rollback and cross-layer isolation checks. */
function snapshot() {
  return {
    assignments: sqlite
      .prepare('SELECT * FROM projectProperty ORDER BY projectId, propertyId')
      .all(),
    links: sqlite
      .prepare('SELECT * FROM layerProperty ORDER BY layerId, propertyId')
      .all(),
  }
}

describe.each(['hub', 'organisation'] as const)(
  '%s property catalog transactions',
  scope => {
    const ownerId = scope === 'hub' ? 'scoped' : 'org'
    const retainedId = scope === 'hub' ? 'new' : 'old'
    const linkTable = scope === 'hub' ? 'hubProperty' : 'organisationProperty'
    const ownerColumn = scope === 'hub' ? 'hubId' : 'organisationId'

    /** Calls the public catalog service for each supported parent scope. */
    const save = (properties: Array<Record<string, unknown>>) =>
      scope === 'hub'
        ? syncHubProperties(db, { hubId: ownerId, properties })
        : syncOrganisationProperties(db, { organisationId: ownerId, properties })

    /** Captures every property subtree and catalog link for full rollback assertions. */
    const catalogSnapshot = () => ({
      properties: sqlite.prepare('SELECT * FROM property ORDER BY id').all(),
      i18n: sqlite
        .prepare('SELECT * FROM propertyI18n ORDER BY propertyId, locale')
        .all(),
      values: sqlite.prepare('SELECT * FROM propertyValue ORDER BY id').all(),
      valueI18n: sqlite
        .prepare('SELECT * FROM propertyValueI18n ORDER BY propertyValueId, locale')
        .all(),
      hubs: sqlite
        .prepare('SELECT * FROM hubProperty ORDER BY hubId, propertyId')
        .all(),
      organisations: sqlite
        .prepare(
          'SELECT * FROM organisationProperty ORDER BY organisationId, propertyId',
        )
        .all(),
    })

    const formProperties = [
      {
        key: 'form_property',
        component: 'SelectField',
        i18n: { en: { label: 'Form property' } },
        values: [{ value: 'option', i18n: { en: { value: 'Option' } } }],
      },
    ]
    it.each([false, true])(
      'replaces a removed field with the same API key atomically (failure=%s)',
      async fail => {
        sqlite.exec(
          `CREATE UNIQUE INDEX catalog_key ON property(scope, ${ownerColumn}, key)`,
        )
        const previousKey = retainedId
        const before = catalogSnapshot()
        if (fail)
          sqlite.exec(
            `CREATE TRIGGER fail_replacement_translation BEFORE INSERT ON propertyI18n WHEN NEW.propertyId='replacement' BEGIN SELECT RAISE(ABORT,'replacement translation failed'); END`,
          )
        const saving = save([
          {
            id: 'replacement',
            key: previousKey,
            component: 'SelectField',
            i18n: {
              en: { label: 'Hits' },
              ko: { label: '히트곡' },
              ja: { label: '', placeholder: ' ', labelGen: true },
            },
            values: [
              {
                value: 'my',
                i18n: {
                  en: { value: 'My' },
                  ko: { value: '내' },
                  ja: { value: '', valueGen: true },
                },
              },
            ],
          },
        ])
        if (fail) {
          await expect(saving).rejects.toThrow('replacement translation failed')
          expect(catalogSnapshot()).toEqual(before)
        } else {
          await expect(saving).resolves.toBeDefined()
          expect(
            sqlite.prepare('SELECT id FROM property WHERE id=?').get(retainedId),
          ).toBeUndefined()
          expect(
            sqlite.prepare('SELECT key FROM property WHERE id=?').get('replacement'),
          ).toEqual({ key: previousKey })
          expect(
            sqlite
              .prepare('SELECT label FROM propertyI18n WHERE propertyId=? AND locale=?')
              .get('replacement', 'ko'),
          ).toEqual({ label: '히트곡' })
          expect(
            sqlite
              .prepare(
                "SELECT count(*) n FROM propertyI18n WHERE propertyId='replacement' AND locale='ja'",
              )
              .get(),
          ).toEqual({ n: 0 })
          expect(
            sqlite
              .prepare(
                "SELECT count(*) n FROM propertyValueI18n i JOIN propertyValue v ON v.id=i.propertyValueId WHERE v.propertyId='replacement' AND i.locale='ja'",
              )
              .get(),
          ).toEqual({ n: 0 })
        }
        expect(batches).toHaveLength(1)
      },
    )

    it('retains existing phone strings when switching an input to PhoneField', async () => {
      sqlite
        .prepare(
          "UPDATE property SET component='InputField',dataType='text',isTranslatable=0 WHERE id=?",
        )
        .run(retainedId)
      sqlite
        .prepare(
          "INSERT INTO featureProperty(featureId,propertyId,value) VALUES ('feature',?, '+852 9123 4567')",
        )
        .run(retainedId)
      await save([
        {
          id: retainedId,
          key: retainedId,
          component: 'PhoneField',
          dataType: 'text',
          isTranslatable: false,
          i18n: {},
          values: [],
        },
      ])
      expect(
        sqlite.prepare('SELECT component FROM property WHERE id=?').get(retainedId),
      ).toEqual({ component: 'PhoneField' })
      expect(
        sqlite
          .prepare('SELECT value FROM featureProperty WHERE propertyId=?')
          .get(retainedId),
      ).toEqual({ value: '+852 9123 4567' })
    })

    it('rejects changing a populated Range field to Dropdown before writing translations or options', async () => {
      sqlite
        .prepare(
          "UPDATE property SET component='RangeField',dataType='number' WHERE id=?",
        )
        .run(retainedId)
      sqlite
        .prepare(
          "INSERT INTO featureProperty(featureId,propertyId,value) VALUES ('feature',?, '2')",
        )
        .run(retainedId)
      const before = catalogSnapshot()
      await expect(
        save([
          {
            id: retainedId,
            key: retainedId,
            component: 'SelectField',
            dataType: 'text',
            i18n: { en: { label: 'Grade' }, ja: { label: 'グレード' } },
            values: [
              {
                value: 'hits',
                i18n: { en: { value: 'Hits' }, ja: { value: 'ヒット曲' } },
              },
            ],
          },
        ]),
      ).rejects.toMatchObject({
        status: 400,
        body: { message: 'PROPERTY_CONTRACT_HAS_VALUES' },
      })
      expect(catalogSnapshot()).toEqual(before)
      expect(batches).toHaveLength(0)
    })

    const hubData = {
      code: 'changed',
      domain: null,
      legalContactAddress: null,
      subscriptionService: 'substack',
      subscriptionId: null,
      subscriptionSessionCookie: null,
      subscriptionPlacement: { hubPanel: false, topBar: false, menu: true },
    }
    const updateParent = () =>
      scope === 'hub'
        ? updateHubByIdWithConcurrency(db, {
            id: ownerId,
            updatedAt: 'before',
            data: hubData,
            properties: formProperties,
            userRoles: [{ userId: 'new-user', role: 'admin' }],
          })
        : updateOrganisationByIdWithConcurrency(db, {
            id: ownerId,
            updatedAt: 'before',
            data: { code: 'changed', url: null },
            properties: formProperties,
            userRoles: [{ userId: 'new-user', role: 'owner' }],
          })
    const createParent = () =>
      scope === 'hub'
        ? createHub(
            db,
            { ...hubData, id: 'created' },
            {
              properties: formProperties,
              userRoles: [{ userId: 'new-user', role: 'admin' }],
            },
          )
        : createOrganisation(
            db,
            { id: 'created', code: 'created', settings: {} },
            {
              properties: formProperties,
              userRoles: [{ userId: 'new-user', role: 'owner' }],
            },
          )
    const formSnapshot = () => ({
      catalog: catalogSnapshot(),
      parents: sqlite.prepare(`SELECT * FROM ${scope} ORDER BY id`).all(),
      roles: sqlite.prepare(`SELECT * FROM ${scope}Role ORDER BY userId`).all(),
    })

    it.each([false, true])(
      'updates parent and catalog atomically with parent failure %s',
      async fail => {
        sqlite.exec(`UPDATE ${scope} SET modifiedAt='before' WHERE id='${ownerId}'`)
        if (fail)
          sqlite.exec(
            `CREATE TRIGGER fail_parent BEFORE UPDATE ON ${scope} BEGIN SELECT RAISE(ABORT,'parent failure'); END`,
          )
        const before = formSnapshot()
        if (fail) {
          await expect(updateParent()).rejects.toThrow('parent failure')
          expect(formSnapshot()).toEqual(before)
        } else {
          expect(await updateParent()).toMatchObject({ id: ownerId })
          expect(
            sqlite.prepare(`SELECT code FROM ${scope} WHERE id=?`).get(ownerId),
          ).toEqual({ code: 'changed' })
          expect(
            sqlite
              .prepare(
                `SELECT count(*) n FROM property WHERE ${ownerColumn}=? AND key='form_property'`,
              )
              .get(ownerId),
          ).toEqual({ n: 1 })
        }
        expect(batches).toHaveLength(1)
      },
    )

    it('fences a parent revision change after catalog preparation', async () => {
      sqlite.exec(`UPDATE ${scope} SET modifiedAt='before' WHERE id='${ownerId}'`)
      let before: ReturnType<typeof formSnapshot>
      beforeBatch = () => {
        sqlite.exec(`UPDATE ${scope} SET modifiedAt='concurrent' WHERE id='${ownerId}'`)
        before = formSnapshot()
      }
      expect(await updateParent()).toBeNull()
      expect(formSnapshot()).toEqual(before!)
      expect(batches).toHaveLength(1)
    })

    it.each([false, true])(
      'creates parent and catalog atomically with late translation failure %s',
      async fail => {
        if (fail)
          sqlite.exec(
            "CREATE TRIGGER fail_translation BEFORE INSERT ON propertyValueI18n BEGIN SELECT RAISE(ABORT,'translation failure'); END",
          )
        const before = formSnapshot()
        if (fail) {
          await expect(createParent()).rejects.toThrow('translation failure')
          expect(formSnapshot()).toEqual(before)
        } else {
          expect(await createParent()).toMatchObject({ id: 'created' })
          expect(
            sqlite
              .prepare(`SELECT count(*) n FROM property WHERE ${ownerColumn}='created'`)
              .get(),
          ).toEqual({ n: 1 })
        }
        expect(batches).toHaveLength(1)
      },
    )

    it('saves ranked hydrated properties with generated value IDs and server-owned parents', async () => {
      const result = await save([
        {
          id: retainedId,
          key: 'retained',
          component: 'SelectField',
          rank: 9,
          createdAt: 'spoofed',
          modifiedAt: 'spoofed',
          i18n: {},
          projectId: 'spoofed',
          hubId: 'spoofed',
          organisationId: 'spoofed',
          values: [{ value: 'retained-value', i18n: { en: { value: 'Retained' } } }],
        },
        {
          key: 'created',
          component: 'SelectField',
          rank: 1,
          i18n: { en: { label: 'Created' } },
          values: [{ value: 'new-value', i18n: { en: { value: 'New' } } }],
        },
      ])
      expect(result.map(row => [row.key, row.rank])).toEqual([
        ['created', 0],
        ['retained', 1],
      ])
      expect(result[0].values?.[0].i18n?.en?.value).toBe('New')
      expect(result[1].values?.[0].i18n?.en?.value).toBe('Retained')
      expect(result[1]).toMatchObject({
        scope,
        projectId: null,
        hubId: scope === 'hub' ? ownerId : null,
        organisationId: scope === 'organisation' ? ownerId : null,
        createdAt: '2026-09-08T00:00:00.000Z',
      })
      expect(result[1].modifiedAt).not.toBe('spoofed')
      expect(
        sqlite
          .prepare(
            `SELECT propertyId, rank FROM ${linkTable} WHERE ${ownerColumn} = ? ORDER BY rank`,
          )
          .all(ownerId),
      ).toEqual(result.map(row => ({ propertyId: row.id, rank: row.rank })))
      expect(batches).toHaveLength(1)
    })

    it('rolls back the catalog and its children when the final rank link fails', async () => {
      sqlite.exec(`CREATE TRIGGER reject_rank BEFORE INSERT ON ${linkTable}
      WHEN NEW.propertyId = '${retainedId}'
      BEGIN SELECT RAISE(ABORT, 'injected rank failure'); END`)
      const before = catalogSnapshot()
      await expect(
        save([
          {
            id: retainedId,
            key: 'changed',
            component: 'SelectField',
            rank: 9,
            i18n: {},
            values: [{ value: 'changed', i18n: { en: { value: 'Changed' } } }],
          },
          {
            id: 'created',
            key: 'created',
            component: 'SelectField',
            rank: 0,
            i18n: {},
            values: [],
          },
        ]),
      ).rejects.toThrow()
      expect(catalogSnapshot()).toEqual(before)
      expect(batches).toHaveLength(1)
    })

    it('rejects a property moved out of the catalog after the initial read', async () => {
      let before = catalogSnapshot()
      beforeBatch = () => {
        sqlite
          .prepare(`UPDATE property SET ${ownerColumn} = ? WHERE id = ?`)
          .run('outside', retainedId)
        before = catalogSnapshot()
      }
      await expect(
        save([
          {
            id: retainedId,
            key: 'changed',
            component: 'SelectField',
            i18n: {},
            values: [],
          },
        ]),
      ).rejects.toThrow()
      expect(catalogSnapshot()).toEqual(before)
    })

    it('rejects a value owned by another property without changing either catalog', async () => {
      sqlite.exec(
        "INSERT INTO propertyValue VALUES ('foreign-value', 'local', 0, 'unchanged')",
      )
      const before = catalogSnapshot()
      await expect(
        save([
          {
            id: retainedId,
            key: 'changed',
            component: 'SelectField',
            i18n: {},
            values: [{ id: 'foreign-value', value: 'changed' }],
          },
        ]),
      ).rejects.toThrow()
      expect(catalogSnapshot()).toEqual(before)
    })

    it('clears only owned property records and the target catalog links', async () => {
      const before = catalogSnapshot()
      expect(await save([])).toEqual([])
      expect(catalogSnapshot().properties).toEqual(
        before.properties.filter(row => row.id !== retainedId),
      )
      expect(
        sqlite
          .prepare(`SELECT * FROM ${linkTable} WHERE ${ownerColumn} = ?`)
          .all(ownerId),
      ).toEqual([])
      // Linked properties belonging to another owner remain intact after unlinking.
      expect(catalogSnapshot().properties.some(row => row.id === 'linked-hub')).toBe(
        true,
      )
      expect(catalogSnapshot().properties.some(row => row.id === 'linked-org')).toBe(
        true,
      )
    })

    it('keeps a large catalog and every rank write in one parameter-bounded batch', async () => {
      const result = await save(
        Array.from({ length: 150 }, (_, rank) => ({
          id: `catalog-${rank}`,
          key: `catalog${rank}`,
          component: 'SelectField',
          rank,
          i18n: {},
          values: [],
        })),
      )
      expect(result).toHaveLength(150)
      expect(result.map(row => row.rank)).toEqual(
        Array.from({ length: 150 }, (_, i) => i),
      )
      expect(batches).toHaveLength(1)
      expect(batches[0]).toBeGreaterThan(100)
    })
  },
)

describe('local project property value translations', () => {
  /** Captures the complete property subtree, including unrelated catalog records. */
  const propertySnapshot = () => ({
    properties: sqlite.prepare('SELECT * FROM property ORDER BY id').all(),
    translations: sqlite
      .prepare('SELECT * FROM propertyI18n ORDER BY propertyId, locale')
      .all(),
    values: sqlite.prepare('SELECT * FROM propertyValue ORDER BY id').all(),
    valueTranslations: sqlite
      .prepare('SELECT * FROM propertyValueI18n ORDER BY propertyValueId, locale')
      .all(),
  })

  it('rejects a failed translation write and restores the entire prior subtree', async () => {
    sqlite.exec(`INSERT INTO propertyValue VALUES ('existing', 'local', 0, 'original');
      INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) VALUES ('existing', 'en', 'Original', 0);
      INSERT INTO propertyI18n (propertyId, locale, label) VALUES ('local', 'en', 'Original label');
      CREATE TRIGGER reject_translation BEFORE INSERT ON propertyValueI18n
      WHEN NEW.value = 'Rejected'
      BEGIN SELECT RAISE(ABORT, 'injected translation failure'); END`)
    const before = propertySnapshot()
    await expect(
      upsertProjectProperties(
        db,
        [
          {
            id: 'local',
            scope: 'project',
            isEnabled: true,
            isDefaultEnabled: false,
            key: 'changed',
            component: 'SelectField',
            i18n: { en: { label: 'Changed', labelGen: false, placeholderGen: false } },
            values: [
              {
                id: 'existing',
                value: 'changed',
                i18n: { en: { value: 'Rejected', valueGen: false } },
              },
            ],
          } as ProjectPropertyForm,
        ],
        'project',
      ),
    ).rejects.toThrow()
    expect(propertySnapshot()).toEqual(before)
    expect(batches).toHaveLength(1)
  })

  it('rolls back earlier creates and updates when a later property write fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_later BEFORE INSERT ON property
      WHEN NEW.id = 'later'
      BEGIN SELECT RAISE(ABORT, 'injected property failure'); END`)
    const before = propertySnapshot()
    await expect(
      upsertProjectProperties(
        db,
        [
          {
            id: 'local',
            key: 'changed',
            component: 'SelectField',
            i18n: {},
            values: [],
          },
          { id: 'first', key: 'first', component: 'SelectField', i18n: {}, values: [] },
          { id: 'later', key: 'later', component: 'SelectField', i18n: {}, values: [] },
        ] as unknown as ProjectPropertyForm[],
        'project',
      ),
    ).rejects.toThrow()
    expect(propertySnapshot()).toEqual(before)
    expect(batches).toHaveLength(1)
  })

  it('creates a hydrated property subtree and preserves omitted values on retained properties', async () => {
    sqlite.exec("INSERT INTO propertyValue VALUES ('existing', 'local', 0, 'keep')")
    const result = await upsertProjectProperties(
      db,
      [
        { id: 'local', key: 'local', component: 'SelectField', i18n: {} },
        {
          id: 'created',
          key: 'created',
          component: 'SelectField',
          projectId: 'spoofed',
          organisationId: 'spoofed',
          hubId: 'spoofed',
          i18n: { en: { label: 'Created' } },
          values: [
            { value: 'new', propertyId: 'spoofed', i18n: { en: { value: 'New' } } },
          ],
        },
      ] as ProjectPropertyForm[],
      'project',
    )
    expect(result.map(row => row.id)).toEqual(['created', 'local'])
    expect(result[0]).toMatchObject({
      projectId: 'project',
      organisationId: null,
      hubId: null,
      i18n: { en: { label: 'Created' } },
      values: [{ propertyId: 'created', value: 'new', i18n: { en: { value: 'New' } } }],
    })
    expect(result[1].values).toEqual([
      expect.objectContaining({ id: 'existing', value: 'keep' }),
    ])
    expect(batches).toHaveLength(1)
  })

  it('rejects a supplied property ID owned outside the target project', async () => {
    const before = propertySnapshot()
    await expect(
      upsertProjectProperties(
        db,
        [
          {
            id: 'old',
            key: 'changed',
            component: 'SelectField',
            i18n: {},
            values: [],
          },
        ] as unknown as ProjectPropertyForm[],
        'project',
      ),
    ).rejects.toThrow()
    expect(propertySnapshot()).toEqual(before)
    expect(batches).toHaveLength(1)
  })

  it.each(['property', 'value'])(
    'rejects a retained %s moved out of scope before the batch',
    async target => {
      sqlite.exec(
        "INSERT INTO propertyValue VALUES ('existing', 'local', 0, 'original')",
      )
      let before = propertySnapshot()
      beforeBatch = () => {
        sqlite.exec(
          target === 'property'
            ? "UPDATE property SET projectId = 'other-project' WHERE id = 'local'"
            : "UPDATE propertyValue SET propertyId = 'old' WHERE id = 'existing'",
        )
        before = propertySnapshot()
      }
      await expect(
        upsertProjectProperties(
          db,
          [
            {
              id: 'local',
              key: 'changed',
              component: 'SelectField',
              i18n: {},
              values: [{ id: 'existing', value: 'changed' }],
            } as ProjectPropertyForm,
          ],
          'project',
        ),
      ).rejects.toThrow()
      expect(propertySnapshot()).toEqual(before)
    },
  )

  it('does not claim another property value through a supplied ID', async () => {
    sqlite.exec("INSERT INTO propertyValue VALUES ('foreign', 'old', 0, 'untouched')")
    const before = propertySnapshot()
    await expect(
      upsertProjectProperties(
        db,
        [
          {
            id: 'local',
            key: 'changed',
            component: 'SelectField',
            i18n: {},
            values: [{ id: 'foreign', value: 'changed' }],
          } as ProjectPropertyForm,
        ],
        'project',
      ),
    ).rejects.toThrow()
    expect(propertySnapshot()).toEqual(before)
  })

  it('validates later rows before executing any earlier writes', async () => {
    const before = propertySnapshot()
    await expect(
      upsertProjectProperties(
        db,
        [
          { id: 'new-local', key: 'valid', component: 'SelectField', i18n: {} },
          { id: 'local', key: 'invalid key', component: 'SelectField', i18n: {} },
        ] as ProjectPropertyForm[],
        'project',
      ),
    ).rejects.toThrow()
    expect(propertySnapshot()).toEqual(before)
    expect(batches).toEqual([])
  })

  it('clears only local properties and cascades child deletions atomically', async () => {
    sqlite.exec(`INSERT INTO propertyValue VALUES ('local-value', 'local', 0, 'local'), ('foreign', 'old', 0, 'foreign');
      INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen) VALUES ('local-value', 'en', 'Local', 0), ('foreign', 'en', 'Foreign', 0)`)
    expect(await upsertProjectProperties(db, [], 'project')).toEqual([])
    expect(propertySnapshot().values.map(row => row.id)).toEqual(['foreign'])
    expect(
      propertySnapshot().valueTranslations.map(row => row.propertyValueId),
    ).toEqual(['foreign'])
    expect(propertySnapshot().properties).toHaveLength(6)
  })

  it('keeps a large value and translation replacement in one parameter-safe batch', async () => {
    const [result] = await upsertProjectProperties(
      db,
      [
        {
          id: 'local',
          scope: 'project',
          isEnabled: true,
          isDefaultEnabled: false,
          key: 'local',
          component: 'SelectField',
          i18n: {},
          values: Array.from({ length: 250 }, (_, rank) => ({
            rank,
            value: `value-${rank}`,
            i18n: { en: { value: `Translation ${rank}`, valueGen: false } },
          })),
        } as ProjectPropertyForm,
      ],
      'project',
    )
    expect(result.values).toHaveLength(250)
    expect(propertySnapshot().valueTranslations).toHaveLength(250)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toBeGreaterThan(100)
  })

  it('keeps translations attached to new ID-less values after rank normalization', async () => {
    sqlite.exec(
      "INSERT INTO propertyValue (id, propertyId, rank, value) VALUES ('existing', 'local', 0, 'existing')",
    )
    const submitted = {
      isEnabled: true,
      isDefaultEnabled: false,
      id: 'local',
      scope: 'project',
      projectId: 'project',
      key: 'local',
      component: 'SelectField',
      i18n: {},
      values: [
        {
          rank: 20,
          value: 'second',
          i18n: { en: { value: 'Second', valueGen: false } },
        },
        {
          id: 'existing',
          rank: 10,
          value: 'existing',
          i18n: { en: { value: 'Existing', valueGen: false } },
        },
        {
          rank: 0,
          value: 'first',
          i18n: {
            en: { value: 'First', valueGen: false },
            zhHant: { value: '第一', valueGen: false },
          },
        },
      ],
    } as ProjectPropertyForm
    const original = structuredClone(submitted)
    const [result] = await upsertProjectProperties(db, [submitted], 'project')
    const values = sqlite.prepare('SELECT * FROM propertyValue ORDER BY rank').all()
    expect(values.map(row => [row.value, row.rank])).toEqual([
      ['first', 0],
      ['existing', 1],
      ['second', 2],
    ])
    const translations = sqlite
      .prepare(`SELECT propertyValue.value AS canonical,
      propertyValueI18n.locale, propertyValueI18n.value AS translation
      FROM propertyValueI18n JOIN propertyValue ON propertyValue.id = propertyValueI18n.propertyValueId
      ORDER BY propertyValue.rank, propertyValueI18n.locale`)
      .all()
    expect(translations).toEqual([
      { canonical: 'first', locale: 'en', translation: 'First' },
      { canonical: 'first', locale: 'zh-hant', translation: '第一' },
      { canonical: 'existing', locale: 'en', translation: 'Existing' },
      { canonical: 'second', locale: 'en', translation: 'Second' },
    ])
    expect(result.values).toHaveLength(3)
    expect(result.values?.find(row => row.value === 'first')?.i18n?.en?.value).toBe(
      'First',
    )
    expect(submitted).toEqual(original)
  })
})

describe('complete project property form transaction', () => {
  const data = {
    organisationId: 'org',
    code: 'updated',
    capabilities: {
      manageBakeries: false,
      manageVolunteers: false,
      manageDropOffs: false,
    },
    flags: {},
    cardStyleCode: null,
    markerStyleCode: null,
    useAllInOrgContext: false,
  }
  const properties = [
    {
      id: 'fresh',
      key: 'fresh',
      component: 'SelectField',
      i18n: { en: { label: 'Fresh' } },
      values: [],
      isDefaultEnabled: true,
    },
  ] as unknown as ProjectPropertyForm[]
  const relations = {
    properties,
    inheritedProperties: [
      { id: 'fresh', scope: 'project', isDefaultEnabled: true },
      { id: 'old', scope: 'organisation', isEnabled: true },
    ],
    layers: [
      { id: 'layer', rank: 9, isDefaultVisible: false },
      { id: 'second', rank: 10, isDefaultVisible: true },
    ],
  }
  const allRows = () =>
    [
      'project',
      'property',
      'propertyI18n',
      'propertyValue',
      'projectProperty',
      'layerProperty',
      'layer',
    ].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())

  it.each(['create', 'update'])(
    'retains assignment ranks and flags for ID-less properties during %s',
    async mode => {
      const submitted = [
        {
          key: 'z_first',
          component: 'SelectField',
          rank: 0,
          i18n: { en: { label: 'First' } },
          isDefaultEnabled: false,
        },
        {
          id: '',
          key: 'a_second',
          component: 'SelectField',
          rank: 1,
          i18n: { en: { label: 'Second' } },
          isDefaultEnabled: true,
        },
      ]
      const original = structuredClone(submitted)
      const target = mode === 'create' ? 'created' : 'project'
      const normalized = toSubmittedLocalPropertiesWithProjectId(submitted, target)
      const propertyRelations = {
        properties: normalized as unknown as ProjectPropertyForm[],
        inheritedProperties: mergeProjectInheritedPropertySyncItems(normalized),
      }
      if (mode === 'create')
        await createProject(
          db,
          { ...data, id: target, settings: {}, license: createDefaultProjectLicense() },
          propertyRelations,
        )
      else {
        sqlite.exec("UPDATE project SET modifiedAt='before' WHERE id='project'")
        await updateProjectByIdWithConcurrency(db, {
          id: target,
          updatedAt: 'before',
          data,
          ...propertyRelations,
        })
      }
      expect(
        sqlite
          .prepare(
            `SELECT p.key,a.rank,a.isEnabled,a.isDefaultEnabled FROM property p JOIN projectProperty a ON a.propertyId=p.id WHERE a.projectId=? ORDER BY a.rank`,
          )
          .all(target),
      ).toEqual([
        { key: 'z_first', rank: 0, isEnabled: 1, isDefaultEnabled: 0 },
        { key: 'a_second', rank: 1, isEnabled: 1, isDefaultEnabled: 1 },
      ])
      expect(submitted).toEqual(original)
    },
  )

  it.each([false, true])(
    'saves the catalog, assignments, core and layer presentation with late failure %s',
    async fail => {
      sqlite.exec("UPDATE project SET modifiedAt='before' WHERE id='project'")
      if (fail)
        sqlite.exec(
          "CREATE TRIGGER fail_presentation BEFORE UPDATE ON layer WHEN NEW.rank=10 BEGIN SELECT RAISE(ABORT,'late layer failure'); END",
        )
      const before = allRows()
      const saving = updateProjectByIdWithConcurrency(db, {
        id: 'project',
        updatedAt: 'before',
        data,
        ...relations,
      })
      if (fail) {
        await expect(saving).rejects.toThrow('late layer failure')
        expect(allRows()).toEqual(before)
      } else {
        expect(await saving).toMatchObject({ id: 'project' })
        expect(
          sqlite
            .prepare("SELECT count(*) n FROM layerProperty WHERE propertyId='fresh'")
            .get(),
        ).toEqual({ n: 2 })
        expect(
          sqlite
            .prepare("SELECT rank,isDefaultVisible FROM layer WHERE id='layer'")
            .get(),
        ).toEqual({ rank: 9, isDefaultVisible: 0 })
      }
      expect(batches).toHaveLength(1)
    },
  )

  it('fences a concurrent edit before any catalog or layer mutation', async () => {
    sqlite.exec("UPDATE project SET modifiedAt='before' WHERE id='project'")
    let before: ReturnType<typeof allRows>
    beforeBatch = () => {
      sqlite.exec("UPDATE project SET modifiedAt='concurrent' WHERE id='project'")
      before = allRows()
    }
    expect(
      await updateProjectByIdWithConcurrency(db, {
        id: 'project',
        updatedAt: 'before',
        data,
        ...relations,
      }),
    ).toBeNull()
    expect(allRows()).toEqual(before!)
  })

  it('resolves inherited catalogs from the destination after an organisation move', async () => {
    sqlite.exec(
      "INSERT INTO organisation(id,hubId) VALUES ('destination','outside'); UPDATE project SET modifiedAt='before' WHERE id='project'",
    )
    await updateProjectByIdWithConcurrency(db, {
      id: 'project',
      updatedAt: 'before',
      data: { ...data, organisationId: 'destination' },
      properties,
      inheritedProperties: [{ id: 'outside-prop', scope: 'hub', isEnabled: true }],
    })
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM layerProperty WHERE layerId='layer' AND propertyId='outside-prop'",
        )
        .get(),
    ).toEqual({ n: 1 })
    expect(
      sqlite
        .prepare(
          "SELECT count(*) n FROM layerProperty WHERE layerId='layer' AND propertyId='old'",
        )
        .get(),
    ).toEqual({ n: 0 })
    expect(
      sqlite.prepare("SELECT organisationId FROM project WHERE id='project'").get(),
    ).toEqual({ organisationId: 'destination' })
  })

  it.each([false, true])(
    'creates project and seeds defaults in one transaction with late failure %s',
    async fail => {
      if (fail)
        sqlite.exec(
          "CREATE TRIGGER fail_default BEFORE INSERT ON projectProperty WHEN NEW.propertyId='new' BEGIN SELECT RAISE(ABORT,'late seed failure'); END",
        )
      const before = allRows()
      const saving = createProject(
        db,
        {
          ...data,
          id: 'created',
          settings: {},
          license: createDefaultProjectLicense(),
        },
        { properties, seedInheritedDefaults: { hubId: 'scoped', startingRank: 1 } },
      )
      if (fail) {
        await expect(saving).rejects.toThrow('late seed failure')
        expect(allRows()).toEqual(before)
      } else {
        expect(await saving).toMatchObject({ id: 'created' })
        expect(
          sqlite.prepare("SELECT projectId FROM property WHERE id='fresh'").get(),
        ).toEqual({ projectId: 'created' })
        expect(
          sqlite
            .prepare("SELECT count(*) n FROM projectProperty WHERE projectId='created'")
            .get()!.n,
        ).toBeGreaterThan(0)
      }
      expect(batches).toHaveLength(1)
    },
  )
})

describe('standalone layer presentation transaction', () => {
  it('rolls back earlier layer changes on a later presentation failure', async () => {
    sqlite.exec(
      "CREATE TRIGGER fail_presentation BEFORE UPDATE ON layer WHEN NEW.id='second' BEGIN SELECT RAISE(ABORT,'presentation failure'); END",
    )
    const before = sqlite.prepare('SELECT * FROM layer ORDER BY id').all()
    await expect(
      syncProjectLayerPresentation(db, 'project', [
        { id: 'layer', rank: 9, isDefaultVisible: false },
        { id: 'second', rank: 10, isDefaultVisible: true },
      ]),
    ).rejects.toThrow('presentation failure')
    expect(sqlite.prepare('SELECT * FROM layer ORDER BY id').all()).toEqual(before)
  })

  it('updates owned layers only and ignores missing or foreign IDs', async () => {
    const outside = sqlite.prepare("SELECT * FROM layer WHERE id='other-layer'").get()
    await syncProjectLayerPresentation(db, 'project', [
      { id: 'layer', rank: 9, isDefaultVisible: false },
      { id: 'other-layer', rank: 10, isDefaultVisible: false },
      { id: 'missing', rank: 11, isDefaultVisible: false },
    ])
    expect(
      sqlite.prepare("SELECT rank,isDefaultVisible FROM layer WHERE id='layer'").get(),
    ).toEqual({ rank: 9, isDefaultVisible: 0 })
    expect(sqlite.prepare("SELECT * FROM layer WHERE id='other-layer'").get()).toEqual(
      outside,
    )
    expect(batches).toHaveLength(1)
  })
})

describe('project inherited default seeding', () => {
  it('preserves explicit assignments, appends missing defaults and is safe to retry', async () => {
    const before = snapshot()
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: 'project',
      hubId: 'scoped',
      startingRank: 2,
    })
    const after = snapshot()
    expect(after.assignments).toEqual([
      {
        projectId: 'other-project',
        propertyId: 'other',
        isEnabled: 1,
        isDefaultEnabled: 1,
        rank: 0,
      },
      {
        projectId: 'project',
        propertyId: 'core-prop',
        isEnabled: 1,
        isDefaultEnabled: 1,
        rank: 10,
      },
      {
        projectId: 'project',
        propertyId: 'new',
        isEnabled: 0,
        isDefaultEnabled: 0,
        rank: 11,
      },
      {
        projectId: 'project',
        propertyId: 'old',
        isEnabled: 1,
        isDefaultEnabled: 0,
        rank: 9,
      },
    ])
    expect(after.links).toEqual(before.links)
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: 'project',
      hubId: 'scoped',
      startingRank: 2,
    })
    expect(snapshot()).toEqual(after)
  })

  it('honors a rank offset above persisted ranks and keeps explicit disabled choices', async () => {
    sqlite.exec("INSERT INTO projectProperty VALUES ('project', 'core-prop', 0, 0, 1)")
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: 'project',
      hubId: 'scoped',
      startingRank: 30,
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'core-prop',
      isEnabled: 0,
      isDefaultEnabled: 0,
      rank: 1,
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'new',
      isEnabled: 0,
      isDefaultEnabled: 0,
      rank: 30,
    })
  })

  it('inserts large catalogs with a bounded parameter count and contiguous ranks', async () => {
    const insert = sqlite.prepare(
      "INSERT INTO property (id, key, scope, hubId, isDefaultEnabled) VALUES (?, ?, 'hub', 'scoped', 1)",
    )
    for (let i = 0; i < 250; i++) insert.run(`bulk-${i}`, `bulk-${i}`)
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: 'project',
      hubId: 'scoped',
    })
    const ranks = snapshot()
      .assignments.filter(row => row.projectId === 'project')
      .map(row => row.rank)
      .sort((a, b) => Number(a) - Number(b))
    expect(ranks).toEqual(Array.from({ length: 253 }, (_, i) => i + 9))
    expect(writeParameterCounts).toHaveLength(1)
    expect(writeParameterCounts[0]).toBeLessThanOrEqual(100)
  })

  it('rolls back every seeded row on an insertion failure', async () => {
    sqlite.exec(`CREATE TRIGGER reject_new_seed BEFORE INSERT ON projectProperty
      WHEN NEW.propertyId = 'new'
      BEGIN SELECT RAISE(ABORT, 'injected seed failure'); END`)
    const before = snapshot()
    await expect(
      seedDefaultInheritedPropertiesForProject(db, {
        projectId: 'project',
        hubId: 'scoped',
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('does nothing without an owning organisation, supplied hub or core hub', async () => {
    sqlite.exec("DELETE FROM hub WHERE code = 'core'")
    const before = snapshot()
    await seedDefaultInheritedPropertiesForProject(db, {
      projectId: 'other-project',
      hubId: null,
    })
    expect(snapshot()).toEqual(before)
  })
})

describe('project property cascade transaction integrity', () => {
  it('matches the read resolver across local, inherited, linked and core catalogs', async () => {
    await syncProjectInheritedProperties(db, {
      projectId: 'project',
      properties: [
        { id: 'new', scope: 'hub', isEnabled: true, isDefaultEnabled: false, rank: 2 },
        { id: 'old', scope: 'organisation', rank: 1 },
        { id: 'core-prop', scope: 'hub', isEnabled: false, rank: 3 },
      ],
    })
    const resolved = await listResolvedProjectProperties(db, 'project')
    const enabled = resolved.filter(row => row.scope === 'project' || row.isEnabled)
    const second = snapshot().links.filter(row => row.layerId === 'second')
    expect(second).toEqual(
      enabled
        .map(row => ({
          layerId: 'second',
          propertyId: row.id,
          isVisible: Number(Boolean(row.isDefaultEnabled)),
          isUserContributable: Number(Boolean(row.isDefaultEnabled)),
        }))
        .sort((a, b) => a.propertyId.localeCompare(b.propertyId)),
    )
    expect(second.map(row => row.propertyId)).toEqual([
      'linked-hub',
      'linked-org',
      'local',
      'new',
      'old',
    ])
    expect(snapshot().links).toContainEqual({
      layerId: 'layer',
      propertyId: 'old',
      isVisible: 1,
      isUserContributable: 1,
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'old',
      isEnabled: 1,
      isDefaultEnabled: 0,
      rank: 0,
    })
    expect(batches).toEqual([6])
  })

  it('rolls back parent flags, order, removal and creation when a child insertion fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON layerProperty
      WHEN NEW.layerId = 'second'
      BEGIN SELECT RAISE(ABORT, 'injected child failure'); END`)
    const before = snapshot()
    await expect(
      syncProjectInheritedProperties(db, {
        projectId: 'project',
        properties: [{ id: 'new', scope: 'hub', isEnabled: true }],
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(batches).toEqual([4])
  })

  it('rolls back earlier parent updates if a later assignment fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_new BEFORE INSERT ON projectProperty
      WHEN NEW.propertyId = 'new'
      BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END`)
    const before = snapshot()
    await expect(
      syncProjectInheritedProperties(db, {
        projectId: 'project',
        properties: [
          { id: 'old', scope: 'organisation', isEnabled: false },
          { id: 'new', scope: 'hub', isEnabled: true },
        ],
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('preserves omitted live flags and uses current layer membership at commit time', async () => {
    beforeBatch = () =>
      sqlite.exec(`UPDATE projectProperty SET isEnabled = 0, isDefaultEnabled = 1 WHERE projectId = 'project';
      UPDATE layer SET projectId = 'other-project' WHERE id = 'second';
      INSERT INTO layer (id, projectId) VALUES ('late', 'project')`)
    await syncProjectInheritedProperties(db, {
      projectId: 'project',
      properties: [{ id: 'old', scope: 'organisation' }],
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'old',
      isEnabled: 0,
      isDefaultEnabled: 1,
      rank: 0,
    })
    expect(snapshot().links.some(row => row.propertyId === 'old')).toBe(false)
    expect(snapshot().links.some(row => row.layerId === 'second')).toBe(false)
    expect(snapshot().links.some(row => row.layerId === 'late')).toBe(true)
  })

  it('restores inherited defaults on empty submission without changing other projects', async () => {
    const before = snapshot()
    await syncProjectInheritedProperties(db, { projectId: 'project', properties: [] })
    expect(snapshot().assignments).toEqual(
      before.assignments.filter(row => row.projectId === 'other-project'),
    )
    expect(snapshot().links.filter(row => row.layerId === 'other-layer')).toEqual(
      before.links.filter(row => row.layerId === 'other-layer'),
    )
    expect(
      snapshot()
        .links.filter(row => row.layerId === 'second')
        .map(row => row.propertyId),
    ).toEqual(['core-prop', 'linked-hub', 'linked-org', 'local'])
    expect(batches).toEqual([3])
  })

  it('keeps hundreds of parameter-bounded writes and the cascade in one transaction', async () => {
    const properties = Array.from({ length: 250 }, (_, i) => ({
      id: `bulk-${i}`,
      scope: 'project' as const,
    }))
    const insert = sqlite.prepare(
      "INSERT INTO property (id, key, scope, projectId, isDefaultEnabled) VALUES (?, ?, 'project', 'project', 0)",
    )
    for (const row of properties) insert.run(row.id, row.id)
    await syncProjectInheritedProperties(db, { projectId: 'project', properties })
    expect(snapshot().assignments).toHaveLength(251)
    expect(snapshot().links.filter(row => row.layerId === 'second')).toHaveLength(254)
    expect(batches).toEqual([253])
  })
})

it('persists structured metadata and rejects reinterpreting populated values', async () => {
  const definition = {
    id: 'links',
    key: 'links',
    component: 'LinkField',
    dataType: 'link',
    cardinality: 'many',
    presentation: 'numberedReferences',
    audience: 'public',
    isTranslatable: false,
    i18n: {},
    values: [],
  } as unknown as ProjectPropertyForm
  const saved = await upsertProjectProperties(db, [definition], 'project')
  expect(saved.find(row => row.id === 'links')).toMatchObject({
    dataType: 'link',
    cardinality: 'many',
    presentation: 'numberedReferences',
  })
  sqlite
    .prepare(
      'INSERT INTO featureProperty(featureId,propertyId,valueJson) VALUES (?,?,?)',
    )
    .run(
      'f',
      'links',
      JSON.stringify({
        version: 1,
        items: [{ id: 'a', url: 'https://example.org', label: { en: 'Example' } }],
      }),
    )
  await expect(
    upsertProjectProperties(db, [{ ...definition, cardinality: 'one' }], 'project'),
  ).rejects.toMatchObject({ status: 400 })
  expect(
    sqlite.prepare("SELECT cardinality FROM property WHERE id='links'").get()
      ?.cardinality,
  ).toBe('many')
})

it('keeps populated calendar coordinates tied to their resolution', async () => {
  const definition = {
    id: 'dates',
    key: 'dates',
    component: 'DateRangeField',
    dataType: 'dateRange',
    dateResolution: 'year',
    isTranslatable: false,
    cardinality: 'one',
    presentation: 'text',
    i18n: {},
    values: [],
  } as unknown as ProjectPropertyForm
  await upsertProjectProperties(db, [definition], 'project')
  sqlite
    .prepare(
      'INSERT INTO featureProperty(featureId,propertyId,valueJson) VALUES (?,?,?)',
    )
    .run('f', 'dates', JSON.stringify({ version: 1, start: 2020, end: 2024 }))
  await expect(
    upsertProjectProperties(db, [definition], 'project'),
  ).resolves.toBeDefined()
  await expect(
    upsertProjectProperties(
      db,
      [{ ...definition, dateResolution: 'month' }],
      'project',
    ),
  ).rejects.toMatchObject({ status: 400 })
})

describe('revisioned organisation field catalogue through the existing form', () => {
  /** Install additive revision storage on the schema-shaped fixture.
   * @returns Nothing; the fixture remains private to each test.
   */
  function enableHistory(): void {
    sqlite.exec(
      'CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT NOT NULL,origin TEXT NOT NULL,reason TEXT,createdAt TEXT NOT NULL)',
    )
    sqlite.exec(readFileSync('migrations/0173_organisation_revisions.sql', 'utf8'))
    sqlite.exec(readFileSync('migrations/0176_property_catalog_revisions.sql', 'utf8'))
    sqlite.exec(
      "UPDATE organisation SET code='org', modifiedAt='before' WHERE id='org'",
    )
  }
  const definition = {
    id: 'old',
    key: 'old',
    component: 'SelectField',
    dataType: 'text',
    cardinality: 'one',
    i18n: { en: { label: 'Category' }, zhHant: { label: '分類' } },
    values: [
      {
        id: 'choice',
        value: 'a',
        rank: 0,
        i18n: { en: { value: 'First' }, zhHant: { value: '第一' } },
      },
    ],
  }
  /** Save through the production organisation form service, including its concurrency fence.
   * @param properties Complete submitted catalogue.
   * @param updatedAt Expected parent revision.
   * @returns Persisted parent token or stale result.
   */
  function save(properties: Record<string, unknown>[], updatedAt: string) {
    return updateOrganisationByIdWithConcurrency(db, {
      id: 'org',
      actorId: 'editor',
      updatedAt,
      data: { code: 'org', url: null },
      properties,
    })
  }

  it('retains definition/option translations through edits, no-ops and removal', async () => {
    enableHistory()
    let saved = await save([definition], 'before')
    expect(saved).toBeTruthy()
    const initial = await listOrganisationPropertyHistory(db, {
      organisationId: 'org',
      hubId: 'scoped',
    })
    expect(initial.entries).toHaveLength(2)
    expect(initial.entries[0].actorId).toBe('editor')
    const beforeCount = sqlite
      .prepare('SELECT count(*) n FROM propertyCatalogRevision')
      .get()
    saved = await save([definition], saved!.modifiedAt)
    expect(
      sqlite.prepare('SELECT count(*) n FROM propertyCatalogRevision').get(),
    ).toEqual(beforeCount)
    saved = await save(
      [
        {
          ...definition,
          i18n: { en: { label: 'Updated category' }, zhHant: { label: '更新分類' } },
          values: [
            { ...definition.values[0], i18n: { en: { value: 'Updated option' } } },
          ],
        },
      ],
      saved!.modifiedAt,
    )
    const edited = await listOrganisationPropertyHistory(db, {
      organisationId: 'org',
      hubId: 'scoped',
    })
    expect(edited.entries[0].changes).toContainEqual({
      path: ['old', 'i18n', 'en', 'label'],
      before: { present: true, value: 'Category' },
      after: { present: true, value: 'Updated category' },
    })
    expect(edited.entries[0].changes).toContainEqual({
      path: ['old', 'values', 'choice', 'i18n', 'en', 'value'],
      before: { present: true, value: 'First' },
      after: { present: true, value: 'Updated option' },
    })
    await save([], saved!.modifiedAt)
    const removed = await listOrganisationPropertyHistory(db, {
      organisationId: 'org',
      hubId: 'scoped',
    })
    expect(removed.entries[0].changes[0]).toMatchObject({
      path: ['old'],
      before: { present: true },
      after: { present: false },
    })
    expect(
      sqlite.prepare("SELECT 1 FROM property WHERE id='old'").get(),
    ).toBeUndefined()
    expect(sqlite.prepare('SELECT * FROM propertyCatalogRevisionWrite').all()).toEqual(
      [],
    )
    expect(
      (
        await listOrganisationPropertyHistory(db, {
          organisationId: 'org',
          hubId: 'wrong',
        })
      ).entries,
    ).toEqual([])
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it.each(['stale', 'late-failure'])(
    'rolls back both histories and the field projection: %s',
    async mode => {
      enableHistory()
      if (mode === 'late-failure')
        sqlite.exec(
          "CREATE TRIGGER fail_catalog_receipt BEFORE DELETE ON propertyCatalogRevisionWrite BEGIN SELECT RAISE(ABORT,'late failure'); END",
        )
      const before = sqlite.prepare('SELECT * FROM property ORDER BY id').all()
      const pending = save([definition], mode === 'stale' ? 'wrong' : 'before')
      if (mode === 'stale') expect(await pending).toBeNull()
      else await expect(pending).rejects.toThrow('late failure')
      expect(sqlite.prepare('SELECT * FROM property ORDER BY id').all()).toEqual(before)
      for (const table of [
        'revisionChangeSet',
        'organisationRevision',
        'organisationRevisionHead',
        'organisationRevisionWrite',
        'propertyCatalogRevision',
        'propertyCatalogRevisionHead',
        'propertyCatalogRevisionWrite',
      ])
        expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    },
  )

  it('blocks uncaptured edits to enrolled definitions and their children', async () => {
    enableHistory()
    await save([definition], 'before')
    for (const statement of [
      "UPDATE property SET key='bypass' WHERE id='old'",
      "DELETE FROM property WHERE id='old'",
      "UPDATE propertyI18n SET label='bypass' WHERE propertyId='old'",
      "DELETE FROM propertyValue WHERE id='choice'",
      "UPDATE propertyValueI18n SET value='bypass' WHERE propertyValueId='choice'",
    ])
      expect(() => sqlite.exec(statement)).toThrow('requires catalog capture')
    expect(() => sqlite.exec('DELETE FROM propertyCatalogRevision')).toThrow(
      'immutable',
    )
    expect(() =>
      sqlite.exec("UPDATE propertyCatalogRevision SET content='{}'"),
    ).toThrow('immutable')
  })
  it('revisions independent option appends and fences stale forms and moved ownership', async () => {
    enableHistory()
    const saved = await save([definition], 'before')
    if (!saved) throw new Error('Expected saved catalogue')
    const rows = await createPropertyValues(
      db,
      [{ id: 'appended', value: 'second', rank: 1, i18n: { en: { value: 'Second' } } }],
      'old',
      {
        organisationId: 'org',
        hubId: 'scoped',
        actor: { actorId: 'appender', reason: 'Option appended' },
      },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('appended')
    const page = await listOrganisationPropertyHistory(db, {
      organisationId: 'org',
      hubId: 'scoped',
    })
    expect(page.entries[0].actorId).toBe('appender')
    expect(page.entries[0].changes[0].path).toEqual(['old', 'values', 'appended'])
    expect(await save([definition], saved.modifiedAt)).toBeNull()
    const count = sqlite.prepare('SELECT count(*) n FROM propertyCatalogRevision').get()
    await expect(
      createPropertyValues(db, [{ id: 'wrong', value: 'wrong' }], 'old', {
        organisationId: 'org',
        hubId: 'different',
        actor: { actorId: 'appender' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      sqlite.prepare("SELECT 1 FROM propertyValue WHERE id='wrong'").get(),
    ).toBeUndefined()
    expect(
      sqlite.prepare('SELECT count(*) n FROM propertyCatalogRevision').get(),
    ).toEqual(count)
  })

  it('captures initial fields when creating an organisation through its existing form service', async () => {
    enableHistory()
    const created = await createOrganisation(
      db,
      { id: 'new-org', code: 'new-org', settings: {} },
      {
        properties: [{ ...definition, id: 'new-field', values: [] }],
      },
      { actorId: 'creator', reason: 'Organisation created' },
    )
    expect(created.id).toBe('new-org')
    const history = await listOrganisationPropertyHistory(db, {
      organisationId: 'new-org',
      hubId: null,
    })
    expect(history.entries).toHaveLength(2)
    expect(history.entries[0]).toMatchObject({
      actorId: 'creator',
      fieldLabels: { 'new-field': 'Category' },
    })
    expect(history.entries[0].changes[0]).toMatchObject({
      path: ['new-field'],
      before: { present: false },
      after: { present: true },
    })
  })

  it('tracks option ordering without changing stable option identities', async () => {
    enableHistory()
    const first = await save(
      [
        {
          ...definition,
          values: [
            ...definition.values,
            {
              id: 'second-choice',
              value: 'b',
              rank: 1,
              i18n: { en: { value: 'Second' } },
            },
          ],
        },
      ],
      'before',
    )
    if (!first) throw new Error('Expected catalogue')
    await save(
      [
        {
          ...definition,
          values: [
            {
              id: 'second-choice',
              value: 'b',
              rank: 0,
              i18n: { en: { value: 'Second' } },
            },
            { ...definition.values[0], rank: 1 },
          ],
        },
      ],
      first.modifiedAt,
    )
    const history = await listOrganisationPropertyHistory(db, {
      organisationId: 'org',
      hubId: 'scoped',
    })
    expect(history.entries[0].changes).toContainEqual({
      path: ['old', 'values', 'choice', 'record', 'rank'],
      before: { present: true, value: 0 },
      after: { present: true, value: 1 },
    })
    expect(history.entries[0].changes).toContainEqual({
      path: ['old', 'values', 'second-choice', 'record', 'rank'],
      before: { present: true, value: 1 },
      after: { present: true, value: 0 },
    })
  })
})

// All three resource gates enabled: exercise the existing form and independent write paths together.
describe('live admin revision integration', () => {
  /** Installs complete additive storage on the relational transaction fixture.
   * @returns Nothing; each test owns its SQLite database.
   */
  function enableLiveHistory(): void {
    for (const table of [
      schema.projectI18n,
      schema.layerI18n,
      schema.hubLayer,
      schema.projectMapStyles,
      schema.projectRole,
    ]) {
      if (
        sqlite
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(getTableName(table))
      )
        continue
      sqlite.exec(
        `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')})`,
      )
    }
    // Rebuild these two simplified fixture tables with their production property cascade FKs.
    sqlite.exec(
      "INSERT OR IGNORE INTO property(id,key,scope) VALUES ('other','other','project')",
    )
    for (const table of [schema.projectProperty, schema.layerProperty]) {
      const name = getTableName(table),
        owner = name === 'projectProperty' ? 'projectId' : 'layerId'
      const columns = Object.values(getTableColumns(table)).map(
        column =>
          `"${column.name}" ${column.getSQLType()}${column.name === 'propertyId' ? ' REFERENCES property(id) ON DELETE CASCADE' : ''}`,
      )
      sqlite.exec(
        `CREATE TABLE replacement_${name} (${columns.join(',')},UNIQUE(${owner},propertyId)); INSERT INTO replacement_${name} SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE replacement_${name} RENAME TO ${name}`,
      )
    }
    sqlite.exec(`CREATE UNIQUE INDEX live_project_id ON project(id);
      CREATE UNIQUE INDEX live_layer_id ON layer(id);
      CREATE UNIQUE INDEX live_hub_id ON hub(id);
      CREATE UNIQUE INDEX live_layer_i18n ON layerI18n(layerId,locale);
      CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT NOT NULL,origin TEXT NOT NULL,reason TEXT,createdAt TEXT NOT NULL);
      UPDATE project SET code=id,modifiedAt='before',flags='{}',isPublished=0,isArchived=0 WHERE id='project';
      UPDATE layer SET organisationId='org',modifiedAt='before',isPublished=0,isArchived=0 WHERE projectId='project';
      UPDATE organisation SET code='org',modifiedAt='before' WHERE id='org';
      UPDATE hub SET modifiedAt='before' WHERE id='scoped';`)
    for (const migration of [
      '0173_organisation_revisions.sql',
      '0176_property_catalog_revisions.sql',
      '0177_admin_resource_revisions.sql',
    ])
      sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
    sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=1')
  }
  const localField = {
    id: 'local',
    key: 'local',
    component: 'SelectField',
    dataType: 'text',
    cardinality: 'one',
    i18n: { en: { label: 'Local category' } },
    values: [],
  }

  it('records project field edits and independent option appends; rejects a stale full form', async () => {
    enableLiveHistory()
    const saved = await updateProjectByIdWithConcurrency(db, {
      id: 'project',
      actorId: 'editor',
      updatedAt: 'before',
      data: { organisationId: 'org', code: 'project' },
      properties: [localField],
    } as never)
    expect(saved).toBeTruthy()
    await createPropertyValues(
      db,
      [{ id: 'appended', value: 'New', i18n: { en: { value: 'New' } } }] as never,
      'local',
      {
        target: { scope: 'project', id: 'project' },
        actor: { actorId: 'appender' },
        guard: sql`1`,
      },
    )
    expect(
      await updateProjectByIdWithConcurrency(db, {
        id: 'project',
        actorId: 'stale-editor',
        updatedAt: saved!.modifiedAt,
        data: { organisationId: 'org', code: 'project' },
        properties: [localField],
      } as never),
    ).toBeNull()
    expect(
      sqlite.prepare("SELECT count(*) n FROM propertyValue WHERE id='appended'").get()
        ?.n,
    ).toBe(1)
    expect(
      sqlite
        .prepare("SELECT count(*) n FROM propertyCatalogRevision WHERE scope='project'")
        .get()?.n,
    ).toBe(3)
  })

  it('captures deleted shared assignments without nesting duplicate write scopes', async () => {
    enableLiveHistory()
    // Enrol the affected project/layers before the organisation removes its shared definition.
    await updateProjectByIdWithConcurrency(db, {
      id: 'project',
      actorId: 'editor',
      updatedAt: 'before',
      data: { organisationId: 'org', code: 'project' },
    } as never)
    const before = sqlite
      .prepare("SELECT modifiedAt FROM project WHERE id='project'")
      .get()!.modifiedAt
    const saved = await updateOrganisationByIdWithConcurrency(db, {
      id: 'org',
      actorId: 'owner',
      updatedAt: 'before',
      data: { code: 'org', url: null },
      properties: [],
    } as never)
    expect(saved).toBeTruthy()
    const latest = sqlite
      .prepare(
        "SELECT content FROM projectRevision WHERE projectId='project' ORDER BY rowid DESC LIMIT 1",
      )
      .get()!
    expect(JSON.parse(latest.content as string).properties.old).toBeUndefined()
    expect(
      sqlite.prepare("SELECT modifiedAt FROM project WHERE id='project'").get()!
        .modifiedAt,
    ).not.toBe(before)
    expect(sqlite.prepare('SELECT count(*) n FROM projectRevisionWrite').get()?.n).toBe(
      0,
    )
  })

  it('keeps hub catalogue and parent revision atomic on a late failure', async () => {
    enableLiveHistory()
    sqlite.exec(
      "CREATE TRIGGER fail_hub_revision BEFORE INSERT ON hubRevision WHEN NEW.previousRevisionId IS NOT NULL BEGIN SELECT RAISE(ABORT,'injected history failure'); END",
    )
    await expect(
      updateHubByIdWithConcurrency(db, {
        id: 'scoped',
        actorId: 'admin',
        updatedAt: 'before',
        data: { code: 'changed' },
        properties: [],
      } as never),
    ).rejects.toThrow()
    expect(sqlite.prepare("SELECT code FROM hub WHERE id='scoped'").get()?.code).toBe(
      'scoped',
    )
    expect(
      sqlite.prepare('SELECT count(*) n FROM propertyCatalogRevision').get()?.n,
    ).toBe(0)
  })
})
