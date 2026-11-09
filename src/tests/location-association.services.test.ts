// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { nearbyAssociationLocations } from '#lib/db/services/locationAssociationCandidates.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

it('finds matching kinds within 100 metres and excludes private records belonging to another owner', async () => {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: { en: { streetName: 'Hollywood Road' } },
  }
  const create = async (
    owner: string,
    kind: 'premises' | 'building',
    visibility: 'shared' | 'exclusive',
    coordinates = address.coordinates,
  ) =>
    createLocalLocation(
      store.db,
      owner,
      localIdentityFromAddress(
        kind,
        { en: 'Hollywood Terrace' },
        { ...address, coordinates },
        visibility,
      ),
      'actor',
    )
  const shared = await create('p', 'premises', 'shared')
  const own = await create('p', 'premises', 'exclusive')
  await create('other', 'premises', 'exclusive')
  await create('p', 'building', 'shared')
  await create('p', 'premises', 'shared', [114.16, 22.3])
  const result = await nearbyAssociationLocations(store.db, {
    projectId: 'p',
    kind: 'premises',
    coordinates: address.coordinates,
  })
  expect(result.limited).toBe(false)
  expect(result.rows.map(row => row.locationId).sort()).toEqual(
    [shared.locationId, own.locationId].sort(),
  )
  expect(
    result.rows.find(row => row.locationId === shared.locationId)?.recordMode,
  ).toBe('unlinked')
  expect(result.rows.find(row => row.locationId === own.locationId)?.recordMode).toBe(
    'manual',
  )
  store.sqlite
    .prepare(
      "UPDATE location SET state='linked', ownerOrganisationId=NULL, ssId='published-fixture', sourceAvailability='current' WHERE id=?",
    )
    .run(shared.locationId)
  const refreshed = await nearbyAssociationLocations(store.db, {
    projectId: 'p',
    kind: 'premises',
    coordinates: address.coordinates,
  })
  expect(
    refreshed.rows.find(row => row.locationId === shared.locationId)?.recordMode,
  ).toBe('linked')
})

it('links a custom Location without copying the Feature placement into shared corrections', async () => {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: { en: { streetName: 'Original Road' } },
    association: {
      originKind: 'address' as const,
      kind: 'establishment' as const,
      mode: 'linked' as const,
      lookup: 'matched' as const,
      names: { en: 'Cafe' },
    },
  }
  const target = await createLocalLocation(
    store.db,
    'p',
    localIdentityFromAddress(
      'establishment',
      { en: 'Cafe' },
      {
        ...emptyFeatureAddress(),
        coordinates: [114.1502, 22.3],
        overrides: { en: { streetName: 'Location Road' } },
      },
    ),
    'actor',
  )
  // Link without name projection so this minimal migration fixture only exercises association writes.
  store.sqlite
    .prepare('UPDATE feature SET geometry=?,addressMeta=? WHERE id=?')
    .run(
      JSON.stringify({ type: 'Point', coordinates: address.coordinates }),
      JSON.stringify({ address }),
      'f',
    )
  const result = await linkInitialFeatureLocation(store.db, {
    featureId: 'f',
    projectId: 'p',
    ...target,
    expectedFeatureModifiedAt: 'original',
    actorId: 'actor',
  })
  expect(result.status).toBe('linked')
  const row = store.sqlite
    .prepare(
      'SELECT acceptedOverrides,acceptedGeometry,acceptancePolicy FROM featureLocation WHERE featureId=?',
    )
    .get('f')!
  expect(JSON.parse(row.acceptedOverrides as string).location).toBeUndefined()
  expect(JSON.parse(row.acceptedGeometry as string).coordinates).toEqual(
    address.coordinates,
  )
  expect(JSON.parse(row.acceptancePolicy as string).locationMode).toBe('independent')
  expect(
    JSON.parse(
      store.sqlite.prepare('SELECT addressMeta FROM feature WHERE id=?').get('f')!
        .addressMeta as string,
    ).address,
  ).toEqual(address)
})

it('preserves reviewed address components across a later save and reassociation', async () => {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  const { getTableColumns } = await import('drizzle-orm')
  const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
  const { saveLinkedFeatureForm } = await import('#lib/db/services/locationEdit.js')
  const { relinkFeatureLocation } = await import('#lib/db/services/locationRelink.js')
  const { getAcceptedFeatureLocation } = await import('#lib/db/services/location.js')
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
  store.sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
    INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','My Feature','Original Road');
    INSERT INTO hub VALUES ('core','core');
    INSERT INTO property(id,key,scope,hubId) VALUES ('phone','phoneNumber','hub','core');`)
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3] as [number, number],
    overrides: { en: { streetName: 'Original Road' } },
    association: {
      originKind: 'address' as const,
      kind: 'premises' as const,
      mode: 'linked' as const,
      lookup: 'matched' as const,
      names: { en: 'Terrace' },
    },
  }
  const create = (name: string) =>
    createLocalLocation(
      store.db,
      'p',
      localIdentityFromAddress(
        'premises',
        { en: name },
        {
          ...emptyFeatureAddress(),
          coordinates: [114.1501, 22.3],
          overrides: { en: { streetName: 'Location Road' } },
        },
      ),
      'actor',
    )
  const first = await create('Terrace')
  const second = await create('Other Terrace')
  store.sqlite
    .prepare("UPDATE feature SET geometry=?,addressMeta=? WHERE id='f'")
    .run(
      JSON.stringify({ type: 'Point', coordinates: address.coordinates }),
      JSON.stringify({ address }),
    )
  expect(
    (
      await linkInitialFeatureLocation(store.db, {
        featureId: 'f',
        projectId: 'p',
        ...first,
        expectedFeatureModifiedAt: 'original',
        actorId: 'actor',
        nameMode: 'independent',
      })
    ).status,
  ).toBe('linked')
  const changed = { ...address, overrides: { en: { streetName: 'Reviewed Road' } } }
  const saved = await saveLinkedFeatureForm(store.db, {
    featureId: 'f',
    projectId: 'p',
    actorId: 'actor',
    updatedAt: store.sqlite
      .prepare("SELECT modifiedAt FROM feature WHERE id='f'")
      .get()!.modifiedAt as string,
    data: { addressMeta: { address: changed } },
    i18n: { en: { title: 'My Feature', displayAddress: 'Reviewed Road' } },
  })
  expect(saved.status).toBe('saved')
  if (saved.status !== 'saved') throw new Error('Expected save')
  expect(
    JSON.parse(
      store.sqlite.prepare('SELECT acceptancePolicy FROM featureLocation').get()!
        .acceptancePolicy as string,
    ).locationMode,
  ).toBe('independent')
  expect(
    store.sqlite
      .prepare("SELECT title FROM featureI18n WHERE featureId='f' AND locale='en'")
      .get()!.title,
  ).toBe('My Feature')
  const previous = await getAcceptedFeatureLocation(store.db, 'f', 'p')
  expect(
    (
      await relinkFeatureLocation(store.db, {
        featureId: 'f',
        projectId: 'p',
        ...second,
        expectedFeatureModifiedAt: saved.feature.modifiedAt,
        expectedRevision: previous!.version,
        actorId: 'actor',
      })
    ).status,
  ).toBe('linked')
  const stored = store.sqlite
    .prepare("SELECT addressMeta FROM feature WHERE id='f'")
    .get()!
  expect(JSON.parse(stored.addressMeta as string).address).toEqual(changed)
  const accepted = await getAcceptedFeatureLocation(store.db, 'f', 'p')
  expect(accepted?.locationId).toBe(second.locationId)
  expect(
    JSON.parse(
      store.sqlite.prepare('SELECT acceptedOverrides FROM featureLocation').get()!
        .acceptedOverrides as string,
    ).location,
  ).toBeUndefined()
  expect(
    JSON.parse(
      store.sqlite.prepare('SELECT acceptedGeometry FROM featureLocation').get()!
        .acceptedGeometry as string,
    ).coordinates,
  ).toEqual(address.coordinates)
  // A record can opt into Location names without changing the shared Location name.
  const beforeName = accepted!.effective.names.en ?? ''
  const inherited = await saveLinkedFeatureForm(store.db, {
    featureId: 'f',
    projectId: 'p',
    actorId: 'actor',
    updatedAt: store.sqlite
      .prepare("SELECT modifiedAt FROM feature WHERE id='f'")
      .get()!.modifiedAt as string,
    data: { addressMeta: { address: changed } },
    i18n: {
      en: {
        title: beforeName,
        description: 'Feature-specific description',
        displayAddress: 'Reviewed Road',
      },
    },
    locationNameMode: 'inherit',
  })
  expect(inherited.status).toBe('saved')
  expect((await getAcceptedFeatureLocation(store.db, 'f', 'p'))?.nameMode).toBe(
    'inherit',
  )
  expect(
    (await getAcceptedFeatureLocation(store.db, 'f', 'p'))?.effective.names.en,
  ).toBe(beforeName)
  expect(
    store.sqlite
      .prepare(
        "SELECT title,description FROM featureI18n WHERE featureId='f' AND locale='en'",
      )
      .get(),
  ).toMatchObject({ title: beforeName, description: 'Feature-specific description' })
})

it('links a new Location to a historical Feature without changing its historical flag', async () => {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  const address = {
    ...emptyFeatureAddress(),
    coordinates: [114.14032, 22.28555] as [number, number],
  }
  store.sqlite
    .prepare('UPDATE feature SET isIntangible=1,geometry=?,addressMeta=? WHERE id=?')
    .run(
      JSON.stringify({ type: 'Point', coordinates: address.coordinates }),
      JSON.stringify({ address }),
      'f',
    )
  const target = await createLocalLocation(
    store.db,
    'p',
    localIdentityFromAddress('building', { en: 'True Light Building' }, address),
    'actor',
  )
  const input = {
    featureId: 'f',
    projectId: 'p',
    ...target,
    expectedFeatureModifiedAt: 'original',
    actorId: 'actor',
  }
  expect(
    await linkInitialFeatureLocation(store.db, {
      ...input,
      expectedFeatureModifiedAt: 'stale',
    }),
  ).toEqual({ status: 'conflict' })
  expect(await linkInitialFeatureLocation(store.db, input)).toMatchObject({
    status: 'linked',
  })
  expect(
    store.sqlite.prepare('SELECT isIntangible FROM feature WHERE id=?').get('f'),
  ).toEqual({ isIntangible: 1 })
  expect(
    store.sqlite
      .prepare('SELECT locationId FROM featureLocation WHERE featureId=?')
      .get('f'),
  ).toEqual({ locationId: target.locationId })
  expect(await linkInitialFeatureLocation(store.db, input)).toEqual({
    status: 'conflict',
  })
})
