import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
import { resolveSharedCorrections } from '#lib/locations/sharedCorrection.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { locationAccessibility } from '../schema/locationAccessibility'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  AccessibilitySchema,
  AccessibilitySaveSchema,
} from '#lib/locations/accessibility.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { canonicalLocationSQL } from './locationRedirect'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  AccessibilityRecord,
  AccessibilitySave,
  AccessibilityView,
} from '#lib/locations/accessibility.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. CURRENT SUBJECT AND OBSERVATIONS
// 2. SHARED READS AND REVISION WRITES
// ---
type Subject = { id: string; kind: string; revisionId: string; facts: string }
type Row = {
  id: string
  locationId: string
  valuesJson: string
  placementKey: string
  recordedAt: string
}

/** Read only shared, live physical subjects; private records never enter this contribution stream.
 * @param db Request database. @param locationId Exact subject, without redirect mutation.
 * @returns Latest authoritative snapshot, or null for unsupported/invisible subjects.
 */
export async function accessibilitySubject(
  db: Database,
  locationId: string,
): Promise<Subject | null> {
  return (
    (await db.get<Subject>(sql`SELECT l.id,l.kind,v.id revisionId,v.facts FROM location l
    JOIN locationRevision v ON v.locationId=l.id
    WHERE l.id=${locationId} AND l.state IN ('linked','unresolved')
    AND l.kind IN ('establishment','building','premises') AND (l.state!='linked' OR v.origin='saanseoi')
    ORDER BY v.version DESC LIMIT 1`)) ?? null
  )
}

/** Bind observations to physical placement, so relocation cannot silently reuse them.
 * @param db Request database. @param subject Current authoritative snapshot.
 * @returns Stable placement token including current shared occupancy assertions.
 */
async function placementKey(db: Database, subject: Subject): Promise<string> {
  const facts = readLocationFacts(subject.facts)
  const occupancy = await db.all<{
    id: string
  }>(sql`SELECT id FROM locationOccupancyHead
    WHERE establishmentLocationId=${subject.id} AND scopeOrganisationId IS NULL
    AND assertionState='asserted' AND occupancyState='current' ORDER BY id`)
  return JSON.stringify({
    position: facts.location,
    occupancy: occupancy.map(r => r.id),
  })
}

/** Decode a retained observation without interpreting unknown as a negative answer.
 * @param row Stored observation. @param key Current placement token.
 * @returns Display values with explicit recheck state.
 */
function decode(row: Row, key: string): AccessibilityRecord {
  return {
    id: row.id,
    locationId: row.locationId,
    values: AccessibilitySchema.parse(JSON.parse(row.valuesJson)),
    recordedAt: row.recordedAt,
    stale: row.placementKey !== key,
  }
}

/** Read direct facts and separately attributed current venue reports, never a building-wide rating.
 * @param db Request database. @param locationId Exact shared subject.
 * @returns Direct observation plus at most 50 venues; no private or scoped occupancy leaks.
 */
export async function readLocationAccessibility(
  db: Database,
  locationId: string,
): Promise<AccessibilityView | null> {
  const subject = await accessibilitySubject(db, locationId)
  if (!subject) return null
  const row = await db.get<Row>(
    sql`SELECT * FROM locationAccessibilityHead WHERE locationId=${locationId}`,
  )
  let record = row ? decode(row, await placementKey(db, subject)) : null
  const shared = await readSharedLocationCorrection(db, locationId)
  const facts = readLocationFacts(subject.facts)
  const effective = shared
    ? resolveSharedCorrections(facts, JSON.parse(shared.corrections)).facts
    : facts
  if (effective.accessibility && (!record || shared))
    record = {
      id: row?.id ?? '',
      locationId,
      values: effective.accessibility,
      recordedAt: shared?.createdAt ?? '',
      stale: record?.stale ?? false,
    }
  const venues: AccessibilityView['venues'] = []
  // Only explicit shared current tenancy establishes this signal; never infer it from proximity or an address string.
  const children =
    subject.kind === 'establishment'
      ? []
      : await db.all<Row & { facts: string; occupancy: string }>(sql`
    SELECT DISTINCT a.*,v.facts,
      (SELECT json_group_array(id) FROM (SELECT id FROM locationOccupancyHead
        WHERE establishmentLocationId=l.id AND scopeOrganisationId IS NULL
        AND assertionState='asserted' AND occupancyState='current' ORDER BY id)) occupancy
    FROM locationOccupancyHead r JOIN location l ON l.id=${canonicalLocationSQL(sql`r.establishmentLocationId`)}
    JOIN locationAccessibilityHead a ON a.locationId=l.id
    JOIN locationRevision v ON v.id=(SELECT latest.id FROM locationRevision latest
      WHERE latest.locationId=l.id AND (l.state!='linked' OR latest.origin='saanseoi') ORDER BY latest.version DESC LIMIT 1)
    WHERE ${canonicalLocationSQL(sql`r.containerLocationId`)}=${locationId}
    AND r.scopeOrganisationId IS NULL AND r.assertionState='asserted' AND r.occupancyState='current'
    AND l.state IN ('linked','unresolved') AND l.kind='establishment' ORDER BY l.id LIMIT 51`)
  // Fetch venue snapshots and occupancy tokens in one bounded query rather than one request per tenant.
  for (const child of children.slice(0, 50)) {
    const facts = readLocationFacts(child.facts)
    const report = decode(
      child,
      JSON.stringify({
        position: facts.location,
        occupancy: JSON.parse(child.occupancy),
      }),
    )
    // Historical placement observations remain visible on their own record, not as current building signals.
    if (
      report.stale ||
      Object.values(report.values).every(value => value === 'unknown')
    )
      continue
    venues.push({
      locationId: child.locationId,
      names: facts.names,
      record: report,
    })
  }
  return {
    locationRevisionId: subject.revisionId,
    observationId: row?.id ?? null,
    record,
    venues,
    moreVenues: children.length > 50,
  }
}

/** Append shared values with both observation-head and source-revision concurrency fences.
 * @param db Request database. @param raw Validated values and expected revisions. @param actorId Authenticated contributor.
 * @returns New immutable observation ID; competing writes fail without replacing history.
 */
export async function saveLocationAccessibility(
  db: Database,
  raw: AccessibilitySave,
  actorId: string,
  rights: { canEdit: boolean; superAdmin: boolean } = {
    canEdit: false,
    superAdmin: false,
  },
): Promise<string> {
  const input = AccessibilitySaveSchema.parse(raw)
  const subject = await accessibilitySubject(db, input.locationId)
  if (!subject || subject.revisionId !== input.expectedLocationRevisionId)
    throw new Error('ACCESSIBILITY_CHANGED')
  const key = await placementKey(db, subject)
  const id = crypto.randomUUID()
  // INSERT SELECT makes a stale head, source snapshot or subject eligibility a no-op, including the first-write race.
  const head = await readSharedLocationCorrection(db, input.locationId)
  const shared = await prepareSharedLocationCorrection(db, {
    locationId: input.locationId,
    sourceRevisionId: subject.revisionId,
    expectedRevision: head?.id ?? null,
    actorId,
    rights,
    patch: { accessibility: { mode: 'override', value: input.values } },
    guard: sql`(SELECT id FROM locationAccessibilityHead WHERE locationId=${input.locationId}) IS ${input.expectedId}`,
  }).catch(cause => {
    if (cause instanceof Error && cause.message === 'SHARED_LOCATION_CHANGED')
      throw new Error('ACCESSIBILITY_CHANGED')
    throw cause
  })
  const inserted = await executeRevisionBatch(db, shared.guard, [
    ...shared.queries,
    db
      .insert(locationAccessibility)
      .select(sql`    SELECT ${id},${input.locationId},${input.expectedId},${subject.revisionId},${key},${JSON.stringify(input.values)},${actorId},strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE (SELECT id FROM locationAccessibilityHead WHERE locationId=${input.locationId}) IS ${input.expectedId}
    AND (SELECT v.id FROM locationRevision v JOIN location l ON l.id=v.locationId
      WHERE l.id=${input.locationId} AND l.state IN ('linked','unresolved')
      AND l.kind IN ('establishment','building','premises')
      AND (l.state!='linked' OR v.origin='saanseoi') ORDER BY v.version DESC LIMIT 1)=${subject.revisionId}
    AND (SELECT json_group_array(id) FROM (SELECT id FROM locationOccupancyHead
      WHERE establishmentLocationId=${subject.id} AND scopeOrganisationId IS NULL
      AND assertionState='asserted' AND occupancyState='current' ORDER BY id))=${JSON.stringify(JSON.parse(key).occupancy)}
`)
      .returning({ id: locationAccessibility.id }),
    prepareRevisionCheck(db, sql`changes()=1`),
  ])
  if (!inserted) throw new Error('ACCESSIBILITY_CHANGED')
  return id
}
