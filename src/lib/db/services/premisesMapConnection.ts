// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import { premisesMap, premisesMapCorrection } from '../schema/premisesMap'
// SERVICES
import { readMapBundle, saveMapDraft } from './premisesMap'
import { prepareCorrectedMap } from './premisesMapCorrection'
// DOMAIN
import {
  connectionIdentity,
  connectionValue,
} from '#lib/indoor/connectionCorrections.js'
import {
  mapHash,
  mapReleaseKey,
  validateMapBundle,
  type MapConnection,
} from '#lib/indoor/releases.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { R2Bucket } from '@cloudflare/workers-types'
import type { BatchItem } from 'drizzle-orm/batch'

/** Save connection curations and their materialized draft under one optimistic version fence.
 * @param db Database. @param bucket Map storage. @param input Curated pairs, reason and authenticated author.
 * @returns Saved draft pointer. @remarks Each row is one bounded SQL statement. Omitted pairs are retained as disabled corrections, so refresh cannot resurrect them.
 */
export async function saveMapConnectionCurations(
  db: Database,
  bucket: R2Bucket,
  input: {
    id: string
    expectedVersion: number
    connections: MapConnection[]
    reason: string
    actorId: string
  },
): Promise<{ hash: string; version: number }> {
  const map = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, input.id))
    .get()
  if (!map?.draftHash || map.draftVersion !== input.expectedVersion)
    throw new Error('MAP_CONFLICT')
  const current = await readMapBundle(bucket, input.id, map.draftHash)
  const source = current.data.sourceSnapshotHash
    ? await readMapBundle(bucket, input.id, current.data.sourceSnapshotHash)
    : structuredClone(current)
  const sourceDataset =
    source.data.sourceDataset ?? (map.kind === 'station' ? 'landsd-mtr' : map.id)
  source.data.sourceDataset = sourceDataset
  const sourceText = JSON.stringify(source),
    sourceSnapshotHash = await mapHash(sourceText)
  await bucket.put(mapReleaseKey(input.id, sourceSnapshotHash), sourceText)
  const desired = [...input.connections]
  // Preserve explicit removals as disabled pairs rather than silently restoring upstream connections.
  for (const previous of current.data.connections ?? []) {
    if (!desired.some(c => connectionIdentity(c) === connectionIdentity(previous)))
      desired.push({ ...previous, enabled: false })
  }
  validateMapBundle({ ...current, data: { ...current.data, connections: desired } })
  const existing = await db
    .select()
    .from(premisesMapCorrection)
    .where(
      and(
        eq(premisesMapCorrection.mapId, input.id),
        eq(premisesMapCorrection.sourceDataset, sourceDataset),
      ),
    )
  const corrections = [...existing]
  const correctionWrites: BatchItem<'sqlite'>[] = []
  for (const connection of desired) {
    const sourceEntityId = connectionIdentity(connection)
    const index = corrections.findIndex(
      c =>
        c.sourceLayer === 'connection' &&
        c.sourceEntityId === sourceEntityId &&
        c.field === 'connection',
    )
    const previous = index < 0 ? undefined : corrections[index]
    // Unchanged curations keep their original author, baseline and reason.
    if (
      previous &&
      previous.sourceSnapshotHash === sourceSnapshotHash &&
      connectionValue(JSON.parse(previous.correctedValue)) ===
        connectionValue(connection)
    )
      continue
    const original = source.data.connections?.find(
      c => connectionIdentity(c) === sourceEntityId,
    )
    const row = {
      mapId: input.id,
      sourceDataset,
      sourceLayer: 'connection',
      sourceEntityId,
      field: 'connection',
      originalValue: original ? JSON.stringify(original) : null,
      correctedValue: JSON.stringify(connection),
      sourceSnapshotHash,
      reason: input.reason,
      authorUserId: input.actorId,
    }
    if (index < 0) corrections.push(row)
    else corrections[index] = row
    correctionWrites.push(
      db
        .insert(premisesMapCorrection)
        .values(row)
        .onConflictDoUpdate({
          target: [
            premisesMapCorrection.mapId,
            premisesMapCorrection.sourceDataset,
            premisesMapCorrection.sourceLayer,
            premisesMapCorrection.sourceEntityId,
            premisesMapCorrection.field,
          ],
          set: row,
        }),
    )
  }
  const bundle = await prepareCorrectedMap(db, bucket, {
    id: input.id,
    sourceDataset,
    bundle: source,
    corrections,
  })
  return saveMapDraft(db, bucket, {
    id: input.id,
    expectedVersion: input.expectedVersion,
    bundle,
    actorId: input.actorId,
    correctionWrites,
  })
}
