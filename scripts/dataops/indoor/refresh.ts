// NODE
import { resolve } from 'node:path'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SERVICES
import {
  readMapBundle,
  saveMapDraft,
  publishMapDraft,
} from '../../../src/lib/db/services/premisesMap'
import { prepareCorrectedMap } from '../../../src/lib/db/services/premisesMapCorrection'
import { retryBusyRead } from '../../../src/lib/db/services/sqlite'
// SCHEMA
import {
  premisesMap,
  premisesMapCorrection,
} from '../../../src/lib/db/schema/premisesMap'
import { systemTask } from '../../../src/lib/db/schema/systemTask'
// DOMAIN
import { applyMapCorrection } from '../../../src/lib/indoor/corrections'
import { normalizeMapFacilityLabels } from '../../../src/lib/indoor/facilityLabels'
import { validateMapBundle, type MapBundle } from '../../../src/lib/indoor/releases'
import { canonical, contentHash, sha256 } from './content'
import { readEntry, type Snapshot, type Target } from './fetch'
import catalogue from '../../../src/lib/routing/mtr-catalog.json'
// TYPES
import type { Database } from '../../../src/lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'

// TOC: Manifest validation | Published baseline comparison | Correction replay and publication
export type Comparison = {
  venueId: string
  mapId?: string
  status: 'new' | 'changed' | 'unchanged' | 'missing' | 'invalid' | 'blocked'
  publishedReleaseHash?: string
  publishedHash?: string
  publishedContentHash?: string
  downloadedContentHash?: string
  reason?: string
}
/** Expected curation exceptions preserve the publication and enter the review queue. */
class ReviewRequired extends Error {}

type Stored = {
  row: typeof premisesMap.$inferSelect
  sourceHash: string
  content?: string
  reason?: string
}

/** Validate the complete snapshot and prevent cross-target publication.
 * @param directory Snapshot directory. @param target Explicit destination. @returns Complete manifest.
 */
export async function readSnapshot(
  directory: string,
  target: Target,
): Promise<Snapshot> {
  const snapshot = (await Bun.file(
    resolve(directory, 'snapshot.json'),
  ).json()) as Snapshot
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.target !== target ||
    !['mtr', 'buildings'].includes(snapshot.dataset) ||
    !Array.isArray(snapshot.inventoryIds) ||
    !Array.isArray(snapshot.entries)
  )
    throw new Error('Invalid snapshot or target mismatch')
  const ids = new Set(snapshot.inventoryIds)
  if (
    !ids.size ||
    ids.size !== snapshot.inventoryIds.length ||
    snapshot.entries.length !== ids.size ||
    new Set(snapshot.entries.map(e => e.venueId)).size !== ids.size ||
    snapshot.entries.some(e => !ids.has(e.venueId))
  )
    throw new Error('Incomplete snapshot inventory')
  return snapshot
}

/** Resolve immutable published source baselines by exact upstream venue UUID.
 * @param db Target database. @param bucket Target objects. @param snapshot Source family. @returns Current publication index.
 */
async function publishedIndex(
  db: Database,
  bucket: R2Bucket,
  snapshot: Snapshot,
): Promise<Map<string, Stored>> {
  const rows = await retryBusyRead(() =>
    db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.kind, snapshot.dataset === 'mtr' ? 'station' : 'building')),
  )
  const result = new Map<string, Stored>()
  for (const row of rows) {
    if (!row.publishedHash) continue
    const published = await readMapBundle(bucket, row.id, row.publishedHash)
    if (published.data.coordinateSpace === 'image-pixels') continue
    const publishedVenue = String(
      published.data.venue_polygon.features[0].properties.venue_id,
    )
    if (!/^[a-f0-9-]{36}$/i.test(publishedVenue)) continue
    if (!published.data.sourceSnapshotHash) {
      result.set(publishedVenue, {
        row,
        sourceHash: row.publishedHash,
        reason:
          'Published legacy map has no retained source baseline; verify its baseline before refresh',
      })
      continue
    }
    const source = await readMapBundle(
      bucket,
      row.id,
      published.data.sourceSnapshotHash,
    )
    const venueId = String(source.data.venue_polygon.features[0].properties.venue_id)
    if (result.has(venueId))
      throw new Error(`Ambiguous existing source identity: ${venueId}`)
    result.set(venueId, {
      row,
      sourceHash: published.data.sourceSnapshotHash,
      content: contentHash(source),
    })
  }
  return result
}

/** Recognize an interrupted publication without accepting an editor's draft.
 * @param bucket Storage. @param row Current map. @param digest Fresh content hash. @returns Verified resumable draft, if any.
 */
async function resumableDraft(
  bucket: R2Bucket,
  row: typeof premisesMap.$inferSelect,
  digest: string,
): Promise<MapBundle | undefined> {
  if (row.updatedBy !== 'indoor-dataops' || !row.draftHash) return undefined
  const draft = await readMapBundle(bucket, row.id, row.draftHash)
  if (!draft.data.sourceSnapshotHash || draft.data.correctionIssues?.length)
    return undefined
  const source = await readMapBundle(bucket, row.id, draft.data.sourceSnapshotHash)
  return contentHash(source) === digest ? draft : undefined
}

/** Compare source content against the source snapshot retained by the current published hash.
 * @param db Target database. @param bucket Target storage. @param directory Downloaded snapshot. @param target Target selection. @returns Complete change report.
 */
export async function compareSnapshot(
  db: Database,
  bucket: R2Bucket,
  directory: string,
  target: Target,
): Promise<Comparison[]> {
  const snapshot = await readSnapshot(directory, target),
    existing = await publishedIndex(db, bucket, snapshot)
  const report: Comparison[] = []
  for (const entry of snapshot.entries) {
    const current = existing.get(entry.venueId)
    const comparison: Comparison = {
      venueId: entry.venueId,
      mapId: current?.row.id,
      status: 'new',
      publishedHash: current?.row.publishedHash ?? undefined,
      publishedContentHash: current?.content,
      downloadedContentHash: entry.contentHash,
    }
    try {
      validateMapBundle(await readEntry(directory, entry))
      comparison.status = current
        ? current.content === entry.contentHash
          ? 'unchanged'
          : 'changed'
        : 'new'
      if (current?.reason) {
        comparison.status = 'blocked'
        comparison.reason = current.reason
      }
      if (
        current &&
        current.row.draftHash !== current.row.publishedHash &&
        comparison.status === 'changed'
      ) {
        if (!(await resumableDraft(bucket, current.row, entry.contentHash))) {
          comparison.status = 'blocked'
          comparison.reason = 'Unpublished local edits'
        }
      }
    } catch (error) {
      comparison.status = 'invalid'
      comparison.reason = String(error)
    }
    report.push(comparison)
  }
  for (const [venueId, current] of existing)
    if (!snapshot.inventoryIds.includes(venueId))
      report.push({
        venueId,
        mapId: current.row.id,
        status: 'missing',
        publishedHash: current.row.publishedHash ?? undefined,
        reason: 'Venue disappeared upstream; publication retained',
      })
  return report
}

/** Record one deduplicated system issue per source observation. @param db Database. @param comparison Issue. @param dataset Source family. @returns Completion. */
async function issue(
  db: Database,
  comparison: Comparison,
  dataset: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .insert(systemTask)
    .values({
      id: `map-refresh:${sha256(canonical({ dataset, venueId: comparison.venueId, status: comparison.status, content: comparison.downloadedContentHash ?? comparison.publishedHash, reason: comparison.reason }))}`,
      resource: 'premisesMap',
      resourceId: comparison.mapId ?? comparison.venueId,
      type: `map-refresh-${comparison.status}`,
      sourceSnapshotHash: comparison.downloadedContentHash,
      title: `${comparison.mapId ?? comparison.venueId} · Upstream map ${comparison.status}`,
      message: comparison.reason ?? 'Review the upstream map refresh.',
      isReviewed: false,
      createdAt: now,
      modifiedAt: now,
    })
    .onConflictDoNothing()
}

/** Derive first-import identity only; subsequent refreshes use exact source UUID matching.
 * @param source Source bundle. @param snapshot Source family. @param venueId Stable UUID. @returns Initial registry values.
 */
function identity(
  source: MapBundle,
  snapshot: Snapshot,
  venueId: string,
): {
  id: string
  code: string
  name: string
  nameZh: string
  kind: 'station' | 'building'
} {
  const props = source.data.venue_polygon.features[0].properties
  const name = String(props.venue_name_en),
    nameZh = String(props.venue_name_zh ?? '')
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)
      .replace(/-$/, '') || 'building'
  if (snapshot.dataset === 'mtr') {
    const station = catalogue.stations.find(
      s => s.name.toLowerCase() === name.replace(/ Station$/, '').toLowerCase(),
    )
    if (!station) throw new ReviewRequired(`Unrecognised MTR venue: ${name}`)
    return {
      id: `${slug(station.name)}-mtr`,
      code: station.id,
      name: station.name,
      nameZh: station.nameZh,
      kind: 'station',
    }
  }
  return {
    id: `${slug(name)}-${venueId.slice(0, 8)}`,
    code: `BLDG-${venueId.toUpperCase()}`,
    name,
    nameZh,
    kind: 'building',
  }
}

/** Publish only new upstream content, preserving curated/draft state and atomically creating review tasks.
 * @param db Target database. @param bucket Target storage. @param directory Snapshot directory. @param target Explicit environment. @returns Per-venue outcomes.
 * @remarks Rechecks publication versions immediately before writing. Failed writes are never blindly retried.
 */
export async function publishSnapshot(
  db: Database,
  bucket: R2Bucket,
  directory: string,
  target: Target,
): Promise<Comparison[]> {
  const snapshot = await readSnapshot(directory, target)
  const report = await compareSnapshot(db, bucket, directory, target)
  for (const comparison of report) {
    if (comparison.status === 'unchanged') continue
    if (!['new', 'changed'].includes(comparison.status)) {
      await issue(db, comparison, snapshot.dataset)
      continue
    }
    const entry = snapshot.entries.find(e => e.venueId === comparison.venueId)
    if (!entry) throw new ReviewRequired('Missing source entry')
    try {
      const source = validateMapBundle(await readEntry(directory, entry))
      const initial = comparison.mapId
        ? undefined
        : identity(source, snapshot, entry.venueId)
      const id = comparison.mapId ?? initial?.id
      if (!id) throw new ReviewRequired('Missing map identity')
      comparison.mapId = id
      let current = await retryBusyRead(() =>
        db.select().from(premisesMap).where(eq(premisesMap.id, id)).get(),
      )
      if (initial && current && current.code !== initial.code)
        throw new ReviewRequired('Existing map identity conflicts with source UUID')
      if ((current?.publishedHash ?? undefined) !== comparison.publishedHash)
        throw new ReviewRequired('Publication changed during refresh; compare again')
      if (current && current.draftHash !== current.publishedHash) {
        const draft = await resumableDraft(bucket, current, entry.contentHash)
        if (!draft || !current.draftHash)
          throw new ReviewRequired('Unpublished draft must be reviewed before refresh')
        await publishMapDraft(db, bucket, {
          id,
          hash: current.draftHash,
          expectedDraftVersion: current.draftVersion,
          expectedPublishedVersion: current.publishedVersion,
          actorId: 'indoor-dataops',
          upstreamReview: {
            sourceSnapshotHash: String(draft.data.sourceSnapshotHash),
            name: current.name,
          },
        })
        comparison.publishedReleaseHash = current.draftHash
        console.log(`Resumed publication ${id}`)
        continue
      }
      const previous = current?.publishedHash
        ? await readMapBundle(bucket, id, current.publishedHash)
        : undefined
      const sourceDataset =
        previous?.data.sourceDataset ??
        (snapshot.dataset === 'mtr' ? 'landsd-mtr' : 'landsd-building')
      const corrections = await retryBusyRead(() =>
        db
          .select()
          .from(premisesMapCorrection)
          .where(
            and(
              eq(premisesMapCorrection.mapId, id),
              eq(premisesMapCorrection.sourceDataset, sourceDataset),
            ),
          ),
      )
      if (previous) {
        const baseline = await readMapBundle(
          bucket,
          id,
          String(previous.data.sourceSnapshotHash),
        )
        const expected = structuredClone(baseline)
        normalizeMapFacilityLabels(expected.data)
        const expectedOriginal = structuredClone(baseline)
        for (const correction of corrections) {
          applyMapCorrection(expected, correction)
          applyMapCorrection(expectedOriginal, correction)
        }
        // Retained legacy publications may predate shared facility-label formatting.
        if (
          contentHash(expected) !== contentHash(previous) &&
          contentHash(expectedOriginal) !== contentHash(previous)
        )
          throw new ReviewRequired(
            'Published polygon edits are not represented by corrections; curate before refresh',
          )
      }
      if (!current) {
        if (!initial) throw new ReviewRequired('Missing initial registry values')
        await db.insert(premisesMap).values({
          ...initial,
          updatedBy: 'indoor-dataops',
          updatedAt: new Date().toISOString(),
        })
        current = await retryBusyRead(() =>
          db.select().from(premisesMap).where(eq(premisesMap.id, id)).get(),
        )
      }
      if (!current) throw new ReviewRequired('Map registration failed')
      const corrected = await prepareCorrectedMap(db, bucket, {
        id,
        sourceDataset,
        bundle: source,
        corrections,
      })
      if (corrected.data.correctionIssues?.length)
        throw new ReviewRequired('Correction conflicts require system-admin review')
      // Legacy connector edits must become replayable curations before automated refresh can replace them.
      if (
        previous?.data.connections?.some(
          connection =>
            !corrected.data.connections?.some(
              next =>
                canonical({ ...next, evidence: undefined }) ===
                canonical({ ...connection, evidence: undefined }),
            ),
        )
      )
        throw new ReviewRequired(
          'Existing connector curations cannot be replayed safely',
        )
      if (previous) {
        corrected.documents = previous.documents
        corrected.data.documents = previous.data.documents
        corrected.data.attributionLogo = previous.data.attributionLogo
        corrected.data.unmappedPlaces = previous.data.unmappedPlaces
      }
      const draft = await saveMapDraft(db, bucket, {
        id,
        expectedVersion: current.draftVersion,
        bundle: corrected,
        actorId: 'indoor-dataops',
      })
      await publishMapDraft(db, bucket, {
        id,
        hash: draft.hash,
        expectedDraftVersion: draft.version,
        expectedPublishedVersion: current.publishedVersion,
        actorId: 'indoor-dataops',
        upstreamReview: {
          sourceSnapshotHash: String(corrected.data.sourceSnapshotHash),
          name: current.name,
        },
      })
      comparison.publishedReleaseHash = draft.hash
      console.log(`Published ${id}`)
    } catch (error) {
      if (!(error instanceof ReviewRequired)) throw error
      comparison.status = 'blocked'
      comparison.reason = String(error)
      await issue(db, comparison, snapshot.dataset)
    }
  }
  return report
}
