// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  premisesMap,
  premisesMapPublication,
  premisesMapDraftRevision,
} from '../schema/premisesMap'
// DOMAIN
import {
  mapHash,
  mapReleaseKey,
  validateMapBundle,
  type MapBundle,
} from '#lib/indoor/releases.js'
// TYPES
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
  input: { id: string; expectedVersion: number; bundle: unknown; actorId: string },
): Promise<{ hash: string; version: number }> {
  const bundle = validateMapBundle(input.bundle)
  // Live occupancy presentation is never copied into immutable physical geometry.
  delete bundle.data.unitArtwork
  delete bundle.data.releaseHash
  delete bundle.data.basePath
  const text = JSON.stringify(bundle)
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw new Error('Map bundle exceeds 20 MiB')
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
    db
      .insert(premisesMapDraftRevision)
      .select(
        db
          .select({
            mapId: premisesMap.id,
            version: premisesMap.draftVersion,
            hash: sql<string>`${premisesMap.draftHash}`,
            actorId: sql<string>`${input.actorId}`,
            createdAt: sql<string>`${now}`,
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
  },
): Promise<number> {
  const bundle = await readMapBundle(bucket, input.id, input.hash)
  if (bundle.data.correctionIssues?.length)
    throw new Error(
      'MAP_CORRECTIONS_UNRESOLVED: repair corrections and rebuild the draft before publishing',
    )
  const now = new Date().toISOString(),
    version = input.expectedPublishedVersion + 1
  // Publication is the editor's verification of every enabled connection.
  bundle.data.connections = (bundle.data.connections ?? []).map(connection =>
    connection.enabled
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
    db
      .insert(premisesMapPublication)
      .select(
        db
          .select({
            mapId: premisesMap.id,
            version: premisesMap.publishedVersion,
            hash: sql<string>`${premisesMap.publishedHash}`,
            actorId: sql<string>`${input.actorId}`,
            createdAt: sql<string>`${now}`,
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
            hash: sql<string>`${premisesMap.draftHash}`,
            actorId: sql<string>`${input.actorId}`,
            createdAt: sql<string>`${now}`,
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
