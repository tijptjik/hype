// SVELTE
import { error, isHttpError } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, desc, eq } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// SCHEMA
import {
  premisesMap,
  premisesMapPublication,
  premisesMapCorrection,
} from '#lib/db/schema/premisesMap.js'
// SYSTEM TASKS
import { saveMapConnectionCurations } from '#lib/db/services/premisesMapConnection.js'
import { prepareCorrectedMap } from '#lib/db/services/premisesMapCorrection.js'
// DOMAIN
import {
  connectionSchema,
  mapIdSchema,
  releaseHashSchema,
  mapHash,
  mapReleaseKey,
} from '#lib/indoor/releases.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
import {
  readMapBundle,
  saveMapDraft,
  publishMapDraft,
} from '#lib/db/services/premisesMap.js'
import { publicationChanges } from '#lib/indoor/publicationChanges.js'
import type { GuardedBaseContext } from './guarded.types'

/** Require site-wide authority for shared physical maps. @param ctx Authenticated request. @returns Nothing on success. */
function authorize(ctx: GuardedBaseContext): void {
  if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
}
/** List editable map metadata. @param input No parameters. @returns Administrative map pointers. */
export const listPremisesMaps = guardedQuery(z.object({}), async (_input, ctx) => {
  authorize(ctx)
  return ctx.db.select().from(premisesMap)
})
/** Read one draft and its publication history. @param input Map ID. @returns Draft content and concurrency versions. */
export const getPremisesMapDraft = guardedQuery(
  z.object({ id: mapIdSchema }),
  async (input, ctx) => {
    authorize(ctx)
    const map = await ctx.db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, input.id))
      .get()
    if (!map) error(404, 'MAP_NOT_FOUND')
    const hash = map.draftHash ?? map.publishedHash
    return {
      map,
      bundle: hash
        ? await readMapBundle(
            premisesMapBucket(ctx.event.locals.platform),
            input.id,
            hash,
          )
        : null,
      corrections: await ctx.db
        .select()
        .from(premisesMapCorrection)
        .where(eq(premisesMapCorrection.mapId, input.id)),
      history: await ctx.db
        .select()
        .from(premisesMapPublication)
        .where(eq(premisesMapPublication.mapId, input.id))
        .orderBy(desc(premisesMapPublication.version))
        .limit(100),
    }
  },
)
/** Save durable connection curations and prepare an unpublished resource. @param input Connections, optional note and optimistic version. @returns Saved draft pointer. */
export const savePremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    connections: z.array(connectionSchema).max(10000),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .default('Connection updated in map editor.'),
  }),
  async (input, ctx) => {
    authorize(ctx)
    try {
      return await saveMapConnectionCurations(
        ctx.db,
        premisesMapBucket(ctx.event.locals.platform),
        { ...input, actorId: ctx.user.id },
      )
    } catch (cause) {
      if (isHttpError(cause)) throw cause
      if (cause instanceof Error && cause.message === 'MAP_CONFLICT')
        error(409, 'MAP_CONFLICT')
      console.error('Map connection save failed', {
        mapId: input.id,
        expectedVersion: input.expectedVersion,
        cause,
      })
      throw cause
    }
  },
)
/** Publish only the exact reviewed draft. @param input Draft hash and both version fences. @returns New publication number. */
export const publishPremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    hash: releaseHashSchema,
    expectedDraftVersion: z.number().int().nonnegative(),
    expectedPublishedVersion: z.number().int().nonnegative(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    return publishMapDraft(ctx.db, premisesMapBucket(ctx.event.locals.platform), {
      ...input,
      actorId: ctx.user.id,
    })
  },
)
/** Restore a previously published release as a new unpublished draft. @param input Published hash and draft version. @returns Saved draft pointer; publishing remains separate. */
export const restorePremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    hash: releaseHashSchema,
    expectedVersion: z.number().int().nonnegative(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    const history = await ctx.db
      .select()
      .from(premisesMapPublication)
      .where(eq(premisesMapPublication.mapId, input.id))
    if (!history.some(r => r.hash === input.hash)) error(400, 'UNKNOWN_PUBLICATION')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    return saveMapDraft(ctx.db, bucket, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      bundle: await readMapBundle(bucket, input.id, input.hash),
      actorId: ctx.user.id,
    })
  },
)

/** Save a current level label correction and rebuild the draft from retained source.
 * @param input Map, polygon, field and corrected text. @returns New corrected draft pointer.
 * @remarks Author is always the authenticated user. Publication remains explicit.
 */
export const correctPremisesMapLabel = guardedCommand(
  z.object({
    id: mapIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    levelId: z.string().min(1),
    field: z.enum(['level_name_en', 'level_name_zh', 'level_short_name_en']),
    value: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1000),
  }),
  async (input, ctx) => {
    authorize(ctx)
    const map = await ctx.db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, input.id))
      .get()
    if (!map?.draftHash) error(404, 'MAP_NOT_FOUND')
    if (map.draftVersion !== input.expectedVersion) error(409, 'MAP_CONFLICT')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const current = await readMapBundle(bucket, input.id, map.draftHash)
    const source = current.data.sourceSnapshotHash
      ? await readMapBundle(bucket, input.id, current.data.sourceSnapshotHash)
      : current
    const sourceDataset =
      source.data.sourceDataset ?? (map.kind === 'station' ? 'landsd-mtr' : map.id)
    source.data.sourceDataset = sourceDataset
    const target = source.data.level_polygon.features.find(
      level => level.properties.level_id === input.levelId,
    )
    if (!target) error(404, 'LEVEL_NOT_FOUND')
    // The first correction of an older release establishes a retained source baseline.
    const sourceText = JSON.stringify(source)
    const sourceSnapshotHash = await mapHash(sourceText)
    await bucket.put(mapReleaseKey(input.id, sourceSnapshotHash), sourceText)
    const correction = {
      mapId: input.id,
      sourceDataset,
      sourceLayer: 'level_polygon',
      sourceEntityId: input.levelId,
      field: input.field,
      originalValue:
        typeof target.properties[input.field] === 'string'
          ? (target.properties[input.field] as string)
          : null,
      correctedValue: input.value,
      sourceSnapshotHash,
      reason: input.reason,
      authorUserId: ctx.user.id,
    }
    const correctionWrite = ctx.db
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
        set: {
          originalValue:
            typeof target.properties[input.field] === 'string'
              ? (target.properties[input.field] as string)
              : null,
          correctedValue: input.value,
          sourceSnapshotHash,
          reason: input.reason,
          authorUserId: ctx.user.id,
        },
      })
    const existing = await ctx.db
      .select()
      .from(premisesMapCorrection)
      .where(
        and(
          eq(premisesMapCorrection.mapId, input.id),
          eq(premisesMapCorrection.sourceDataset, sourceDataset),
        ),
      )
    const corrections = existing.filter(
      row =>
        !(
          row.sourceLayer === correction.sourceLayer &&
          row.sourceEntityId === correction.sourceEntityId &&
          row.field === correction.field
        ),
    )
    corrections.push(correction)
    const bundle = await prepareCorrectedMap(ctx.db, bucket, {
      id: input.id,
      sourceDataset,
      bundle: source,
      corrections,
    })
    // Preserve legacy draft-only links until the editor explicitly saves them as curations.
    if (!existing.some(row => row.sourceLayer === 'connection'))
      bundle.data.connections = current.data.connections
    return saveMapDraft(ctx.db, bucket, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      bundle,
      actorId: ctx.user.id,
      correctionWrites: [correctionWrite],
    })
  },
)

/** Build a replacement draft from fresh upstream data; page reads never replay corrections.
 * @param input Raw source bundle, namespace and expected map version. @returns Draft pointer and unresolved system issues.
 */
export const refreshPremisesMapSource = guardedCommand(
  z.object({
    id: mapIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    sourceDataset: z.string().min(1).max(100),
    bundle: z.unknown(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const map = await ctx.db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, input.id))
      .get()
    if (!map || map.draftVersion !== input.expectedVersion) error(409, 'MAP_CONFLICT')
    const bundle = await prepareCorrectedMap(ctx.db, bucket, input)
    const draft = await saveMapDraft(ctx.db, bucket, {
      ...input,
      bundle,
      actorId: ctx.user.id,
    })
    return { ...draft, issues: bundle.data.correctionIssues ?? [] }
  },
)

/** Remove an obsolete correction and rebuild the map draft from source.
 * @param input Exact correction identity and expected draft. @returns Rebuilt draft pointer.
 * @remarks Useful when an upstream polygon disappears; no proximity-based reassignment occurs.
 */
export const removePremisesMapCorrection = guardedCommand(
  z.object({
    id: mapIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    sourceDataset: z.string(),
    sourceLayer: z.string(),
    sourceEntityId: z.string(),
    field: z.string(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    const map = await ctx.db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, input.id))
      .get()
    if (!map?.draftHash || map.draftVersion !== input.expectedVersion)
      error(409, 'MAP_CONFLICT')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const current = await readMapBundle(bucket, input.id, map.draftHash)
    if (!current.data.sourceSnapshotHash || !current.data.sourceDataset)
      error(409, 'SOURCE_SNAPSHOT_REQUIRED')
    const source = await readMapBundle(
      bucket,
      input.id,
      current.data.sourceSnapshotHash,
    )
    const correctionWrite = ctx.db
      .delete(premisesMapCorrection)
      .where(
        and(
          eq(premisesMapCorrection.mapId, input.id),
          eq(premisesMapCorrection.sourceDataset, input.sourceDataset),
          eq(premisesMapCorrection.sourceLayer, input.sourceLayer),
          eq(premisesMapCorrection.sourceEntityId, input.sourceEntityId),
          eq(premisesMapCorrection.field, input.field),
        ),
      )
    const existing = await ctx.db
      .select()
      .from(premisesMapCorrection)
      .where(
        and(
          eq(premisesMapCorrection.mapId, input.id),
          eq(premisesMapCorrection.sourceDataset, current.data.sourceDataset),
        ),
      )
    const corrections = existing.filter(
      row =>
        !(
          row.sourceDataset === input.sourceDataset &&
          row.sourceLayer === input.sourceLayer &&
          row.sourceEntityId === input.sourceEntityId &&
          row.field === input.field
        ),
    )
    const bundle = await prepareCorrectedMap(ctx.db, bucket, {
      id: input.id,
      sourceDataset: current.data.sourceDataset,
      bundle: source,
      corrections,
    })
    if (!existing.some(row => row.sourceLayer === 'connection'))
      bundle.data.connections = current.data.connections
    return saveMapDraft(ctx.db, bucket, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      bundle,
      actorId: ctx.user.id,
      correctionWrites: [correctionWrite],
    })
  },
)

/** Inspect changes between two immutable publications of an authorized map.
 * @param input Map identity and published version. @returns Curated-field changes against the preceding publication.
 * @remarks Version membership is checked before reading stored release content.
 */
export const getPremisesMapPublicationChanges = guardedQuery(
  z.object({ id: mapIdSchema, version: z.number().int().positive() }),
  async (input, ctx) => {
    authorize(ctx)
    const history = await ctx.db
      .select()
      .from(premisesMapPublication)
      .where(eq(premisesMapPublication.mapId, input.id))
      .orderBy(desc(premisesMapPublication.version))
    const index = history.findIndex(release => release.version === input.version)
    if (index < 0) error(404, 'MAP_PUBLICATION_NOT_FOUND')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const current = await readMapBundle(bucket, input.id, history[index].hash)
    const previous = history[index + 1]
    const baseline = previous
      ? await readMapBundle(bucket, input.id, previous.hash)
      : undefined
    return {
      previousVersion: previous?.version ?? null,
      changes: publicationChanges(current, baseline),
    }
  },
)
