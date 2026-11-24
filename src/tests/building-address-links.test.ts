// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { retainPublishedAddress } from '#lib/db/services/addressCanonical.js'
import {
  linkedAddressLabels,
  linkBuildingAddressRevisions,
} from '#lib/db/services/buildingAddressLinks.js'

import { hasLocationRelationshipsSQL } from '#lib/db/services/locationRelationshipReview.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
it('retains three distinct addresses on one scoped building and reuses links on retry', async () => {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  store.sqlite.exec(
    "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('building','building','unresolved','p')",
  )
  const revisions = []
  for (const number of ['32', '34', '34A']) {
    const id = 'ss-' + number
    const raw = {
      data: {
        type: 'addresses',
        id,
        attributes: {
          scope: 'building',
          snapshotId: 'snapshot',
          i18n: { en: { formattedAddress: number + ' Tak Ku Ling Road' } },
        },
      },
      meta: { apiReleaseSet: 'release' },
    }
    expect(await retainPublishedAddress(store.db, id, 'stale', raw, sql`1`)).toBeNull()
    const revision = await retainPublishedAddress(store.db, id, 'snapshot', raw, sql`1`)
    expect(revision).toBeTruthy()
    revisions.push(revision!)
  }
  store.sqlite.exec(
    "CREATE TRIGGER fail_link BEFORE INSERT ON locationAddress WHEN (SELECT count(*) FROM locationAddress)=1 BEGIN SELECT RAISE(ABORT,'simulated failure'); END",
  )
  await expect(
    linkBuildingAddressRevisions(store.db, 'building', 'p', revisions, 'editor'),
  ).rejects.toThrow()
  expect(store.sqlite.prepare('SELECT count(*) n FROM locationAddress').get()?.n).toBe(
    0,
  )
  store.sqlite.exec('DROP TRIGGER fail_link')
  await linkBuildingAddressRevisions(store.db, 'building', 'p', revisions, 'editor')
  await linkBuildingAddressRevisions(
    store.db,
    'building',
    'p',
    revisions,
    'another-editor',
  )
  expect(store.sqlite.prepare('SELECT count(*) n FROM locationAddress').get()?.n).toBe(
    3,
  )
  const labels = async (scope: string | null) =>
    JSON.parse(
      (await store.db.get<{ labels: string }>(
        sql`SELECT ${linkedAddressLabels(sql`'building'`, scope)} labels`,
      ))!.labels,
    )
  expect(await labels('p')).toEqual([
    '32 Tak Ku Ling Road',
    '34 Tak Ku Ling Road',
    '34A Tak Ku Ling Road',
  ])
  expect(await labels('other')).toEqual([])
  const recorded = (scope: string) =>
    store.db.get<{ value: number }>(
      sql`SELECT ${hasLocationRelationshipsSQL(sql`'building'`, sql`${scope}`)} value`,
    )
  expect(await recorded('p')).toEqual({ value: 1 })
  expect(await recorded('other')).toEqual({ value: 0 })
  expect(await labels(null)).toEqual([])
})
