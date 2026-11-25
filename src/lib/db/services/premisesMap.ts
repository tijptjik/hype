// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch'
import { systemTask } from '../schema/systemTask'
// SCHEMA
import {
  premisesMap,
  premisesMapPublication,
  premisesMapDraftRevision,
  premisesMapUnit,
} from '../schema/premisesMap'
// DOMAIN
import {
  MAX_MAP_BUNDLE_BYTES,
  mapHash,
  mapReleaseKey,
  validateMapBundle,
  type MapBundle,
} from '#lib/indoor/releases.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { R2Bucket } from '@cloudflare/workers-types'

// TOC: Immutable objects | Draft saves | Atomic publication

/** Read an integrity-checked immutable map bundle. @param bucket Environment storage. @param id Map ID. @param hash Exact release. @returns Validated bundle. */
export async function readMapBundle(
  bucket: R2Bucket,
  id: string,
  hash: string,
): Promise<MapBundle> {
  const object = await bucket.get(mapReleaseKey(id, hash))
  if (!object) throw new Error('Map release is missing from storage')
  const text = await object.text()
  if ((await mapHash(text)) !== hash)
    throw new Error('Map release integrity check failed')
  return validateMapBundle(JSON.parse(text))
}

/** Save a draft without changing the published release. @param db Database. @param bucket Environment storage. @param input Optimistic version, content and actor. @returns New draft pointer. @remarks R2 writes precede the conditional database update; losing writers leave harmless unreferenced objects. */
export async function saveMapDraft(
  db: Database,
  bucket: R2Bucket,
  input: {
    id: string
    expectedVersion: number
    bundle: unknown
    actorId: string
    correctionWrites?: BatchItem<'sqlite'>[]
  },
): Promise<{ hash: string; version: number }> {
  const bundle = validateMapBundle(input.bundle)
  // Live occupancy presentation is never copied into immutable physical geometry.
  delete bundle.data.unitArtwork
  delete bundle.data.releaseHash
  delete bundle.data.basePath
  const text = JSON.stringify(bundle)
  if (new TextEncoder().encode(text).length > MAX_MAP_BUNDLE_BYTES)
    throw new Error('Map bundle exceeds 64 MiB')
  const hash = await mapHash(text),
    key = mapReleaseKey(input.id, hash)
  await bucket.put(key, text, {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
  await readMapBundle(bucket, input.id, hash)
  const now = new Date().toISOString(),
    version = input.expectedVersion + 1
  const [rows] = await db.batch([
    db
      .update(premisesMap)
      .set({
        draftHash: hash,
        draftVersion: version,
        updatedBy: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(premisesMap.id, input.id),
          eq(premisesMap.draftVersion, input.expectedVersion),
        ),
      )
      .returning({ id: premisesMap.id }),
    ...(input.correctionWrites?.length
      ? [prepareRevisionCheck(db, sql`changes()=1`), ...input.correctionWrites]
      : []),
    db
      .insert(premisesMapDraftRevision)
      .select(
        db
          .select({
            mapId: premisesMap.id,
            version: premisesMap.draftVersion,
            hash: sql<string>`${premisesMap.draftHash}`.as('hash'),
            actorId: sql<string>`${input.actorId}`.as('actorId'),
            createdAt: sql<string>`${now}`.as('createdAt'),
          })
          .from(premisesMap)
          .where(
            and(
              eq(premisesMap.id, input.id),
              eq(premisesMap.draftVersion, version),
              eq(premisesMap.draftHash, hash),
            ),
          ),
      )
      .onConflictDoNothing(),
  ])
  if (!rows.length)
    throw new Error('MAP_CONFLICT: reload the latest draft before saving')
  return { hash, version: input.expectedVersion + 1 }
}

/** Publish a complete retained draft or roll back to a retained release. @param db Database. @param bucket Environment storage. @param input Exact reviewed draft and expected public version. @returns New public version. @remarks D1 batch atomically switches the pointer and records publication; stale editors cannot overwrite newer work. */
export async function publishMapDraft(
  db: Database,
  bucket: R2Bucket,
  input: {
    id: string
    hash: string
    expectedDraftVersion: number
    expectedPublishedVersion: number
    actorId: string
    upstreamReview?: { sourceSnapshotHash: string; name: string }
  },
): Promise<number> {
  const bundle = await readMapBundle(bucket, input.id, input.hash)
  if (bundle.data.correctionIssues?.length)
    throw new Error(
      'MAP_CORRECTIONS_UNRESOLVED: repair corrections and rebuild the draft before publishing',
    )
  const now = new Date().toISOString(),
    version = input.expectedPublishedVersion + 1
  // Editor publication verifies enabled connections; automated upstream publication preserves their existing evidence.
  bundle.data.connections = (bundle.data.connections ?? []).map(connection =>
    connection.enabled && !input.upstreamReview
      ? { ...connection, evidence: 'editor-verified' as const }
      : connection,
  )
  const text = JSON.stringify(bundle)
  const publishedHash = await mapHash(text)
  await bucket.put(mapReleaseKey(input.id, publishedHash), text, {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
  await readMapBundle(bucket, input.id, publishedHash)
  const isExtractedBuilding = /^(?:gbp|footprint):/.test(
    bundle.data.sourceDataset ?? '',
  )
  const venue = bundle.data.venue_polygon.features[0]?.properties
  const unitAssociations = isExtractedBuilding
    ? bundle.data.unit_polygon.features.flatMap(feature => {
        const id = feature.properties.canonical_location_id
        return typeof id === 'string' && id
          ? [{ unitId: String(feature.properties.unit_id), locationId: id }]
          : []
      })
    : []
  const draftVersion =
    input.expectedDraftVersion + (publishedHash === input.hash ? 0 : 1)
  const [updated] = await db.batch([
    db
      .update(premisesMap)
      .set({
        publishedHash,
        draftHash: publishedHash,
        draftVersion,
        publishedVersion: version,
        ...(isExtractedBuilding && typeof venue?.venue_name_en === 'string'
          ? {
              name: venue.venue_name_en,
              ...(typeof venue.venue_name_zh === 'string'
                ? { nameZh: venue.venue_name_zh }
                : {}),
            }
          : {}),
        footprint:
          bundle.data.coordinateSpace === 'image-pixels'
            ? null
            : bundle.data.venue_polygon,
        updatedBy: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(premisesMap.id, input.id),
          eq(premisesMap.draftHash, input.hash),
          eq(premisesMap.draftVersion, input.expectedDraftVersion),
          eq(premisesMap.publishedVersion, input.expectedPublishedVersion),
        ),
      )
      .returning({ id: premisesMap.id }),
    // Fence publication and its review task together so stale writers cannot create notifications.
    ...(input.upstreamReview || isExtractedBuilding
      ? [prepareRevisionCheck(db, sql`changes()=1`)]
      : []),
    // Public occupancy joins follow the exact published geometry, never an unpublished draft.
    // One JSON binding keeps the complete replacement below D1's parameter limit.
    ...(isExtractedBuilding
      ? [
          db.delete(premisesMapUnit).where(eq(premisesMapUnit.mapId, input.id)),
          db
            .insert(premisesMapUnit)
            .select(sql`SELECT ${input.id},json_extract(value,'$.unitId'),json_extract(value,'$.locationId')
        FROM json_each(${JSON.stringify(unitAssociations)})`),
        ]
      : []),
    db
      .insert(premisesMapPublication)
      .select(
        db
          .select({
            mapId: premisesMap.id,
            version: premisesMap.publishedVersion,
            hash: sql<string>`${premisesMap.publishedHash}`.as('hash'),
            actorId: sql<string>`${input.actorId}`.as('actorId'),
            createdAt: sql<string>`${now}`.as('createdAt'),
          })
          .from(premisesMap)
          .where(
            and(
              eq(premisesMap.id, input.id),
              eq(premisesMap.publishedVersion, version),
              eq(premisesMap.publishedHash, publishedHash),
            ),
          ),
      )
      .onConflictDoNothing(),
    db
      .insert(premisesMapDraftRevision)
      .select(
        db
          .select({
            mapId: premisesMap.id,
            version: premisesMap.draftVersion,
            hash: sql<string>`${premisesMap.draftHash}`.as('hash'),
            actorId: sql<string>`${input.actorId}`.as('actorId'),
            createdAt: sql<string>`${now}`.as('createdAt'),
          })
          .from(premisesMap)
          .where(
            and(
              eq(premisesMap.id, input.id),
              eq(premisesMap.draftVersion, draftVersion),
              eq(premisesMap.draftHash, publishedHash),
              eq(premisesMap.publishedVersion, version),
            ),
          ),
      )
      .onConflictDoNothing(),
    ...(input.upstreamReview
      ? [
          db
            .insert(systemTask)
            .values({
              id: `map-publication:${input.id}:${publishedHash}`,
              resource: 'premisesMap' as const,
              resourceId: input.id,
              type: 'map-upstream-published',
              sourceSnapshotHash: input.upstreamReview.sourceSnapshotHash,
              title: `${input.upstreamReview.name} · Updated upstream map`,
              message: `New upstream content published. Review the published map ${input.id} for correctness. Release: ${publishedHash}`,
              isReviewed: false,
              createdAt: now,
              modifiedAt: now,
            })
            .onConflictDoNothing(),
        ]
      : []),
  ])
  if (!updated.length)
    throw new Error(
      'MAP_CONFLICT: draft or publication changed; reload before publishing',
    )
  return version
}

/** Check whether a hash was published, including retained previous releases. @param db Database. @param id Map ID. @param hash Release hash. @returns Publication receipt or undefined. */
export async function publishedMapRelease(
  db: Database,
  id: string,
  hash: string,
): Promise<typeof premisesMapPublication.$inferSelect | undefined> {
  return db
    .select()
    .from(premisesMapPublication)
    .where(
      and(eq(premisesMapPublication.mapId, id), eq(premisesMapPublication.hash, hash)),
    )
    .get()
}
