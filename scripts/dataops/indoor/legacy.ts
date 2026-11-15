// NODE
import { resolve } from 'node:path'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  premisesMap,
  premisesMapCorrection,
  premisesMapPublication,
  premisesMapDraftRevision,
} from '../../../src/lib/db/schema/premisesMap'
import { systemTask } from '../../../src/lib/db/schema/systemTask'
// SERVICES
import { readMapBundle } from '../../../src/lib/db/services/premisesMap'
import { prepareRevisionCheck } from '../../../src/lib/db/services/revisionBatch'
import { retryBusyRead } from '../../../src/lib/db/services/sqlite'
// DOMAIN
import { layerNames, type IndoorData } from '../../../src/lib/indoor/model'
import { normalizeMapFacilityLabels } from '../../../src/lib/indoor/facilityLabels'
import {
  applyMapCorrection,
  assessMapCorrection,
} from '../../../src/lib/indoor/corrections'
import {
  connectionIdentity,
  connectionValue,
} from '../../../src/lib/indoor/connectionCorrections'
import {
  mapHash,
  mapReleaseKey,
  validateMapBundle,
  type MapBundle,
} from '../../../src/lib/indoor/releases'
import { canonical, contentHash, sha256 } from './content'
// TYPES
import type { Database } from '../../../src/lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'

type Correction = typeof premisesMapCorrection.$inferSelect
// TOC: Verified original | Curation reconstruction | Atomic baseline attachment

/** Load actual publisher layers, checking every original manifest checksum.
 * @param directory Retained source folder. @param sourceDataset Source namespace. @returns Uncurated original bundle.
 */
export async function loadLegacyOriginal(
  directory: string,
  sourceDataset: string,
): Promise<MapBundle> {
  const manifest = await Bun.file(resolve(directory, 'manifest.json')).json()
  const layers = {} as Pick<IndoorData, (typeof layerNames)[number]>
  for (const layer of layerNames) {
    const entry = manifest.entries.find(
      (candidate: { layer: string }) => candidate.layer === layer,
    )
    const bytes = await Bun.file(resolve(directory, `${layer}.json`)).bytes()
    if (!entry || sha256(bytes) !== entry.sha256 || bytes.length !== entry.bytes)
      throw new Error(`Original source checksum mismatch: ${layer}`)
    const collection = JSON.parse(new TextDecoder().decode(bytes))
    if (collection.features.length !== entry.count)
      throw new Error(`Original source count mismatch: ${layer}`)
    if (
      collection.features.some(
        (feature: { properties: { venue_id: string } }) =>
          feature.properties.venue_id !== manifest.venueId,
      )
    )
      throw new Error('Original venue mismatch')
    layers[layer] = collection
  }
  return validateMapBundle({
    schemaVersion: 1,
    documents: [],
    data: { ...manifest, ...layers, connections: [], sourceDataset },
  })
}

/** Express a curated view as replayable corrections against its checksum-verified original.
 * @param original Genuine upstream data. @param curated Published or draft view. @param mapId Map identity. @param actorId Migration user ID. @param existing Current corrections whose authorship must survive.
 * @returns Corrections proven to reproduce the view, allowing only shared facility formatting.
 * @remarks Never infer missing polygons or edited geometry. Existing unpublished correction values must agree with the draft.
 */
export async function reconstructLegacyCorrections(
  original: MapBundle,
  curated: MapBundle,
  mapId: string,
  actorId: string,
  existing: Correction[] = [],
): Promise<Correction[]> {
  const sourceSnapshotHash = await mapHash(JSON.stringify(original))
  const sourceDataset = original.data.sourceDataset
  if (!sourceDataset) throw new Error('Missing source namespace')
  const expected = structuredClone(curated),
    replay = structuredClone(original)
  normalizeMapFacilityLabels(expected.data)
  normalizeMapFacilityLabels(replay.data)
  const corrections: Correction[] = []
  const remember = (row: Omit<Correction, 'authorUserId' | 'reason'>): Correction => {
    const previous = existing.find(
      c =>
        c.sourceDataset === sourceDataset &&
        c.sourceLayer === row.sourceLayer &&
        c.sourceEntityId === row.sourceEntityId &&
        c.field === row.field,
    )
    if (
      previous &&
      (row.sourceLayer === 'connection'
        ? connectionValue(JSON.parse(previous.correctedValue)) !==
          connectionValue(JSON.parse(row.correctedValue))
        : previous.correctedValue !== row.correctedValue)
    )
      throw new Error('Stored correction disagrees with the current draft')
    const correction = {
      ...row,
      authorUserId: previous?.authorUserId ?? actorId,
      reason:
        previous?.reason ??
        'Reconstructed existing map curation against the checksum-verified original upstream snapshot.',
    }
    corrections.push(correction)
    if (assessMapCorrection(original, original, correction) === 'applied')
      applyMapCorrection(replay, correction)
    return correction
  }
  // Identity and exact geometry checks prevent a guessed original from becoming provenance.
  for (const layer of layerNames) {
    const key = `${layer.split('_')[0]}_id`
    const originals = new Map(
      original.data[layer].features.map(f => [f.properties[key], f]),
    )
    if (
      originals.size !== original.data[layer].features.length ||
      originals.size !== expected.data[layer].features.length
    )
      throw new Error(`Legacy polygon membership differs: ${layer}`)
    for (const feature of expected.data[layer].features) {
      const old = originals.get(feature.properties[key])
      const applied = replay.data[layer].features.find(
        f => f.properties[key] === feature.properties[key],
      )
      if (!old || !applied || canonical(old.geometry) !== canonical(feature.geometry))
        throw new Error(`Legacy geometry differs: ${layer}`)
      for (const field of new Set([
        ...Object.keys(old.properties),
        ...Object.keys(feature.properties),
      ])) {
        if (
          canonical(applied.properties[field]) === canonical(feature.properties[field])
        )
          continue
        const before = old.properties[field] ?? null,
          after = feature.properties[field]
        if (
          (before !== null && typeof before !== 'string') ||
          typeof after !== 'string'
        )
          throw new Error(`Unsupported legacy field change: ${layer}.${field}`)
        remember({
          mapId,
          sourceDataset,
          sourceLayer: layer,
          sourceEntityId: String(feature.properties[key]),
          field,
          originalValue: before,
          correctedValue: after,
          sourceSnapshotHash,
        })
      }
    }
  }
  for (const connection of curated.data.connections ?? [])
    remember({
      mapId,
      sourceDataset,
      sourceLayer: 'connection',
      sourceEntityId: connectionIdentity(connection),
      field: 'connection',
      originalValue: null,
      correctedValue: JSON.stringify(connection),
      sourceSnapshotHash,
    })
  if (
    existing.some(
      c =>
        !corrections.some(
          next =>
            next.sourceDataset === c.sourceDataset &&
            next.sourceLayer === c.sourceLayer &&
            next.sourceEntityId === c.sourceEntityId &&
            next.field === c.field,
        ),
    )
  )
    throw new Error('Existing corrections would be omitted; inspect their draft first')
  const connections = (bundle: MapBundle): string =>
    canonical(
      (bundle.data.connections ?? [])
        .map(c => ({ identity: connectionIdentity(c), value: connectionValue(c) }))
        .sort((a, b) => a.identity.localeCompare(b.identity)),
    )
  if (
    contentHash(replay) !== contentHash(expected) ||
    connections(replay) !== connections(expected)
  )
    throw new Error('Legacy curation replay is not equivalent')
  validateMapBundle(replay)
  return corrections
}

/** Attach a genuine original without publishing an existing draft or changing map geometry.
 * @param db Target database. @param bucket Target storage. @param input Exact map, source, migration actor and apply switch. @returns Reviewable plan/result.
 * @remarks Originals and new immutable wrappers are uploaded first; pointers, correction rebases and issue resolution share one optimistic transaction.
 */
export async function reconcileLegacyBaseline(
  db: Database,
  bucket: R2Bucket,
  input: { id: string; sourceDirectory: string; actorId: string; apply: boolean },
): Promise<{
  id: string
  applied: boolean
  sourceHash: string
  publishedHash: string
  draftHash: string
  preservedDraft: boolean
  publishedCorrections: number
  draftCorrections: number
}> {
  const row = await retryBusyRead(() =>
    db.select().from(premisesMap).where(eq(premisesMap.id, input.id)).get(),
  )
  if (!row?.publishedHash || !row.draftHash)
    throw new Error('Map must have a publication and draft')
  const actor = await retryBusyRead(() =>
    db.get<{ id: string }>(sql`select id from user where id=${input.actorId}`),
  )
  if (!actor) throw new Error('Migration author must be an existing user ID')
  const published = await readMapBundle(bucket, row.id, row.publishedHash)
  const draft = await readMapBundle(bucket, row.id, row.draftHash)
  if (published.data.sourceSnapshotHash)
    throw new Error('Publication already has a baseline')
  const sourceDataset =
    draft.data.sourceDataset ??
    (row.kind === 'station' ? 'landsd-mtr' : 'landsd-building')
  const original = await loadLegacyOriginal(input.sourceDirectory, sourceDataset)
  const existing = await retryBusyRead(() =>
    db
      .select()
      .from(premisesMapCorrection)
      .where(eq(premisesMapCorrection.mapId, row.id)),
  )
  const publishedCorrections = await reconstructLegacyCorrections(
    original,
    published,
    row.id,
    input.actorId,
  )
  const corrections = await reconstructLegacyCorrections(
    original,
    draft,
    row.id,
    input.actorId,
    existing,
  )
  const sourceText = JSON.stringify(original),
    sourceHash = await mapHash(sourceText)
  // Only provenance metadata changes in each wrapper; the published and draft views stay separate.
  for (const bundle of [published, draft]) {
    bundle.data.sourceDataset = sourceDataset
    bundle.data.sourceSnapshotHash = sourceHash
  }
  const publishedText = JSON.stringify(published),
    draftText = JSON.stringify(draft)
  const publishedHash = await mapHash(publishedText),
    draftHash = await mapHash(draftText)
  const result = {
    id: row.id,
    applied: input.apply,
    sourceHash,
    publishedHash,
    draftHash,
    preservedDraft: row.draftHash !== row.publishedHash,
    publishedCorrections: publishedCorrections.length,
    draftCorrections: corrections.length,
  }
  if (!input.apply) return result
  for (const [hash, text] of new Map([
    [sourceHash, sourceText],
    [publishedHash, publishedText],
    [draftHash, draftText],
  ])) {
    await bucket.put(mapReleaseKey(row.id, hash), text, {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
    await readMapBundle(bucket, row.id, hash)
  }
  const now = new Date().toISOString()
  // Fence both versions: an editor can never have a new draft silently published or replaced by this repair.
  await db.batch([
    db
      .update(premisesMap)
      .set({
        publishedHash,
        draftHash,
        publishedVersion: row.publishedVersion + 1,
        draftVersion: row.draftVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(premisesMap.id, row.id),
          eq(premisesMap.publishedHash, row.publishedHash),
          eq(premisesMap.draftHash, row.draftHash),
          eq(premisesMap.publishedVersion, row.publishedVersion),
          eq(premisesMap.draftVersion, row.draftVersion),
        ),
      ),
    prepareRevisionCheck(db, sql`changes()=1`),
    ...corrections.map(correction =>
      db
        .insert(premisesMapCorrection)
        .values(correction)
        .onConflictDoUpdate({
          target: [
            premisesMapCorrection.mapId,
            premisesMapCorrection.sourceDataset,
            premisesMapCorrection.sourceLayer,
            premisesMapCorrection.sourceEntityId,
            premisesMapCorrection.field,
          ],
          set: correction,
        }),
    ),
    db.insert(premisesMapPublication).values({
      mapId: row.id,
      version: row.publishedVersion + 1,
      hash: publishedHash,
      actorId: input.actorId,
      createdAt: now,
    }),
    db.insert(premisesMapDraftRevision).values({
      mapId: row.id,
      version: row.draftVersion + 1,
      hash: draftHash,
      actorId: input.actorId,
      createdAt: now,
    }),
    db
      .update(systemTask)
      .set({
        isReviewed: true,
        reviewOutcome: 'accepted',
        reviewerId: input.actorId,
        modifiedAt: now,
        sourceSnapshotHash: sourceHash,
      })
      .where(
        and(
          eq(systemTask.resourceId, row.id),
          eq(systemTask.type, 'map-refresh-blocked'),
          eq(
            systemTask.message,
            'Published legacy map has no retained source baseline; verify its baseline before refresh',
          ),
        ),
      ),
  ])
  return result
}
