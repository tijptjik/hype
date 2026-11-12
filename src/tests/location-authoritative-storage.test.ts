// TESTS
import { expect, it } from 'vitest'
// DRIZZLE
import { eq } from 'drizzle-orm'
// SCHEMA
import {
  location,
  locationRevision,
  locationRevisionInput,
} from '../lib/db/schema/location'
// DOMAIN
import { emptyFeatureAddress } from '../lib/addresses/featureAddress'
// FIXTURE
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'

it('writes one translation store through Drizzle and assembles existing domain join keys', async () => {
  const fixture = setupLifecycleDatabase(true)
  try {
    fixture.sqlite.exec(
      "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('single-store','unknown','unresolved','p')",
    )
    const facts = {
      entity: { kind: 'unknown' as const, details: {} },
      names: { en: 'Single store', 'zh-Hant': '單一儲存' },
      brands: [],
      phoneNumber: [],
      location: {
        geometry: {
          type: 'Point' as const,
          coordinates: [114, 22] as [number, number],
        },
        address: emptyFeatureAddress().source,
      },
    }
    await fixture.db.insert(locationRevisionInput).values({
      id: 'single-store-r',
      locationId: 'single-store',
      version: 1,
      origin: 'local',
      contentHash: 'test',
      rawSource: { evidence: 'unchanged' },
      facts,
    })
    const rows = await fixture.db
      .select()
      .from(location)
      .innerJoin(locationRevision, eq(locationRevision.locationId, location.id))
      .where(eq(location.id, 'single-store'))
    expect(rows[0].locationRevision.facts.names).toEqual(facts.names)
    const stored = fixture.sqlite
      .prepare("SELECT facts FROM locationRevision WHERE id='single-store-r'")
      .get()
    expect(JSON.parse(String(stored?.facts))).not.toHaveProperty('i18n')
    expect(
      fixture.sqlite
        .prepare(
          "SELECT count(*) n FROM locationRevisionI18n WHERE revisionId='single-store-r'",
        )
        .get()?.n,
    ).toBe(2)
    expect(
      fixture.sqlite.prepare('SELECT count(*) n FROM locationRevisionWriteScope').get()
        ?.n,
    ).toBe(0)
  } finally {
    fixture.sqlite.close()
  }
})
