// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import {
  emptyFeatureAddress,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import {
  processLocationRematching,
  retryLocationRematch,
} from '#lib/db/services/locationRematch.js'
import {
  acceptLocationIdentityReview,
  readLocationIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
import { rejectLocationIdentityReview } from '#lib/db/services/locationIdentityRejection.js'
import { adoptRefreshedLocationForFeature } from '#lib/db/services/locationRefreshAdoption.js'
import { scoreLocationRematch } from '#lib/locations/rematch.js'
import { sql } from 'drizzle-orm'
import { taskQueueProjection } from '#lib/db/services/taskQueue.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import type { PlaceSourceClient } from '#lib/locations/sourceClient.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
const address = (): FeatureAddress => ({
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3],
  overrides: { en: { streetName: 'My Road', buildingNumberExpression: '11–16' } },
  association: {
    originKind: 'address',
    kind: 'establishment',
    mode: 'unlinked',
    lookup: 'deferred',
    names: { en: 'Cafe' },
    choices: { street: 'custom', number: 'original' },
  },
})

async function setup(value = address()) {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  s.sqlite.exec(
    "INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES('f','en','My independent Feature','My corrected address')",
  )
  const local = await createLocalLocation(
    s.db,
    'p',
    localIdentityFromAddress(
      value.association!.kind as 'establishment',
      { en: 'Cafe' },
      { ...value, coordinates: value.coordinates ?? [114.15, 22.3] },
    ),
    'author',
  )
  s.sqlite
    .prepare("UPDATE feature SET geometry=?,addressMeta=? WHERE id='f'")
    .run(
      JSON.stringify({ type: 'Point', coordinates: [114.15, 22.3] }),
      JSON.stringify({ address: value }),
    )
  expect(
    (
      await linkInitialFeatureLocation(s.db, {
        featureId: 'f',
        projectId: 'p',
        ...local,
        expectedFeatureModifiedAt: 'original',
        actorId: 'author',
      })
    ).status,
  ).toBe('linked')
  return { ...s, ...local }
}

function provider(ids = ['source']) {
  const state = {
    ids,
    fail: false,
    partial: false,
    publication: 1,
    onCanonical: () => {},
  }
  const fetcher = vi.fn(async (request: RequestInfo | URL) => {
    const url = new URL(String(request))
    if (state.fail) return new Response('outage', { status: 503 })
    const meta = {
      apiReleaseSet: `release${state.publication}`,
      apiCatalogRevision: `catalog${state.publication}`,
      catalogPublishedAt: `2026-10-${String(17 + state.publication).padStart(2, '0')}T00:00:00Z`,
      cohort: `2026-09-23.${state.publication}`,
      resolvedApiVersion: 'api-places-v0.1',
      domain: 'overture',
      region: 'hk',
      schemaVersion: 'v1',
    }
    if (url.pathname.includes('/by-cell/'))
      return Response.json({
        places: state.ids.map(placeId => ({
          placeId,
          resourceReleaseId: 'resource',
          geometry: { type: 'Point', coordinates: [114.15, 22.3] },
        })),
        meta: {
          page: {
            limit: 100,
            offset: Number(url.searchParams.get('offset')),
            hasMore: state.partial,
          },
        },
      })
    const params = new URLSearchParams({
      releaseSet: meta.apiReleaseSet,
      catalogRevision: meta.apiCatalogRevision,
      knownAt: meta.catalogPublishedAt,
      cohort: meta.cohort,
      domain: meta.domain,
    })
    if (url.searchParams.get('page[limit]') === '1')
      return Response.json({
        meta,
        links: { permalink: `https://source.example/places/v0.1?${params}` },
      })
    state.onCanonical()
    const id = url.searchParams.get('filter[id]')!
    return Response.json({
      data: [
        {
          type: 'places',
          id,
          attributes: {
            geometry: { type: 'Point', coordinates: [114.1501, 22.3] },
            snapshotId: 'snapshot',
            resourceReleaseId: 'resource',
            addressSnapshotId: null,
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            phones: [],
            identifiers: null,
            i18n: { en: { name: 'Cafe', brandName: null } },
          },
        },
      ],
      meta: { ...meta, filters: { id }, page: { offset: 0, limit: 100, total: 1 } },
    })
  })
  return {
    state,
    fetcher,
    client: {
      baseUrl: 'https://source.example',
      apiKey: 'fixture',
      fetch: Object.assign(fetcher, { preconnect: () => {} }) as typeof fetch,
    } satisfies PlaceSourceClient,
  }
}

async function drain(
  s: Awaited<ReturnType<typeof setup>>,
  client: PlaceSourceClient,
  steps = 8,
) {
  const phases: string[] = []
  for (let i = 0; i < steps; i++)
    phases.push(await processLocationRematching(s.db, client))
  return phases
}
function review(s: Awaited<ReturnType<typeof setup>>) {
  return s.sqlite
    .prepare('SELECT id FROM locationIdentityReview ORDER BY rowid LIMIT 1')
    .get()!.id as string
}

describe('Open to Sync publication rematching (Refs #194)', () => {
  it('retains a candidate, accepts through guarded identity linking, and preserves independent Feature values', async () => {
    const s = await setup()
    const p = provider()
    const beforeFeature = s.sqlite.prepare('SELECT * FROM feature').all()
    const beforeAssociation = s.sqlite.prepare('SELECT * FROM featureLocation').all()
    const beforeNames = s.sqlite.prepare('SELECT * FROM featureI18n').all()
    expect(JSON.parse(beforeAssociation[0].acceptancePolicy as string).nameMode).toBe(
      'independent',
    )
    const phases = await drain(s, p.client)
    expect(phases).toContain('matched')
    expect(s.sqlite.prepare('SELECT count(*) n FROM location').get()!.n).toBe(1)
    const detail = await readLocationIdentityReview(s.db, {
      locationId: s.locationId,
      ownerOrganisationId: 'p',
      reviewId: review(s),
    })
    expect(detail?.stale).toBe(false)
    // Exact name (55) plus a pin within 25 m (25); missing address evidence is not exact identity.
    expect(detail?.rematch).toMatchObject({ incomplete: true, score: 80 })
    expect(
      (
        await acceptLocationIdentityReview(s.db, {
          locationId: s.locationId,
          ownerOrganisationId: 'p',
          reviewId: review(s),
          actorId: 'owner',
          reason: 'Verified identity',
        })
      ).status,
    ).toBe('applied')
    expect(s.sqlite.prepare('SELECT id,ssId FROM location').get()).toEqual({
      id: s.locationId,
      ssId: 'source',
    })
    expect(s.sqlite.prepare('SELECT * FROM feature').all()).toEqual(beforeFeature)
    expect(s.sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(
      beforeAssociation,
    )
    expect(s.sqlite.prepare('SELECT * FROM featureI18n').all()).toEqual(beforeNames)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()!.n,
    ).toBe(1)
  })

  it('deduplicates retries and repeated publication discovery, preserving multiple candidates', async () => {
    const s = await setup()
    const p = provider(['source', 'second'])
    expect(await drain(s, p.client, 10)).toContain('ambiguous')
    s.sqlite.exec('UPDATE locationRematchRun SET checkedAt=0')
    await drain(s, p.client)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(2)
    expect(s.sqlite.prepare('SELECT count(*) n FROM locationRematchJob').get()!.n).toBe(
      1,
    )
    expect(
      s.sqlite.prepare('SELECT status FROM locationRematchJob').get()!.status,
    ).toBe('ambiguous')
  })

  it.each([
    'manual',
    'archived',
    'inaccessible',
    'missing-coordinates',
    'premises',
  ] as const)('does not invent matches for %s', async scenario => {
    const a = address()
    if (scenario === 'manual') a.association!.mode = 'manual'
    if (scenario === 'missing-coordinates') a.coordinates = null
    if (scenario === 'premises') a.association!.kind = 'premises'
    const s = await setup(a)
    const p = provider()
    if (scenario === 'archived') s.sqlite.exec('UPDATE feature SET isArchived=1')
    if (scenario === 'inaccessible')
      s.sqlite.exec(
        "DROP TRIGGER feature_location_owner_scope; UPDATE location SET ownerOrganisationId='other'",
      )
    await drain(s, p.client)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(0)
    if (scenario === 'missing-coordinates' || scenario === 'premises')
      expect(
        s.sqlite.prepare('SELECT status FROM locationRematchJob').get()!.status,
      ).toBe('deferred')
    else
      expect(
        s.sqlite.prepare('SELECT count(*) n FROM locationRematchJob').get()!.n,
      ).toBe(0)
  })

  it('retains provider outages with backoff and offers explicit retry without losing intent', async () => {
    const s = await setup()
    const p = provider()
    await drain(s, p.client, 2)
    p.state.fail = true
    expect(await processLocationRematching(s.db, p.client)).toBe('failed')
    const job = s.sqlite.prepare('SELECT * FROM locationRematchJob').get()!
    expect(job.status).toBe('failed')
    expect(Number(job.retryAt)).toBeGreaterThan(Date.now())
    p.state.fail = false
    expect(
      await retryLocationRematch(s.db, {
        locationId: s.locationId,
        jobId: String(job.id),
      }),
    ).toBe(true)
    expect(await drain(s, p.client)).toContain('matched')
  })

  it('retains partial discovery and empty coverage as explicit uncertainty', async () => {
    const s = await setup()
    const p = provider([])
    p.state.partial = true
    await drain(s, p.client)
    expect(
      s.sqlite.prepare('SELECT status,incomplete FROM locationRematchJob').get(),
    ).toEqual({ status: 'deferred', incomplete: 1 })
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(0)
  })

  it.each(['private', 'missing'] as const)(
    'enforces source accessibility for a %s identity',
    async condition => {
      const s = await setup()
      const p = provider()
      if (condition === 'private') {
        expect(() =>
          s.sqlite.exec(
            "INSERT INTO location(id,kind,state,ssId,ownerOrganisationId) VALUES('occupied','establishment','linked','source','other')",
          ),
        ).toThrow('Source-linked Locations must be shared')
        return
      }
      s.sqlite
        .prepare(
          "INSERT INTO location(id,kind,state,ssId,ownerOrganisationId,sourceAvailability) VALUES('occupied','establishment','linked','source',?,?)",
        )
        .run(null, 'missing')
      await drain(s, p.client)
      expect(
        s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
      ).toBe(0)
      expect(
        s.sqlite.prepare('SELECT status FROM locationRematchJob').get()!.status,
      ).toBe('deferred')
    },
  )

  it('requires explicit merge review for an already occupied source identity without creating another Location', async () => {
    const s = await setup()
    const p = provider()
    s.sqlite.exec(
      "INSERT INTO location(id,kind,state,ssId,sourceAvailability) VALUES('occupied','establishment','linked','source','current')",
    )
    await drain(s, p.client)
    expect(
      (
        await acceptLocationIdentityReview(s.db, {
          locationId: s.locationId,
          ownerOrganisationId: 'p',
          reviewId: review(s),
          actorId: 'owner',
          reason: 'Reviewed',
        })
      ).status,
    ).toBe('merge-required')
    expect(s.sqlite.prepare('SELECT count(*) n FROM location').get()!.n).toBe(2)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()!.n,
    ).toBe(0)
    expect(
      s.sqlite.prepare('SELECT locationId FROM featureLocation').get()!.locationId,
    ).toBe(s.locationId)
  })

  it.each(['opt-out', 'expired-lease', 'successor-lease'] as const)(
    'fences %s during source retrieval before review capture',
    async scenario => {
      const s = await setup()
      const p = provider()
      await drain(s, p.client, 3)
      p.state.onCanonical = () => {
        if (scenario === 'opt-out')
          s.sqlite.exec(
            "UPDATE feature SET addressMeta=json_set(addressMeta,'$.address.association.mode','manual')",
          )
        else
          s.sqlite.exec(
            `UPDATE locationRematchRun SET leaseUntil=${scenario === 'expired-lease' ? 0 : Date.now() + 240000}${scenario === 'successor-lease' ? ",lease='successor'" : ''}`,
          )
      }
      await processLocationRematching(s.db, p.client)
      expect(
        s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
      ).toBe(0)
      expect(
        s.sqlite.prepare('SELECT candidateCursor FROM locationRematchJob').get()!
          .candidateCursor,
      ).toBe(0)
      if (scenario === 'successor-lease')
        expect(
          s.sqlite.prepare('SELECT lease FROM locationRematchRun').get()!.lease,
        ).toBe('successor')
    },
  )

  it.each(['opt-out', 'address-edit', 'publication', 'deleted'] as const)(
    'rejects a stale review after %s',
    async scenario => {
      const s = await setup()
      const p = provider()
      await drain(s, p.client)
      const id = review(s)
      if (scenario === 'opt-out')
        s.sqlite.exec(
          "UPDATE feature SET addressMeta=json_set(addressMeta,'$.address.association.mode','manual')",
        )
      if (scenario === 'address-edit')
        s.sqlite.exec(
          "UPDATE feature SET addressMeta=json_set(addressMeta,'$.address.overrides.en.streetName','Changed')",
        )
      if (scenario === 'publication') {
        s.sqlite.exec('UPDATE locationRematchRun SET checkedAt=0')
        p.state.publication++
        await processLocationRematching(s.db, p.client)
      }
      if (scenario === 'deleted') s.sqlite.exec('UPDATE feature SET isArchived=1')
      expect(
        (
          await acceptLocationIdentityReview(s.db, {
            locationId: s.locationId,
            ownerOrganisationId: 'p',
            reviewId: id,
            actorId: 'owner',
            reason: 'Reviewed',
          })
        ).status,
      ).toBe('conflict')
      expect(s.sqlite.prepare('SELECT ssId FROM location').get()!.ssId).toBeNull()
    },
  )

  it('suppresses rejected identities across retry and new publications for unchanged authored intent', async () => {
    const s = await setup()
    const p = provider()
    await drain(s, p.client)
    const input = {
      locationId: s.locationId,
      ownerOrganisationId: 'p',
      reviewId: review(s),
      actorId: 'owner',
      reason: 'Different business',
    }
    expect((await rejectLocationIdentityReview(s.db, input)).status).toBe('rejected')
    expect((await rejectLocationIdentityReview(s.db, input)).status).toBe('rejected')
    p.state.publication++
    s.sqlite.exec('UPDATE locationRematchRun SET checkedAt=0')
    await drain(s, p.client)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(1)
    expect(
      s.sqlite.prepare('SELECT status FROM locationRematchJob').get()!.status,
    ).toBe('suppressed')
  })

  it('prevents another Feature opt-out from receiving automatic source adoption', async () => {
    const s = await setup()
    const p = provider()
    await drain(s, p.client)
    const applied = await acceptLocationIdentityReview(s.db, {
      locationId: s.locationId,
      ownerOrganisationId: 'p',
      reviewId: review(s),
      actorId: 'owner',
      reason: 'Reviewed',
    })
    if (applied.status !== 'applied') throw new Error('Expected applied')
    s.sqlite.exec(
      "UPDATE feature SET addressMeta=json_set(addressMeta,'$.address.association.mode','manual')",
    )
    const before = s.sqlite.prepare('SELECT * FROM featureLocation').all()
    expect(
      (
        await adoptRefreshedLocationForFeature(s.db, {
          featureId: 'f',
          projectId: 'p',
          locationId: s.locationId,
          candidateRevisionId: applied.revisionId,
          guard: sql`1`,
        })
      ).reason,
    ).toBe('sync-opt-out')
    expect(s.sqlite.prepare('SELECT * FROM featureLocation').all()).toEqual(before)
  })

  it('pages realistic Feature batches and stays below the adapter-enforced 100 variable limit', async () => {
    const s = await setup()
    const p = provider([])
    // Reuse valid association snapshots; each Feature has independent durable intent.
    const columns = s.sqlite
      .prepare('PRAGMA table_info(featureLocation)')
      .all()
      .map(row => String(row.name))
    for (let i = 0; i < 63; i++) {
      const id = `batch-${String(i).padStart(3, '0')}`
      s.sqlite
        .prepare(
          "INSERT INTO feature(id,projectId,geometry,addressMeta) SELECT ?,'p',geometry,addressMeta FROM feature WHERE id='f'",
        )
        .run(id)
      s.sqlite
        .prepare(
          `INSERT INTO featureLocation(${columns.join(',')}) SELECT ${columns.map(col => (col === 'featureId' ? '?' : col)).join(',')} FROM featureLocation WHERE featureId='f'`,
        )
        .run(id)
    }
    expect(await processLocationRematching(s.db, p.client)).toBe('publication')
    expect(await processLocationRematching(s.db, p.client)).toBe('seeded')
    expect(s.sqlite.prepare('SELECT count(*) n FROM locationRematchJob').get()!.n).toBe(
      25,
    )
    await drain(s, p.client, 2)
    expect(s.sqlite.prepare('SELECT count(*) n FROM locationRematchJob').get()!.n).toBe(
      64,
    )
    expect(
      s.sqlite.prepare('SELECT scanning FROM locationRematchRun').get()!.scanning,
    ).toBe(0)
  })

  it('rolls back an interrupted receipt batch and resumes without duplicate or orphan reviews', async () => {
    const s = await setup()
    const p = provider()
    await drain(s, p.client, 3)
    s.sqlite.exec(
      "CREATE TRIGGER interrupt_receipt BEFORE INSERT ON locationRematchReview BEGIN SELECT RAISE(ABORT,'fixture interruption'); END",
    )
    expect(await processLocationRematching(s.db, p.client)).toBe('failed')
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(0)
    expect(
      s.sqlite.prepare('SELECT candidateCursor FROM locationRematchJob').get()!
        .candidateCursor,
    ).toBe(0)
    s.sqlite.exec('DROP TRIGGER interrupt_receipt')
    const jobId = String(
      s.sqlite.prepare('SELECT id FROM locationRematchJob').get()!.id,
    )
    await retryLocationRematch(s.db, { locationId: s.locationId, jobId })
    expect(await drain(s, p.client)).toContain('matched')
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(1)
  })

  it('deduplicates by source identity even when retry discovery changes candidate order', async () => {
    const s = await setup()
    const p = provider(['source', 'second'])
    await drain(s, p.client, 4)
    p.state.fail = true
    expect(await processLocationRematching(s.db, p.client)).toBe('failed')
    p.state.fail = false
    p.state.ids = ['second', 'source']
    // Force a changed retained discovery order, as can happen when an index refreshes mid-retry.
    const jobId = String(
      s.sqlite.prepare('SELECT id FROM locationRematchJob').get()!.id,
    )
    await retryLocationRematch(s.db, { locationId: s.locationId, jobId })
    await processLocationRematching(s.db, p.client)
    s.sqlite.exec(`UPDATE locationRematchJob SET candidates='["second","source"]'`)
    await drain(s, p.client)
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityReview').get()!.n,
    ).toBe(2)
    expect(
      s.sqlite.prepare('SELECT ssId FROM locationRematchReview ORDER BY ssId').all(),
    ).toEqual([{ ssId: 'second' }, { ssId: 'source' }])
  })

  it('fences an opt-out made after acceptance reads but before the atomic identity write', async () => {
    const s = await setup()
    const p = provider()
    await drain(s, p.client)
    s.db.batch = new Proxy(s.db.batch, {
      apply(target, receiver, args) {
        s.sqlite.exec(
          "UPDATE feature SET addressMeta=json_set(addressMeta,'$.address.association.mode','manual')",
        )
        return Reflect.apply(target, receiver, args)
      },
    })
    expect(
      (
        await acceptLocationIdentityReview(s.db, {
          locationId: s.locationId,
          ownerOrganisationId: 'p',
          reviewId: review(s),
          actorId: 'owner',
          reason: 'Reviewed',
        })
      ).status,
    ).toBe('conflict')
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationIdentityHistory').get()!.n,
    ).toBe(0)
    expect(s.sqlite.prepare('SELECT count(*) n FROM locationRevision').get()!.n).toBe(1)
  })

  it('shows only the opted-in Feature in existing Tasks and retains the opted-out neighbour values', async () => {
    const s = await setup()
    const p = provider()
    const manual = address()
    manual.association!.mode = 'manual'
    manual.overrides.en.streetName = 'Neighbour custom street'
    s.sqlite
      .prepare(
        "INSERT INTO feature(id,projectId,geometry,addressMeta) VALUES('neighbour','p',?,?)",
      )
      .run(
        JSON.stringify({ type: 'Point', coordinates: [114.1502, 22.3] }),
        JSON.stringify({ address: manual }),
      )
    const columns = s.sqlite
      .prepare('PRAGMA table_info(featureLocation)')
      .all()
      .map(row => String(row.name))
    s.sqlite
      .prepare(
        `INSERT INTO featureLocation(${columns.join(',')}) SELECT ${columns.map(col => (col === 'featureId' ? "'neighbour'" : col === 'version' ? "'neighbour-version'" : col)).join(',')} FROM featureLocation WHERE featureId='f'`,
      )
      .run()
    const before = s.sqlite
      .prepare("SELECT * FROM featureLocation WHERE featureId='neighbour'")
      .get()
    s.sqlite.exec(`ALTER TABLE feature ADD COLUMN organisationId TEXT DEFAULT 'p';
      CREATE TABLE task(id TEXT,organisationId TEXT,projectId TEXT,featureId TEXT,contributorId TEXT,reviewerId TEXT,isDraft INTEGER,type TEXT,message TEXT,isReviewed INTEGER,reviewOutcome TEXT,reviewAction TEXT,reviewReason TEXT,createdAt TEXT,modifiedAt TEXT);`)
    await drain(s, p.client)
    expect(
      await s.db.all(sql`${taskQueueProjection()} SELECT featureId,type FROM task`),
    ).toEqual([{ featureId: 'f', type: 'locationIdentity' }])
    const applied = await acceptLocationIdentityReview(s.db, {
      locationId: s.locationId,
      ownerOrganisationId: 'p',
      reviewId: review(s),
      actorId: 'owner',
      reason: 'Reviewed',
    })
    expect(applied.status).toBe('applied')
    if (applied.status !== 'applied') throw new Error('Expected applied')
    expect(
      (
        await adoptRefreshedLocationForFeature(s.db, {
          featureId: 'neighbour',
          projectId: 'p',
          locationId: s.locationId,
          candidateRevisionId: applied.revisionId,
          guard: sql`1`,
        })
      ).reason,
    ).toBe('sync-opt-out')
    expect(
      s.sqlite
        .prepare("SELECT * FROM featureLocation WHERE featureId='neighbour'")
        .get(),
    ).toEqual(before)
    expect(
      JSON.parse(
        s.sqlite.prepare("SELECT addressMeta FROM feature WHERE id='neighbour'").get()!
          .addressMeta as string,
      ).address,
    ).toEqual(manual)
  })
})

it('ranks complete address agreement above a closer entrance and never confuses premises/buildings', () => {
  const a = address()
  const projection = (
    number: string,
    coordinates: [number, number],
  ): SaanSeoiPlaceProjection => ({
    ssId: number,
    apiVersion: 'api-places-v0.1',
    releaseId: 'release',
    snapshotId: 'snapshot',
    rawSource: {},
    issues: [],
    facts: {
      names: { en: 'CAFÉ'.replace('É', 'E') },
      brands: [],
      phoneNumber: [],
      location: {
        geometry: { type: 'Point', coordinates },
        address: {
          ...emptyFeatureAddress().source,
          authored: {
            ...createLocalLocationAddress(),
            i18n: {
              en: {
                formattedAddress: '',
                streetName: 'My Road',
                buildingNumberExpression: number,
              },
            },
            unit: null,
            unitI18n: {},
          },
        },
      },
    },
  })
  const range = scoreLocationRematch(a, projection('11-16', [114.1505, 22.3]))!
  const entrance = scoreLocationRematch(a, projection('14', [114.15, 22.3]))!
  expect(range.score).toBeGreaterThan(entrance.score)
  expect(entrance.numberConflict).toBe(true)
  a.association!.kind = 'premises'
  expect(scoreLocationRematch(a, projection('11-16', [114.15, 22.3]))).toBeNull()
})
