// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { prepareFeatureLocationTransfer } from '#lib/db/services/featureLocationTransfer.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
import { feature } from '#lib/db/schema/feature.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
function setup(local = false) {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  s.sqlite
    .prepare(
      'INSERT INTO location(id,kind,state,ssId,ownerOrganisationId) VALUES(?,?,?,?,?)',
    )
    .run(
      'place',
      'establishment',
      local ? 'manual' : 'linked',
      local ? null : 'shared',
      local ? 'p' : null,
    )
  const facts = {
    names: { en: 'Original' },
    phoneNumber: [],
    brands: [],
    location: {
      geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
      address: emptyFeatureAddress().source,
    },
  }
  s.sqlite
    .prepare(
      "INSERT INTO locationRevision(id,locationId,version,origin,ssId,apiVersion,releaseId,snapshotId,contentHash,rawSource,facts) VALUES('r','place',1,?,'shared','v1','release','snapshot','hash','{}',?)",
    )
    .run(local ? 'local' : 'saanseoi', serializeLocationFacts(facts, 'establishment'))
  s.sqlite.exec(`INSERT INTO organisationLocation(id,organisationId,locationId,overrides,actorId,createdAt) VALUES('correction','p','place','{"names":{"en":{"mode":"override","value":"Custom name"}}}','author','now');
    INSERT INTO featureLocation(featureId,locationId,version,factsRevisionId,locationRevisionId,acceptedOverrides,factsOrganisationRevision,locationOrganisationRevision) VALUES('f','place','v','r','r','{"names":{"en":{"mode":"override","value":"Custom name"}}}','correction','correction');`)
  const accepted: NonNullable<FeatureRevisionContent['placement']['location']> = {
    locationId: 'place',
    associationVersion: 'v',
    factsRevisionId: 'r',
    locationRevisionId: 'r',
    acceptedOverrides: { names: { en: { mode: 'override', value: 'Custom name' } } },
    factsOrganisationRevision: 'correction',
    locationOrganisationRevision: 'correction',
    occupancyRevisionId: null,
    addressRevisionId: null,
    membershipRevisionIds: [],
    placementOverrides: {},
    acceptedGeometry: null,
    acceptancePolicy: null,
    acceptanceProposalId: null,
    memberships: [],
  }
  const input = {
    featureId: 'f',
    sourceOrganisationId: 'p',
    destinationOrganisationId: 'other',
    actorId: 'manager',
    accepted,
    authorizeDestination: vi.fn(async () => {}),
  }
  return { ...s, input }
}
async function move(
  s: ReturnType<typeof setup>,
  plan: Awaited<ReturnType<typeof prepareFeatureLocationTransfer>>,
  fail = false,
) {
  return executeRevisionBatch(s.db, sql`1`, [
    ...plan.beforeMove,
    s.db.update(feature).set({ projectId: 'other' }).where(eq(feature.id, 'f')),
    ...plan.afterMove,
    ...(fail ? [prepareRevisionCheck(s.db, sql`0`)] : []),
  ])
}
it.each([false, true])(
  'copies accepted definitions atomically, retaining source evidence (local=%s)',
  async local => {
    const s = setup(local),
      plan = await prepareFeatureLocationTransfer(s.db, s.input)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n,
    ).toBe(1)
    await move(s, plan)
    expect(s.input.authorizeDestination).toHaveBeenCalledTimes(1)
    expect(plan.accepted.locationId === 'place').toBe(!local)
    expect(
      s.sqlite
        .prepare(
          'SELECT organisationId,overrides,provenance FROM organisationLocation WHERE id=?',
        )
        .get(required(plan.accepted.factsOrganisationRevision)),
    ).toMatchObject({
      organisationId: 'other',
      overrides: JSON.stringify(s.input.accepted.acceptedOverrides),
    })
    expect(
      s.sqlite
        .prepare("SELECT overrides FROM organisationLocation WHERE id='correction'")
        .get()?.overrides,
    ).toBe(JSON.stringify(s.input.accepted.acceptedOverrides))
    expect(
      s.sqlite.prepare("SELECT projectId FROM feature WHERE id='f'").get()?.projectId,
    ).toBe('other')
    expect(s.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    if (local)
      expect(
        s.sqlite
          .prepare('SELECT ownerOrganisationId FROM location WHERE id=?')
          .get(plan.accepted.locationId)?.ownerOrganisationId,
      ).toBe('other')
  },
)
it('requires destination organisation authority before any writes', async () => {
  const s = setup()
  await expect(
    prepareFeatureLocationTransfer(s.db, {
      ...s.input,
      authorizeDestination: async () => {
        throw new Error('Denied')
      },
    }),
  ).rejects.toThrow('Denied')
  expect(s.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
    1,
  )
})
it('reuses equivalent destination conventions and rejects conflicts', async () => {
  const s = setup()
  s.sqlite.exec(
    `INSERT INTO organisationLocation(id,organisationId,locationId,overrides,actorId,createdAt) VALUES('existing','other','place','{"names":{"en":{"mode":"override","value":"Custom name"}}}','manager','now')`,
  )
  const plan = await prepareFeatureLocationTransfer(s.db, s.input)
  expect(plan.accepted.factsOrganisationRevision).toBe('existing')
  await move(s, plan)
  expect(s.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
    2,
  )
  const conflict = setup()
  conflict.sqlite.exec(
    `INSERT INTO organisationLocation(id,organisationId,locationId,overrides,actorId,createdAt) VALUES('existing','other','place','{"names":{"en":{"mode":"override","value":"Different"}}}','manager','now')`,
  )
  await expect(
    prepareFeatureLocationTransfer(conflict.db, conflict.input),
  ).rejects.toThrow('conflicting')
})
it('rolls back copies, association and ownership if a later save guard fails', async () => {
  const s = setup(true),
    plan = await prepareFeatureLocationTransfer(s.db, s.input)
  expect(await move(s, plan, true)).toBeNull()
  expect(s.sqlite.prepare('SELECT count(*) n FROM location').get()?.n).toBe(1)
  expect(s.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
    1,
  )
  expect(
    s.sqlite
      .prepare("SELECT locationId,version FROM featureLocation WHERE featureId='f'")
      .get(),
  ).toMatchObject({ locationId: 'place', version: 'v' })
})
it('rejects a destination definition created after preparation', async () => {
  const s = setup(),
    plan = await prepareFeatureLocationTransfer(s.db, s.input)
  s.sqlite.exec(
    `INSERT INTO organisationLocation(id,organisationId,locationId,overrides,actorId,createdAt) VALUES('racing','other','place','{"names":{"en":{"mode":"override","value":"Different"}}}','manager','now')`,
  )
  expect(await move(s, plan)).toBeNull()
  expect(
    s.sqlite.prepare("SELECT projectId FROM feature WHERE id='f'").get()?.projectId,
  ).toBe('p')
})
it('copies scoped occupancy and private containers while retaining accepted address evidence', async () => {
  const s = setup(true)
  s.sqlite.exec(`INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('building','building','manual','p');
    INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) SELECT 'building-r','building',1,'local','building-hash',rawSource,facts FROM locationRevision WHERE id='r';
    INSERT INTO address(id,sourceKey) VALUES('address','{"provider":"local","family":"address","id":"a"}');
    INSERT INTO addressRevision(id,addressId,scope,components,contentHash,sourceReferences,rawSource) VALUES('address-r','address','building','{}','address-hash','[]','{}');
    INSERT INTO locationOccupancy(id,relationshipId,scopeOrganisationId,assertionState,evidence,provenance,establishmentLocationId,containerLocationId,addressRevisionId,occupancyState) VALUES('occupancy','occupancy','p','asserted','[]','{}','place','building','address-r','current');
    UPDATE featureLocation SET version='v2',occupancyRevisionId='occupancy',addressRevisionId='address-r' WHERE featureId='f';`)
  s.input.accepted.associationVersion = 'v2'
  s.input.accepted.occupancyRevisionId = 'occupancy'
  s.input.accepted.addressRevisionId = 'address-r'
  s.input.accepted.memberships = [
    {
      containerLocationId: 'building',
      role: 'building',
      bindingVersion: 'v2',
      occupancyRevisionId: 'occupancy',
      membershipRevisionId: null,
    },
  ]
  const plan = await prepareFeatureLocationTransfer(s.db, s.input)
  await move(s, plan)
  expect(plan.accepted.addressRevisionId).toBe('address-r')
  const assertion = required(
    s.sqlite
      .prepare('SELECT * FROM locationOccupancy WHERE id=?')
      .get(required(plan.accepted.occupancyRevisionId)),
  )
  expect(assertion.scopeOrganisationId).toBe('other')
  expect(assertion.establishmentLocationId).toBe(plan.accepted.locationId)
  expect(assertion.containerLocationId).not.toBe('building')
  expect(
    s.sqlite
      .prepare(
        "SELECT containerLocationId FROM featureLocationMembership WHERE featureId='f'",
      )
      .get()?.containerLocationId,
  ).toBe(assertion.containerLocationId)
  expect(s.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
it('copies accepted corrections rather than a newer unaccepted source head', async () => {
  const s = setup()
  s.sqlite.exec(
    `INSERT INTO organisationLocation(id,organisationId,locationId,previousRevisionId,overrides,actorId,createdAt) VALUES('unaccepted','p','place','correction','{"names":{"en":{"mode":"override","value":"Not accepted"}}}','author','later')`,
  )
  const plan = await prepareFeatureLocationTransfer(s.db, s.input)
  await move(s, plan)
  const copied = required(
    s.sqlite
      .prepare('SELECT overrides,provenance FROM organisationLocation WHERE id=?')
      .get(required(plan.accepted.factsOrganisationRevision)),
  )
  expect(JSON.parse(String(copied.overrides))).toEqual(
    s.input.accepted.acceptedOverrides,
  )
  expect(JSON.parse(String(copied.provenance))).toMatchObject({
    sourceRevisionId: 'correction',
    sourceOrganisationId: 'p',
    featureId: 'f',
    actorId: 'manager',
  })
})
it('keeps independently accepted facts and address correction pins', async () => {
  const s = setup()
  s.sqlite.exec(`INSERT INTO organisationLocation(id,organisationId,locationId,previousRevisionId,overrides,actorId,createdAt) VALUES('address-correction','p','place','correction','{}','author','later');
    UPDATE featureLocation SET version='split',locationOrganisationRevision='address-correction' WHERE featureId='f'`)
  s.input.accepted.associationVersion = 'split'
  s.input.accepted.locationOrganisationRevision = 'address-correction'
  const plan = await prepareFeatureLocationTransfer(s.db, s.input)
  await move(s, plan)
  expect(plan.accepted.factsOrganisationRevision).not.toBe(
    plan.accepted.locationOrganisationRevision,
  )
  expect(
    s.sqlite
      .prepare('SELECT previousRevisionId FROM organisationLocation WHERE id=?')
      .get(required(plan.accepted.locationOrganisationRevision))?.previousRevisionId,
  ).toBe(plan.accepted.factsOrganisationRevision)
})
it('does not require organisation management for an unchanged shared Location without scoped evidence', async () => {
  const s = setup()
  s.sqlite.exec(
    `UPDATE featureLocation SET version='shared-only',factsOrganisationRevision=NULL,locationOrganisationRevision=NULL,acceptedOverrides='{}' WHERE featureId='f'`,
  )
  Object.assign(s.input.accepted, {
    associationVersion: 'shared-only',
    factsOrganisationRevision: null,
    locationOrganisationRevision: null,
    acceptedOverrides: {},
  })
  const plan = await prepareFeatureLocationTransfer(s.db, {
    ...s.input,
    authorizeDestination: undefined,
  })
  await move(s, plan)
  expect(plan.accepted.locationId).toBe('place')
  expect(s.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
    1,
  )
})
