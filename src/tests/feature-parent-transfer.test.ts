// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sql, getTableColumns, getTableName } from 'drizzle-orm'
import { location, organisationLocation } from '#lib/db/schema/location.js'
import { property } from '#lib/db/schema/property.js'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { saveFeatureFormRevision } from '#lib/db/services/featureFormRevision.js'
import { readCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
const expectedScope = {
  organisationId: 'org',
  projectId: 'project',
  layerId: 'layer',
  resourceHubId: null,
}
const destinationScope = {
  organisationId: 'org',
  projectId: 'destination-project',
  layerId: 'destination-layer',
  resourceHubId: null,
}
function form(content: FeatureRevisionContent) {
  return {
    ...destinationScope,
    geometry: content.placement.geometry,
    addressMeta: content.placement.addressMeta,
    isIntangible: content.profile.isIntangible,
    isVisitable: content.profile.visitability.isVisitable,
    isPendingReview: false,
    isDraft: false,
    i18n: Object.fromEntries(
      Object.entries(content.translations).map(([locale, row]) => [
        locale,
        {
          title: row.title.value,
          titleGen: row.title.generated,
          description: row.description?.value,
          descriptionGen: row.description?.generated,
        },
      ]),
    ),
    properties: Object.entries(content.properties)
      .filter(([id]) => id !== 'private')
      .map(([propertyId, row]) => ({
        propertyId,
        value: row.selection.value,
        valueJson: row.selection.valueJson,
        propertyValueId: row.selection.propertyValueId,
      })),
  } as unknown as Required<
    Pick<Parameters<typeof saveFeatureFormRevision>[1]['data'], 'i18n' | 'properties'>
  > &
    Parameters<typeof saveFeatureFormRevision>[1]['data']
}
async function setup(linked = false, correction = false, independentNames = false) {
  const f = lifecycleFixture(linked)
  connections.push(f)
  if (correction)
    f.sqlite.exec(
      "UPDATE featureLocation SET factsOrganisationRevision='org-correction' WHERE featureId='f'",
    )
  f.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS layerProperty(layerId TEXT,propertyId TEXT,isVisible INTEGER); INSERT INTO layerProperty SELECT 'destination-layer',id,1 FROM property",
  )
  if (independentNames)
    f.sqlite
      .prepare('UPDATE featureLocation SET acceptancePolicy=? WHERE featureId=?')
      .run(JSON.stringify({ nameMode: 'independent' }), 'f')
  const initial = await f.initialize(true)
  f.sqlite.exec(
    "INSERT INTO project(id,organisationId,isPublished,isArchived) VALUES('destination-project','org',1,0); INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES('destination-layer','org','destination-project',1,0)",
  )
  const input = {
    featureId: 'f',
    actorId: 'owner',
    updatedAt: 'token',
    expectedScope,
    destinationScope,
    guard: buildFeatureCommandScopeGuard(f.db, 'f', expectedScope),
    data: form(initial.content),
    canPublish: true,
    allowDescriptions: true,
    allowedInternalIds: new Set<string>(),
    reason: 'Feature transferred',
  }
  return { ...f, initial, input }
}

it.each([false, true])(
  'transfers a Feature and records its new scope atomically (linked=%s)',
  async linked => {
    const f = await setup(linked)
    const saved = await saveFeatureFormRevision(f.db, f.input)
    expect(saved.status).toBe('applied')
    expect(
      f.sqlite
        .prepare(
          "SELECT id,organisationId,projectId,layerId,isPublished FROM feature WHERE id='f'",
        )
        .get(),
    ).toMatchObject({
      id: 'f',
      organisationId: 'org',
      projectId: 'destination-project',
      layerId: 'destination-layer',
      isPublished: 1,
    })
    const current = await readCurrentFeatureRevision(f.db, {
      featureId: 'f',
      guard: sql`1`,
    })
    expect(current?.revisionId).not.toBe(f.initial.revisionId)
    expect(current?.content.gallery).toEqual(f.initial.content.gallery)
    expect(
      f.sqlite
        .prepare('SELECT recordState FROM featureRevision WHERE id=?')
        .get(required(current).revisionId)?.recordState,
    ).toContain('destination-project')
    expect(
      f.sqlite
        .prepare('SELECT id FROM featureRevision WHERE id=?')
        .get(f.initial.revisionId),
    ).toBeTruthy()
  },
)

it('rejects a destination reparented after authorization without saving form or history', async () => {
  const f = await setup()
  f.sqlite.exec(
    "UPDATE layer SET projectId='other-project' WHERE id='destination-layer'",
  )
  await expect(saveFeatureFormRevision(f.db, f.input)).rejects.toThrow('changed')
  expect(
    (await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))
      ?.revisionId,
  ).toBe(f.initial.revisionId)
  expect(
    f.sqlite.prepare("SELECT projectId FROM feature WHERE id='f'").get()?.projectId,
  ).toBe('project')
})

it('drops retained private fields outside the destination and preserves the old revision', async () => {
  const f = await setup()
  f.sqlite.exec("UPDATE property SET projectId='project' WHERE id='private'")
  await saveFeatureFormRevision(f.db, f.input)
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(current?.content.properties.private).toBeUndefined()
  expect(
    f.sqlite
      .prepare(
        "SELECT propertyId FROM featureProperty WHERE featureId='f' AND propertyId='private'",
      )
      .get(),
  ).toBeUndefined()
  expect(
    JSON.parse(
      String(
        f.sqlite
          .prepare('SELECT content FROM featureRevision WHERE id=?')
          .get(f.initial.revisionId)?.content,
      ),
    ).properties.private,
  ).toEqual(f.initial.content.properties.private)
})

it('transfers an unlinked Feature between authorized organisations without changing identity or media', async () => {
  const f = await setup()
  f.sqlite.exec(
    "INSERT INTO organisation(id,hubId,isPublished,isArchived) VALUES('destination-org',NULL,1,0); UPDATE project SET organisationId='destination-org' WHERE id='destination-project'; UPDATE layer SET organisationId='destination-org' WHERE id='destination-layer'",
  )
  const destination = { ...destinationScope, organisationId: 'destination-org' }
  await saveFeatureFormRevision(f.db, {
    ...f.input,
    destinationScope: destination,
    data: { ...f.input.data, organisationId: destination.organisationId },
  })
  expect(
    f.sqlite.prepare("SELECT organisationId,projectId FROM feature WHERE id='f'").get(),
  ).toMatchObject({
    organisationId: 'destination-org',
    projectId: 'destination-project',
  })
  expect(
    (await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))?.content
      .gallery,
  ).toEqual(f.initial.content.gallery)
})

it('rolls back a cross-organisation move carrying accepted organisation Location corrections', async () => {
  const f = await setup(true, true)
  f.sqlite.exec(
    "INSERT INTO organisation(id,hubId,isPublished,isArchived) VALUES('destination-org',NULL,1,0); UPDATE project SET organisationId='destination-org' WHERE id='destination-project'; UPDATE layer SET organisationId='destination-org' WHERE id='destination-layer'",
  )
  const migration = readFileSync(
    'migrations/0141_organisation_location_scope_guards.sql',
    'utf8',
  )
  f.sqlite.exec(
    migration.slice(
      migration.indexOf('CREATE TRIGGER feature_location_organisation_feature_move'),
      migration.indexOf('CREATE TRIGGER feature_location_organisation_project_move'),
    ),
  )
  const destination = { ...destinationScope, organisationId: 'destination-org' }
  await expect(
    saveFeatureFormRevision(f.db, {
      ...f.input,
      destinationScope: destination,
      data: { ...f.input.data, organisationId: destination.organisationId },
    }),
  ).rejects.toThrow()
  expect(
    f.sqlite.prepare("SELECT organisationId,projectId FROM feature WHERE id='f'").get(),
  ).toMatchObject({ organisationId: 'org', projectId: 'project' })
  expect(
    (await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))
      ?.revisionId,
  ).toBe(f.initial.revisionId)
})

it('keeps supported values, drops unassigned fields and initializes new field identities to null', async () => {
  const f = await setup()
  const definition = required(
    f.source.fieldDefinitions.find(row => row.id === 'choice'),
  )
  f.seed(property, [
    { ...definition, id: 'new-field', projectId: 'destination-project' },
    {
      ...definition,
      id: 'new-private',
      audience: 'internal',
      projectId: 'destination-project',
    },
  ])
  f.sqlite.exec(
    "DELETE FROM layerProperty WHERE layerId='destination-layer' AND propertyId='structured'; INSERT INTO layerProperty VALUES('destination-layer','new-field',1),('destination-layer','new-private',0)",
  )
  // A transfer cannot use automatic reconciliation to author protected internal fields.
  f.input.data.properties.push(
    { propertyId: 'private', value: 'forged' },
    { propertyId: 'new-private', value: 'forged' },
  )
  await saveFeatureFormRevision(f.db, f.input)
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(current?.content.properties.choice).toEqual(
    f.initial.content.properties.choice,
  )
  expect(current?.content.properties.private).toEqual(
    f.initial.content.properties.private,
  )
  expect(current?.content.properties.structured).toBeUndefined()
  for (const id of ['new-field', 'new-private']) {
    expect(current?.content.properties[id].selection).toMatchObject({
      value: null,
      valueJson: null,
      propertyValueId: null,
    })
    expect(
      f.sqlite
        .prepare(
          'SELECT value,valueJson,propertyValueId FROM featureProperty WHERE featureId=? AND propertyId=?',
        )
        .get('f', id),
    ).toEqual({ value: null, valueJson: null, propertyValueId: null })
  }
  expect(
    JSON.parse(
      String(
        f.sqlite
          .prepare('SELECT content FROM featureRevision WHERE id=?')
          .get(f.initial.revisionId)?.content,
      ),
    ).properties.structured,
  ).toEqual(f.initial.content.properties.structured)
})

it('rolls back if destination assignments change after reconciliation', async () => {
  const f = await setup()
  const batch = f.db.batch.bind(f.db)
  f.db.batch = (async statements => {
    f.sqlite.exec(
      "DELETE FROM layerProperty WHERE layerId='destination-layer' AND propertyId='choice'",
    )
    return batch(statements)
  }) as typeof f.db.batch
  await expect(saveFeatureFormRevision(f.db, f.input)).rejects.toThrow('changed')
  expect(
    (await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))
      ?.revisionId,
  ).toBe(f.initial.revisionId)
  expect(
    f.sqlite.prepare("SELECT projectId FROM feature WHERE id='f'").get()?.projectId,
  ).toBe('project')
})

it('transfers linked Features without treating normalized empty form fields as Location edits', async () => {
  const f = await setup(true)
  // Match form transport: null address/metadata become empty values and missing locales are filled.
  f.input.data.i18n = Object.fromEntries(
    Object.entries(f.initial.content.translations).map(([locale, row]) => [
      locale,
      {
        title: row.title.value ?? '',
        titleGen: row.title.generated ?? false,
        description: row.description?.value ?? '',
        descriptionGen: row.description?.generated ?? false,
        displayAddress: row.address.value ?? '',
        displayAddressGen: row.address.generated ?? false,
        addressProperties: row.address.properties ?? {},
      },
    ]),
  ) as typeof f.input.data.i18n
  f.input.data.i18n.zhHans = {
    title: '',
    titleGen: false,
    description: '',
    descriptionGen: false,
    displayAddress: '',
    displayAddressGen: false,
    addressProperties: {},
  }
  f.input.data.i18n.en.description = 'Edited Feature description'
  await saveFeatureFormRevision(f.db, f.input)
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  for (const [locale, row] of Object.entries(f.initial.content.translations)) {
    expect(current?.content.translations[locale].title).toEqual(row.title)
    expect(current?.content.translations[locale].address).toEqual(row.address)
  }
  expect(current?.content.translations['zh-hans']).toBeUndefined()
  expect(current?.content.translations.en.description?.value).toBe(
    'Edited Feature description',
  )
  expect(current?.content.placement.location).toEqual(
    f.initial.content.placement.location,
  )
  expect(
    f.sqlite.prepare("SELECT projectId FROM feature WHERE id='f'").get()?.projectId,
  ).toBe('destination-project')
})

it('still saves independent Feature names while preserving linked addresses during transfer', async () => {
  const f = await setup(true, false, true)
  f.input.data.i18n.en.title = 'Independent Feature title'
  f.input.data.i18n.en.displayAddress = 'Transport-only derived address'
  await saveFeatureFormRevision(f.db, f.input)
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(current?.content.translations.en.title.value).toBe('Independent Feature title')
  expect(current?.content.translations.en.address).toEqual(
    f.initial.content.translations.en.address,
  )
})

it('captures copied organisation pins in the accepted Feature revision', async () => {
  const f = lifecycleFixture(true)
  connections.push(f)
  f.sqlite.exec(
    "UPDATE featureLocation SET factsOrganisationRevision='correction',locationOrganisationRevision='correction',occupancyRevisionId=NULL,addressRevisionId=NULL,membershipRevisionIds='[]'; DELETE FROM featureLocationMembership",
  )
  for (const table of [location, organisationLocation]) {
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`,
    )
    f.sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(',')})`)
  }
  f.sqlite.exec(`INSERT INTO location(id,ssId,kind,state,sourceAvailability) VALUES('place','shared','establishment','linked','current');
    INSERT INTO organisationLocation(id,organisationId,locationId,overrides,createdAt) VALUES('correction','org','place','{}','now');
    CREATE VIEW organisationLocationHead AS SELECT id AS revision,organisationId,locationId FROM organisationLocation o WHERE NOT EXISTS(SELECT 1 FROM organisationLocation n WHERE n.previousRevisionId=o.id);
    CREATE TRIGGER feature_location_clear_detached AFTER INSERT ON featureLocation BEGIN UPDATE feature SET localLocationBrands=NULL WHERE id=NEW.featureId; END;
    CREATE TABLE layerProperty(layerId TEXT,propertyId TEXT,isVisible INTEGER);
    INSERT INTO layerProperty SELECT 'destination-layer',id,1 FROM property;
    INSERT INTO organisation(id,hubId,isPublished,isArchived) VALUES('destination-org',NULL,1,0);
    INSERT INTO project(id,organisationId,isPublished,isArchived) VALUES('destination-project','destination-org',1,0);
    INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES('destination-layer','destination-org','destination-project',1,0);`)
  const initial = await f.initialize(true)
  await saveFeatureFormRevision(f.db, {
    featureId: 'f',
    actorId: 'manager',
    updatedAt: 'token',
    expectedScope,
    destinationScope: { ...destinationScope, organisationId: 'destination-org' },
    guard: sql`1`,
    data: form(initial.content),
    canPublish: true,
    allowDescriptions: true,
    allowedInternalIds: new Set(),
    authorizeDestinationLocation: async () => {},
  })
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const accepted = required(required(current).content.placement.location)
  expect(accepted.locationId).toBe('place')
  expect(accepted.factsOrganisationRevision).not.toBe('correction')
  expect(
    f.sqlite
      .prepare('SELECT organisationId FROM organisationLocation WHERE id=?')
      .get(required(accepted.factsOrganisationRevision))?.organisationId,
  ).toBe('destination-org')
  expect(required(current).content.translations).toEqual(initial.content.translations)
  expect(
    JSON.parse(
      String(
        f.sqlite
          .prepare('SELECT content FROM featureRevision WHERE id=?')
          .get(initial.revisionId)?.content,
      ),
    ).placement.location.factsOrganisationRevision,
  ).toBe('correction')
})

it('retains shared core catalogue values across hubs and drops other hub fields', async () => {
  const f = await setup()
  f.sqlite.exec(
    "INSERT INTO hub VALUES('core-hub','core'),('private-hub','private'); UPDATE property SET hubId='core-hub' WHERE id='structured'; UPDATE property SET hubId='private-hub' WHERE id='choice'",
  )
  await saveFeatureFormRevision(f.db, f.input)
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(current?.content.properties.structured).toEqual(
    f.initial.content.properties.structured,
  )
  expect(current?.content.properties.choice).toBeUndefined()
})

it('allows an ordinary save of an assigned core field from another hub', async () => {
  const f = await setup()
  f.sqlite.exec(
    "INSERT INTO hub VALUES('core-hub','core'); UPDATE property SET hubId='core-hub' WHERE id='structured'",
  )
  const data = {
    ...f.input.data,
    layerId: 'layer',
    projectId: 'project',
    organisationId: 'org',
  }
  const field = required(
    required(data.properties).find(row => row.propertyId === 'structured'),
  )
  field.valueJson = '{"items":[]}'
  const saved = await saveFeatureFormRevision(f.db, {
    ...f.input,
    destinationScope: undefined,
    data,
  })
  expect(saved.status).toBe('applied')
  const current = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(current?.content.properties.structured.selection.valueJson).toBe(
    '{"items":[]}',
  )
})
