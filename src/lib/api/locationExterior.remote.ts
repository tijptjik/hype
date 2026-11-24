// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// DATABASE
import { locationExteriorModel } from '#lib/db/schema/locationExteriorModel.js'
// STORAGE
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
          url: `/api/location-exterior/${encodeURIComponent(input.locationId)}/${model.assetId}/${model.sourceModelId}.gltf`,
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
    let sources: ExteriorSource[] = []
    if (current) {
      if (current.sourceModelId === 'assembly') {
        const manifest = await bucket.get(
          `location-exteriors/${current.assetId}/assembly.json`,
        )
        if (!manifest) error(409, 'Existing model manifest is unavailable.')
        sources = (await manifest.json<{ sources: ExteriorSource[] }>()).sources
      } else {
        const object = await bucket.get(
          `location-exteriors/${current.assetId}/${current.sourceModelId}.gltf`,
        )
        if (!object) error(409, 'Existing model is unavailable.')
        sources = [
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
    }
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
    // Copy retained dependencies to the new immutable asset before switching the database pointer.
    for (const source of sources.filter(
      source => !slices.some(slice => slice.modelId === source.slice.modelId),
    )) {
      for (const item of [
        ...(source.document.buffers ?? []),
        ...(source.document.images ?? []),
      ]) {
        if (!item.uri) continue
        const name = dependencyName(source.slice.modelId, item.uri)
        const previousName = current?.sourceModelId === 'assembly' ? name : item.uri
        const object = await bucket.get(
          `location-exteriors/${current!.assetId}/${previousName}`,
        )
        if (!object) error(409, 'Existing model dependency is unavailable.')
        await bucket.put(`location-exteriors/${assetId}/${name}`, object.body, {
          httpMetadata: object.httpMetadata,
        })
      }
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
      locationId: input.locationId,
      assetId,
      sourceModelId: 'assembly',
      sourceSheet: [...new Set(sources.map(source => source.slice.sheet))].join(','),
      actorId: ctx.user.id,
      createdAt: new Date().toISOString(),
    }
    // Fence concurrent imports so neither reviewer silently discards the other's slices.
    const saved = await ctx.db
      .insert(locationExteriorModel)
      .values(value)
      .onConflictDoUpdate({
        target: locationExteriorModel.locationId,
        set: value,
        setWhere: input.expectedAssetId
          ? eq(locationExteriorModel.assetId, input.expectedAssetId)
          : sql`0`,
      })
      .returning({ assetId: locationExteriorModel.assetId })
    if (!saved.length) error(409, 'Exterior changed; refresh before importing.')
    return value
  },
)
