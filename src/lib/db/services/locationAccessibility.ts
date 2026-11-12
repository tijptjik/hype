import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
import { resolveSharedCorrections } from '#lib/locations/sharedCorrection.js'
import { executeRevisionBatch } from './revisionBatch'
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
    (await db.get<Subject>(sql`SELECT l.id,l.matchingType AS kind,v.id revisionId,v.facts FROM location l
    JOIN locationRevisionContent v ON v.locationId=l.id
    WHERE l.id=${locationId} AND l.state IN ('linked','unresolved')
    AND l.matchingType IN ('establishment','building','premises') AND (l.state!='linked' OR v.origin='saanseoi')
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

/** Resolve mobility through ordinary community facts, retaining old observations as a read-only fallback.
 * @param db Request database. @param subject Shared Location snapshot.
 * @returns Community values and their optimistic concurrency token.
 */
async function readDirect(
  db: Database,
  subject: Subject,
): Promise<{ record: AccessibilityRecord | null; token: string | null }> {
  const shared = await readSharedLocationCorrection(db, subject.id)
  const facts = readLocationFacts(subject.facts)
  const corrections = shared ? JSON.parse(shared.corrections) : {}
  const effective = shared ? resolveSharedCorrections(facts, corrections).facts : facts
  // An explicit community clear must never resurrect a legacy observation.
  if (corrections.accessibility || effective.accessibility)
    return {
      token: shared?.id ?? null,
      record: effective.accessibility
        ? {
            id: shared?.id ?? subject.revisionId,
            locationId: subject.id,
            values: effective.accessibility,
            recordedAt: shared?.createdAt ?? '',
            stale: corrections.accessibility?.placementKey
              ? corrections.accessibility.placementKey !==
                (await placementKey(db, subject))
              : false,
          }
        : null,
    }
  const legacy = await db.get<Row>(
    sql`SELECT * FROM locationAccessibilityHead WHERE locationId=${subject.id}`,
  )
  return {
    token: shared?.id ?? legacy?.id ?? null,
    record: legacy ? decode(legacy, await placementKey(db, subject)) : null,
  }
}

/** Read community mobility facts and separately labelled current venue signals.
 * @param db Request database. @param locationId Exact shared subject.
 * @returns Direct facts and at most 50 named venues; no private occupancy is exposed.
 */
export async function readLocationAccessibility(
  db: Database,
  locationId: string,
): Promise<AccessibilityView | null> {
  const subject = await accessibilitySubject(db, locationId)
  if (!subject) return null
  const direct = await readDirect(db, subject)
  // Explicit public tenancy supplies venue signals; proximity never grants inheritance.
  const children =
    subject.kind === 'establishment'
      ? []
      : await db.all<Subject>(sql`
    SELECT DISTINCT l.id,l.matchingType AS kind,v.id revisionId,v.facts
    FROM locationOccupancyHead r JOIN location l ON l.id=${canonicalLocationSQL(sql`r.establishmentLocationId`)}
    JOIN locationRevisionContent v ON v.id=(SELECT latest.id FROM locationRevisionContent latest
      WHERE latest.locationId=l.id AND (l.state!='linked' OR latest.origin='saanseoi') ORDER BY latest.version DESC LIMIT 1)
    WHERE ${canonicalLocationSQL(sql`r.containerLocationId`)}=${locationId}
    AND r.scopeOrganisationId IS NULL AND r.assertionState='asserted' AND r.occupancyState='current'
    AND l.state IN ('linked','unresolved') AND l.matchingType='establishment' ORDER BY l.id LIMIT 51`)
  const venues: AccessibilityView['venues'] = []
  for (const child of children.slice(0, 50)) {
    const { record } = await readDirect(db, child)
    if (
      !record ||
      record.stale ||
      Object.values(record.values).every(value => value === 'unknown')
    )
      continue
    venues.push({
      locationId: child.id,
      names: readLocationFacts(child.facts).names,
      record,
    })
  }
  return {
    locationRevisionId: subject.revisionId,
    observationId: direct.token,
    record: direct.record,
    venues,
    moreVenues: children.length > 50,
  }
}

/** Compatibility API for ordinary community curation with head and source concurrency fences.
 * @param db Request database. @param raw Validated values and expected revisions. @param actorId Authenticated contributor.
 * @returns New community revision ID; legacy observation history is never rewritten.
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
  const current = await readDirect(db, subject)
  if (current.token !== input.expectedId) throw new Error('ACCESSIBILITY_CHANGED')
  const head = await readSharedLocationCorrection(db, input.locationId)
  // All new answers live only in the standard curation history and replication path.
  const shared = await prepareSharedLocationCorrection(db, {
    locationId: input.locationId,
    sourceRevisionId: subject.revisionId,
    expectedRevision: head?.id ?? null,
    actorId,
    rights,
    patch: { accessibility: { mode: 'override', value: input.values } },
    guard: sql`EXISTS(SELECT 1 FROM location WHERE id=${input.locationId} AND state IN ('linked','unresolved') AND matchingType IN ('establishment','building','premises'))`,
  }).catch(cause => {
    if (cause instanceof Error && cause.message === 'SHARED_LOCATION_CHANGED')
      throw new Error('ACCESSIBILITY_CHANGED')
    throw cause
  })
  if (!(await executeRevisionBatch(db, shared.guard, shared.queries)))
    throw new Error('ACCESSIBILITY_CHANGED')
  return shared.id
}
