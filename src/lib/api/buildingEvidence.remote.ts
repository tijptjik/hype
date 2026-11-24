// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedCommand } from './server/guarded.js'
import { requireLocationOrganisationManager } from './services/locationOwnership.js'
// SERVICES
import { probeProjectQuery } from '#lib/db/services/project.js'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
// DOMAIN
import {
  BuildingEvidenceSchema,
  combineBuildingOutlines,
} from '#lib/locations/buildingEvidence.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

// TOC: Reviewed building creation
/** Create a physical building from explicitly reviewed contributing evidence.
 * @param input Project, reviewed label/address, map position and contributing references.
 * @returns New HYPE Location identity and initial revision.
 * @remarks Upstream records remain evidence, not automatic identity matches. Source Locations are not redirected.
 */
export const createBuildingFromEvidence = guardedCommand(
  z.object({
    projectId: z.string().min(1),
    name: z.string().trim().max(500),
    address: z.string().trim().min(1).max(2000),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    evidence: z
      .array(BuildingEvidenceSchema)
      .min(2)
      .max(30)
      .refine(
        rows => new Set(rows.map(row => JSON.stringify(row))).size === rows.length,
        'Remove duplicate evidence',
      )
      .refine(
        rows => JSON.stringify(rows).length <= 500000,
        'Selected geometry is too large',
      ),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    const references: unknown[] = []
    // Verify every referenced record before writing the new building and its immutable provenance.
    const catalogue = input.evidence.some(row => row.type === 'saanseoi')
      ? await loadBuildingNames()
      : null
    for (const entry of input.evidence) {
      if (entry.type === 'saanseoi') {
        const record = catalogue?.records.find(row => row.id === entry.source.id)
        if (!record || catalogue?.release !== entry.source.release)
          error(409, 'Building publication changed; select the evidence again.')
        const details = await loadBuildingDetails(entry.source.id, entry.source.release)
        if (
          entry.source.addressId &&
          !details.addresses.some(row => row.id === entry.source.addressId)
        )
          error(409, 'Building address changed; select the evidence again.')
        references.push({ ...entry, names: record.names })
      } else if (entry.type === 'location') {
        const record = await ctx.db.get<{ rawSource: string }>(
          sql`SELECT r.rawSource FROM location l JOIN locationRevision r ON r.locationId=l.id WHERE l.id=${entry.locationId} AND r.id=${entry.revisionId} AND l.matchingType='building' AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId=${project.organisationId})`,
        )
        if (!record) error(409, 'Building evidence is no longer accessible.')
        references.push(entry)
      } else references.push({ ...entry, provenance: 'user-selected-map-footprint' })
    }
    const address = emptyFeatureAddress()
    address.coordinates = input.coordinates
    address.overrides.en = { formattedAddress: input.address }
    const value = localIdentityFromAddress(
      'building',
      input.name ? { en: input.name } : {},
      address,
    )
    const outline = combineBuildingOutlines(input.evidence)
    if (outline) value.facts.footprint = { mode: 'inline', geometry: outline }
    return createLocalLocation(
      ctx.db,
      project.organisationId,
      value,
      ctx.user.id,
      undefined,
      {
        references,
        review: 'explicit-physical-building',
      },
    )
  },
)
