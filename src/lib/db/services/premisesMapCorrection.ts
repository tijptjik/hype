// DRIZZLE
import { and, eq, or, ne, isNull } from 'drizzle-orm'
// SCHEMA
import { premisesMapCorrection } from '../schema/premisesMap'
import { systemTask } from '../schema/systemTask'
// DOMAIN
import { normalizeMapFacilityLabels } from '#lib/indoor/facilityLabels.js'
import {
  applyMapCorrection,
  assessMapCorrection,
  type MapCorrection,
} from '#lib/indoor/corrections.js'
import {
  mapHash,
  mapReleaseKey,
  validateMapBundle,
  type MapBundle,
} from '#lib/indoor/releases.js'
import { readMapBundle } from './premisesMap'
// TYPES
import type { Database } from '#lib/types.js'
import type { R2Bucket } from '@cloudflare/workers-types'

// TOC: Source retention | Correction replay | System issue projection

/** Retain raw source bytes and prepare a corrected bundle once, before draft publication.
 * @param db Database. @param bucket Private map storage. @param input Fresh source and source namespace.
 * @returns Corrected content with unresolved issue IDs. @remarks Reads never patch published resources. One current issue is retained per source field; repeated snapshots preserve review decisions.
 */
export async function prepareCorrectedMap(
  db: Database,
  bucket: R2Bucket,
  input: {
    id: string
    sourceDataset: string
    bundle: unknown
    corrections?: MapCorrection[]
  },
): Promise<MapBundle> {
  const raw = structuredClone(validateMapBundle(input.bundle))
  delete raw.data.sourceSnapshotHash
  delete raw.data.correctionIssues
  delete raw.data.releaseHash
  delete raw.data.unitArtwork
  delete raw.data.basePath
  raw.data.sourceDataset = input.sourceDataset
  const text = JSON.stringify(raw)
  const sourceHash = await mapHash(text)
  await bucket.put(mapReleaseKey(input.id, sourceHash), text, {
    httpMetadata: { contentType: 'application/json' },
  })
  const corrected = structuredClone(raw)
  // Apply shared terminology only to derived content; explicit corrections take precedence.
  normalizeMapFacilityLabels(corrected.data)
  corrected.data.sourceSnapshotHash = sourceHash
  corrected.data.correctionIssues = []
  const corrections =
    input.corrections ??
    (await db
      .select()
      .from(premisesMapCorrection)
      .where(
        and(
          eq(premisesMapCorrection.mapId, input.id),
          eq(premisesMapCorrection.sourceDataset, input.sourceDataset),
        ),
      ))
  // Each correction is compared with its own retained upstream baseline, not a previously corrected release.
  for (const correction of corrections) {
    let baseline: MapBundle | undefined
    const object = await bucket.get(
      mapReleaseKey(input.id, correction.sourceSnapshotHash),
    )
    if (object)
      baseline = await readMapBundle(bucket, input.id, correction.sourceSnapshotHash)
    const outcome = assessMapCorrection(raw, baseline, correction)
    const id = `map-correction:${await mapHash(JSON.stringify([input.id, input.sourceDataset, correction.sourceLayer, correction.sourceEntityId, correction.field]))}`
    const now = new Date().toISOString()
    if (outcome === 'applied') {
      applyMapCorrection(corrected, correction)
      await db
        .update(systemTask)
        .set({
          isReviewed: true,
          reviewOutcome: 'accepted',
          reviewerId: null,
          sourceSnapshotHash: sourceHash,
          modifiedAt: now,
          type: 'map-correction-applied',
          title: `${input.id} · Map correction reapplied`,
          message: `${correction.sourceEntityId} / ${correction.field}: correction successfully reapplied.`,
        })
        .where(
          and(eq(systemTask.id, id), ne(systemTask.type, 'map-correction-applied')),
        )
      continue
    }
    const adopted = outcome === 'upstream-adopted'
    const issue = {
      id,
      sourceSnapshotHash: sourceHash,
      reviewerId: null,
      resource: 'premisesMap' as const,
      resourceId: input.id,
      type: `map-correction-${outcome}`,
      title: `${input.id} · ${adopted ? 'Upstream map correction adopted' : 'Map correction needs attention'}`,
      message: `${correction.sourceLayer} / ${correction.sourceEntityId} / ${correction.field}\n${outcome}. Original: ${correction.originalValue ?? '(absent)'}. Correction: ${correction.correctedValue}.\n${correction.reason}`,
      isReviewed: adopted,
      reviewOutcome: adopted ? ('accepted' as const) : null,
      createdAt: now,
      modifiedAt: now,
    }
    await db
      .insert(systemTask)
      .values(issue)
      .onConflictDoUpdate({
        target: systemTask.id,
        set: { ...issue, createdAt: systemTask.createdAt },
        setWhere: or(
          isNull(systemTask.sourceSnapshotHash),
          ne(systemTask.sourceSnapshotHash, sourceHash),
          ne(systemTask.type, issue.type),
        ),
      })
    if (!adopted) corrected.data.correctionIssues.push(id)
  }
  return corrected
}
