// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// DATABASE
import { locationExteriorModel } from '#lib/db/schema/locationExteriorModel.js'
// STORAGE
import { textureComparisonFile } from '#lib/locations/exterior/textureComparison.server.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
import {
  extractModel,
  lookupSheet,
  modelCandidates,
} from '#lib/locations/exterior/csdi.server.js'
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
import { loadExteriorFootprints } from '#lib/locations/exterior/footprints.server.js'

import {
  assembleExterior,
  dependencyName,
  type ExteriorSource,
  type ExteriorSlice,
} from '#lib/locations/exterior/assembly.js'
import { loadBuildingDetails } from '#lib/sources/saanseoi.js'
import { BuildingEvidenceSchema } from '#lib/locations/buildingEvidence.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { locationRevision } from '#lib/db/schema/location.js'

// TYPES
import type { GuardedCommandContext } from '#lib/api/guarded.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. EXTERIOR QUERIES
// - exteriorModelUrl
// - getLocationExterior
// - findLocationExteriorCandidates
//
// 2. SLICE ASSOCIATIONS
// - importLocationExterior
// - removeLocationExteriorSlice
//
// 3. ASSET STORAGE
// - readSources
// - copyDependencies
// - currentAssociation
// - publishAssembly
// ---

/********************
 *  1. EXTERIOR QUERIES
 ************/
// +++ Exterior Queries
type ExteriorModel = typeof locationExteriorModel.$inferSelect
type ExteriorBucket = ReturnType<typeof premisesMapBucket>

const sliceSchema = z.object({
  modelId: z
    .string()
    .regex(/^B[a-zA-Z0-9]+$/)
    .max(100),
  footprintId: z.string().max(200).optional(),
  label: z.string().trim().max(500).optional(),
  evidenceKeys: z.array(z.string().max(100)).max(30).default([]),
})
const inputSchema = z.object({ locationId: z.string().min(1).max(200) })

/** @param model Confirmed exterior association. @returns Its authenticated viewer URL. */
function exteriorModelUrl(model: ExteriorModel): string {
  return `/api/location-exterior/${encodeURIComponent(model.locationId)}/${model.assetId}/${model.sourceModelId}.gltf`
}

/** Retrieve the assembled exterior and reviewed slice mappings. @param input Location ID. @returns Source metadata, retained evidence choices and the shared viewer asset URL. */
export const getLocationExterior = guardedQuery(inputSchema, async (input, ctx) => {
  await authorizeExteriorLocation(ctx, input.locationId)
  const model = await ctx.db
    .select()
    .from(locationExteriorModel)
    .where(eq(locationExteriorModel.locationId, input.locationId))
    .get()
  const bucket = premisesMapBucket(ctx.event.locals.platform)
  const manifest =
    model?.sourceModelId === 'assembly'
      ? await bucket.get(`location-exteriors/${model.assetId}/assembly.json`)
      : null
  const sources = manifest ? await manifest.json<{ sources: ExteriorSource[] }>() : null
  const baseline = await ctx.db
    .select({ rawSource: locationRevision.rawSource })
    .from(locationRevision)
    .where(eq(locationRevision.locationId, input.locationId))
    .orderBy(sql`${locationRevision.version} asc`)
    .get()
  const provenance = baseline?.rawSource as
    | { buildingEvidence?: { references?: unknown[] } }
    | undefined
  // Label retained references from their pinned evidence; unavailable publishers never block the editor.
  const evidence = await Promise.all(
    (provenance?.buildingEvidence?.references ?? []).map(async (reference, index) => {
      const parsed = BuildingEvidenceSchema.safeParse(reference)
      let label = 'Building evidence ' + (index + 1)
      if (parsed.success) {
        const entry = parsed.data
        if (entry.type === 'saanseoi') {
          const names = (reference as { names?: Record<string, string> }).names ?? {}
          const name = names.en || Object.values(names).find(Boolean) || ''
          let address = ''
          try {
            const details = await loadBuildingDetails(
              entry.source.id,
              entry.source.release,
            )
            const addresses = entry.source.addressId
              ? details.addresses.filter(item => item.id === entry.source.addressId)
              : details.addresses
            address = [
              ...new Set(
                addresses
                  .map(
                    item =>
                      item.display.en || Object.values(item.display).find(Boolean),
                  )
                  .filter(Boolean),
              ),
            ].join(' / ')
          } catch {
            // Retain readable saved evidence when the pinned publisher release cannot be fetched.
          }
          label =
            'SaanSeoi · ' +
            ([name, address].filter(Boolean).join(' — ') ||
              'Building reference ' + (index + 1))
        } else if (entry.type === 'location') {
          // Recheck source visibility before resolving another Location's label.
          const accessible = await authorizeExteriorLocation(ctx, entry.locationId)
            .then(() => true)
            .catch(() => false)
          const record = accessible
            ? await ctx.db
                .select({ facts: locationRevision.facts })
                .from(locationRevision)
                .where(
                  sql`${locationRevision.id}=${entry.revisionId} AND ${locationRevision.locationId}=${entry.locationId}`,
                )
                .get()
            : null
          if (record) {
            const facts = readLocationFacts(record.facts)
            const address = emptyFeatureAddress()
            address.source = facts.location.address
            label =
              'HYPE · ' +
              (facts.names.en ||
                Object.values(facts.names).find(Boolean) ||
                getAddressDisplay(address, 'en') ||
                'Unnamed building')
          }
        } else label = 'Map footprint ' + (index + 1)
      }
      return { key: String(index), reference, label }
    }),
  )
  return {
    evidence,
    slices:
      sources?.sources.map(source => source.slice) ??
      (model
        ? [
            {
              modelId: model.sourceModelId,
              sheet: model.sourceSheet,
              evidenceKeys: [] as string[],
            } as ExteriorSlice,
          ]
        : []),
    canImport: Boolean(ctx.user.superAdmin),
    model: model
      ? {
          ...model,
          comparisonFile: await textureComparisonFile(
            ctx.event.locals.platform,
            model.assetId,
          ),
          url: exteriorModelUrl(model),
        }
      : null,
  }
})

/** Find nearby CSDI models for a Building Location. @param input Coordinates and Location ID. @returns Candidate identifiers and sheet. */
export const findLocationExteriorCandidates = guardedQuery(
  inputSchema.extend({
    coordinates: z.tuple([z.number().finite(), z.number().finite()]),
  }),
  async (input, ctx) => {
    await authorizeExteriorLocation(ctx, input.locationId)
    if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    try {
      const sheet = await lookupSheet(input.coordinates)
      const footprints = await loadExteriorFootprints(sheet.x, sheet.y)
      return { sheet: sheet.sheet, candidates: modelCandidates(sheet), footprints }
    } catch (cause) {
      console.error('CSDI model search failed', cause)
      throw cause
    }
  },
)

// ---
/********************
 *  2. SLICE ASSOCIATIONS
 ************/
// +++ Slice Associations
/** Add reviewed model slices and atomically publish their assembled scene.
 * @param input Building, coordinates, expected asset and reviewed slice mappings.
 * @returns Updated immutable asset pointer.
 * @remarks Existing slices are retained. Failed uploads or stale edits cannot replace the current model.
 */
export const importLocationExterior = guardedCommand(
  inputSchema.extend({
    coordinates: z.tuple([z.number().finite(), z.number().finite()]),
    expectedAssetId: z.string().nullable(),
    refreshAll: z.boolean().default(false),
    slices: z
      .array(sliceSchema)
      .max(20)
      .refine(
        rows => new Set(rows.map(row => row.modelId)).size === rows.length,
        'Duplicate model',
      ),
  }),
  async (input, ctx) => {
    await authorizeExteriorLocation(ctx, input.locationId)
    if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    const current = await ctx.db
      .select()
      .from(locationExteriorModel)
      .where(eq(locationExteriorModel.locationId, input.locationId))
      .get()
    if ((current?.assetId ?? null) !== input.expectedAssetId)
      error(409, 'Exterior changed; refresh before importing.')
    const baseline = await ctx.db
      .select({ rawSource: locationRevision.rawSource })
      .from(locationRevision)
      .where(eq(locationRevision.locationId, input.locationId))
      .orderBy(sql`${locationRevision.version} asc`)
      .get()
    const provenance = baseline?.rawSource as
      | { buildingEvidence?: { references?: unknown[] } }
      | undefined
    const evidence = provenance?.buildingEvidence?.references ?? []
    for (const slice of input.slices) {
      if (
        slice.evidenceKeys.some(
          key => !/^\d+$/.test(key) || Number(key) >= evidence.length,
        )
      )
        error(400, 'Unknown building evidence reference.')
    }
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    let sources = current ? await readSources(bucket, current) : []
    if (
      new Set([
        ...sources.map(item => item.slice.modelId),
        ...input.slices.map(item => item.modelId),
      ]).size > 20
    )
      error(400, 'A building supports at most 20 model slices.')
    const slices = input.refreshAll ? sources.map(source => source.slice) : input.slices
    if (!slices.length) error(400, 'Choose at least one model slice.')
    const sheet = await lookupSheet(input.coordinates)
    if (
      input.refreshAll &&
      slices.some(slice => 'sheet' in slice && slice.sheet !== sheet.sheet)
    )
      error(
        409,
        'The source sheet changed; review model associations before refreshing.',
      )
    const footprints =
      !input.refreshAll && slices.some(slice => slice.footprintId)
        ? await loadExteriorFootprints(sheet.x, sheet.y)
        : null
    const assetId = crypto.randomUUID()
    if (current) {
      const retained = sources.filter(
        source => !slices.some(slice => slice.modelId === source.slice.modelId),
      )
      await copyDependencies(bucket, current, assetId, retained)
    }
    for (const slice of slices) {
      const previous = sources.find(source => source.slice.modelId === slice.modelId)
      const footprint = slice.footprintId
        ? footprints?.features.find(item => item.properties.csuid === slice.footprintId)
        : null
      if (!input.refreshAll && slice.footprintId && !footprint)
        error(400, 'Selected government footprint is unavailable.')
      const files = await extractModel(sheet, slice.modelId)
      const document = JSON.parse(
        new TextDecoder().decode(files.get(slice.modelId + '.gltf')!),
      )
      const source = {
        slice: {
          ...previous?.slice,
          ...slice,
          sheet: sheet.sheet,
          sourceVersion: {
            etag: sheet.etag,
            lastModified: sheet.lastModified,
            revisionDate: sheet.revisionDate,
            fetchedAt: new Date().toISOString(),
            textureCount: document.images?.length ?? 0,
          },
          label:
            slice.label || footprint?.properties.name || footprint?.properties.nameZh,
          evidence: slice.evidenceKeys.map(key => evidence[Number(key)]),
          footprint:
            footprint ??
            (previous?.slice as (ExteriorSlice & { footprint?: unknown }) | undefined)
              ?.footprint,
        },
        document,
      }
      sources = [
        ...sources.filter(item => item.slice.modelId !== slice.modelId),
        source,
      ]
      for (const [name, bytes] of files) {
        if (name.endsWith('.gltf')) continue
        const contentType = name.endsWith('.bin')
          ? 'application/octet-stream'
          : name.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'
        await bucket.put(
          `location-exteriors/${assetId}/${dependencyName(slice.modelId, name)}`,
          bytes,
          { httpMetadata: { contentType } },
        )
      }
    }
    return publishAssembly(ctx, bucket, input.locationId, current, assetId, sources)
  },
)

/** Remove a reviewed slice from this Location's exterior.
 * @param input Location, selected model ID and the asset the reviewer saw.
 * @returns The newly published model for the next edit, or null after the final unlink.
 */
export const removeLocationExteriorSlice = guardedCommand(
  inputSchema.extend({
    expectedAssetId: z.string().min(1),
    modelId: sliceSchema.shape.modelId,
  }),
  async ({ locationId, expectedAssetId, modelId }, ctx) => {
    await authorizeExteriorLocation(ctx, locationId)
    if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    const current = await ctx.db
      .select()
      .from(locationExteriorModel)
      .where(eq(locationExteriorModel.locationId, locationId))
      .get()
    if (!current || current.assetId !== expectedAssetId)
      error(409, 'Exterior changed. Reload before removing a slice.')

    // Legacy single-model links carry the slice ID directly on the Location association.
    if (current.sourceModelId === 'assembly') {
      const bucket = premisesMapBucket(ctx.event.locals.platform)
      const sources = await readSources(bucket, current)
      const retained = sources.filter(source => source.slice.modelId !== modelId)
      if (retained.length === sources.length) error(404, 'Slice is not associated.')
      if (retained.length) {
        const assetId = crypto.randomUUID()
        await copyDependencies(bucket, current, assetId, retained)
        const saved = await publishAssembly(
          ctx,
          bucket,
          locationId,
          current,
          assetId,
          retained,
        )
        return { ...saved, url: exteriorModelUrl(saved), comparisonFile: null }
      }
    } else if (current.sourceModelId !== modelId) error(404, 'Slice is not associated.')

    // Unlink the last slice only if the reviewer is still editing the same assembly.
    const removed = await ctx.db
      .delete(locationExteriorModel)
      .where(currentAssociation(current))
      .returning({ assetId: locationExteriorModel.assetId })
    if (!removed.length) error(409, 'Exterior changed. Reload before removing a slice.')
    return null
  },
)

// ---
/********************
 *  3. ASSET STORAGE
 ************/
// +++ Asset Storage
/** Load the immutable source documents needed to rebuild an existing exterior.
 * @param bucket Exterior asset storage.
 * @param current Linked asset metadata.
 * @returns Reviewed source documents including older single-model assets.
 */
async function readSources(
  bucket: ExteriorBucket,
  current: ExteriorModel,
): Promise<ExteriorSource[]> {
  const prefix = `location-exteriors/${current.assetId}`
  if (current.sourceModelId === 'assembly') {
    const manifest = await bucket.get(`${prefix}/assembly.json`)
    if (!manifest) error(409, 'Existing model manifest is unavailable.')
    return (await manifest.json<{ sources: ExteriorSource[] }>()).sources
  }
  const object = await bucket.get(`${prefix}/${current.sourceModelId}.gltf`)
  if (!object) error(409, 'Existing model is unavailable.')
  return [
    {
      slice: {
        modelId: current.sourceModelId,
        sheet: current.sourceSheet,
        evidenceKeys: [],
      },
      document: await object.json<ExteriorSource['document']>(),
    },
  ]
}

/** Copy retained dependencies to the new immutable asset before switching the database pointer.
 * @param bucket Exterior asset storage.
 * @param current Linked asset containing the source files.
 * @param assetId Destination asset ID.
 * @param retained Sources to keep in the replacement assembly.
 * @returns Completion after all retained buffers and textures are written.
 */
async function copyDependencies(
  bucket: ExteriorBucket,
  current: ExteriorModel,
  assetId: string,
  retained: ExteriorSource[],
): Promise<void> {
  for (const source of retained) {
    for (const item of [
      ...(source.document.buffers ?? []),
      ...(source.document.images ?? []),
    ]) {
      if (!item.uri) continue
      const name = dependencyName(source.slice.modelId, item.uri)
      const previousName = current.sourceModelId === 'assembly' ? name : item.uri
      const object = await bucket.get(
        `location-exteriors/${current.assetId}/${previousName}`,
      )
      if (!object) error(409, 'Existing model dependency is unavailable.')
      await bucket.put(`location-exteriors/${assetId}/${name}`, object.body, {
        httpMetadata: object.httpMetadata,
      })
    }
  }
}

/** Match the exact association a reviewer opened.
 * @param current Linked asset metadata.
 * @returns Location and asset predicate for an atomic replacement or unlink.
 */
function currentAssociation(current: ExteriorModel): SQL | undefined {
  return and(
    eq(locationExteriorModel.locationId, current.locationId),
    eq(locationExteriorModel.assetId, current.assetId),
  )
}

/** Publish the complete assembly, then switch the Location to its new asset.
 * @param ctx Authorized request.
 * @param bucket Exterior asset storage.
 * @param locationId Building being edited.
 * @param current Association observed before staging the replacement.
 * @param assetId New immutable asset ID.
 * @param sources Complete set of reviewed slices.
 * @returns Updated association.
 */
async function publishAssembly(
  ctx: GuardedCommandContext,
  bucket: ExteriorBucket,
  locationId: string,
  current: ExteriorModel | undefined,
  assetId: string,
  sources: ExteriorSource[],
): Promise<ExteriorModel> {
  const assembled = assembleExterior(sources)
  await bucket.put(
    `location-exteriors/${assetId}/assembly.gltf`,
    JSON.stringify(assembled),
    { httpMetadata: { contentType: 'model/gltf+json' } },
  )
  await bucket.put(
    `location-exteriors/${assetId}/assembly.json`,
    JSON.stringify({ sources }),
  )
  const value = {
    locationId,
    assetId,
    sourceModelId: 'assembly',
    sourceSheet: [...new Set(sources.map(source => source.slice.sheet))].join(','),
    actorId: ctx.user.id,
    createdAt: new Date().toISOString(),
  }
  // Fence concurrent edits, including a final unlink while an import is staging files.
  const write = current
    ? ctx.db.update(locationExteriorModel).set(value).where(currentAssociation(current))
    : ctx.db.insert(locationExteriorModel).values(value).onConflictDoNothing()
  const saved = await write.returning({ assetId: locationExteriorModel.assetId })
  if (!saved.length) error(409, 'Exterior changed. Reload before editing.')
  return value
}
// ---
