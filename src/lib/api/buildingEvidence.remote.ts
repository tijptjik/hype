// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
import { requireLocationOrganisationManager } from './services/locationOwnership.js'
// SERVICES
import { probeProjectQuery } from '#lib/db/services/project.js'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
import {
  savePhysicalBuildingMember,
  physicalBuildingMembers,
} from '#lib/db/services/physicalBuilding.js'
import {
  outlineRoles,
  type PhysicalBuildingMember,
} from '#lib/locations/physicalBuilding.js'
import { relationshipScopeSql } from '#lib/db/services/locationRelationships.js'
// DOMAIN
import {
  BuildingSourceSchema,
  type BuildingSource,
} from '#lib/locations/buildingSource.js'
import { addressName } from '#lib/addresses/formatting.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { proposeLocalAddressParse } from '#lib/addresses/localAddressParse.js'
import { loadAddressNames } from '#lib/addresses/nameCatalogue.js'
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

/** Attach a verified SaanSeoi building as a constituent of a separately authored HYPE Building.
 * @param input Project, parent or creation retry key, and selected catalogue record or previous HYPE import.
 * @returns Physical building identity ready for session inclusion and subsequent additions.
 */
export const attachPhysicalBuildingMember = guardedCommand(
  z
    .strictObject({
      projectId: z.string().min(1).optional(),
      organisationId: z.string().min(1).optional(),
      target: z.union([
        z.strictObject({ requestId: z.uuid() }),
        z.strictObject({ parentId: z.string().min(1).max(100) }),
      ]),
      source: z.union([
        BuildingSourceSchema,
        z.strictObject({ importedLocationId: z.string().min(1).max(100) }),
      ]),
    })
    .refine(value => Boolean(value.projectId) !== Boolean(value.organisationId)),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const organisationId =
      input.organisationId ??
      (await probeProjectQuery(ctx.db, { ref: input.projectId!, refKey: 'id' }))
        ?.organisationId
    if (!organisationId) error(404, 'ORGANISATION_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, organisationId)
    let source: BuildingSource
    if ('importedLocationId' in input.source) {
      const row = await ctx.db.get<{
        source: string
      }>(sql`SELECT json_extract(v.rawSource,'$.buildingSource') source
        FROM location l JOIN locationRevision v ON v.locationId=l.id WHERE l.id=${input.source.importedLocationId}
        AND l.matchingType='building' AND l.state NOT IN ('manual','redirect')
        AND json_extract(v.rawSource,'$.kind')='building-export-baseline' ORDER BY v.version LIMIT 1`)
      if (!row) error(409, 'The imported building is unavailable.')
      source = BuildingSourceSchema.parse(JSON.parse(row.source))
    } else source = input.source
    const details = await loadBuildingDetails(source.id, source.release)
    if (source.addressId && !details.addresses.some(row => row.id === source.addressId))
      error(409, 'The selected published address is unavailable.')
    const streets = details.addresses.length ? await loadAddressNames('streets') : []
    const addresses = details.addresses.map(address => {
      const parsed = proposeLocalAddressParse(
        { source: address.display, content: createLocalLocationAddress() },
        streets,
      )
      return {
        ...address,
        streets: Object.fromEntries(
          Object.entries(parsed.content.i18n).flatMap(([tag, row]) =>
            row.streetName
              ? [
                  [
                    tag,
                    {
                      name:
                        tag === 'en'
                          ? addressName(row.streetName, 'en')
                          : row.streetName,
                      number: row.buildingNumberExpression ?? '',
                    },
                  ],
                ]
              : [],
          ),
        ),
      }
    })
    return {
      locationId: await savePhysicalBuildingMember(
        ctx.db,
        organisationId,
        ctx.user.id,
        input.target,
        { source, coordinates: details.coordinates, addresses },
      ),
    }
  },
)

/** Determine which composition action applies to this Building in the current organisation.
 * @param input Visible Location and editing organisation. @returns The editor role and currently attached catalogue IDs with their reviewed outline roles.
 */
export const getBuildingCompositionRole = guardedQuery(
  z.strictObject({ locationId: z.string().min(1), organisationId: z.string().min(1) }),
  async (input, ctx) => {
    await requireLocationOrganisationManager(ctx, input.organisationId)
    const row = await ctx.db.get<{
      role: 'source' | 'parent' | null
      sourceId: string | null
      generatedProfile: number
      owned: number
    }>(sql`SELECT
      v.rawSource->>'$.kind'='physical-building-member' generatedProfile,
      v.rawSource->>'$.buildingSource.id' sourceId,l.ownerOrganisationId=${input.organisationId} owned, CASE
      WHEN v.rawSource->>'$.kind'='physical-building-member' AND l.ownerOrganisationId=${input.organisationId} THEN 'parent'
      WHEN json_extract(v.rawSource,'$.kind')='building-export-baseline' THEN 'source'
      END role
      FROM location l JOIN locationRevision v ON v.locationId=l.id AND v.version=1
      WHERE l.id=${input.locationId} AND l.matchingType='building' AND l.state='unresolved'`)
    const result =
      row?.role === 'parent'
        ? await ctx.db.get<{ members: string }>(
            sql`SELECT ${physicalBuildingMembers(sql`${input.locationId}`, input.organisationId)} members`,
          )
        : null
    const members: PhysicalBuildingMember[] = result ? JSON.parse(result.members) : []
    return {
      role: row?.role ?? null,
      sourceId: row?.sourceId ?? null,
      canFillProfile: Boolean(row?.generatedProfile),
      members: members.map(member => ({
        id: member.source.id,
        outlineRole: member.outlineRole,
      })),
    }
  },
)

/** Populate an existing physical building from its pinned constituents.
 * @param input Owned parent and organisation. @returns The refreshed identity.
 */
export const refreshPhysicalBuildingProfile = guardedCommand(
  z.strictObject({ locationId: z.string().min(1), organisationId: z.string().min(1) }),
  async (input, ctx) => {
    await requireLocationOrganisationManager(ctx, input.organisationId)
    return savePhysicalBuildingMember(ctx.db, input.organisationId, ctx.user.id, {
      parentId: input.locationId,
    })
  },
)

/** Record the architectural meaning of a constituent outline for the editing organisation.
 * @param input Parent, exact visible membership revision, scope and reviewed role.
 * @returns The new scoped membership revision, retaining the original evidence and dates.
 */
export const setBuildingOutlineRole = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1),
    organisationId: z.string().min(1),
    revisionId: z.string().min(1),
    role: z.enum(outlineRoles).nullable(),
  }),
  async (input, ctx) => {
    await requireLocationOrganisationManager(ctx, input.organisationId)
    const id = crypto.randomUUID()
    // Copy the exact effective composition assertion and fence concurrent scoped edits in the same statement.
    const row = await ctx.db.get<{ id: string }>(sql`INSERT INTO locationMembership
      (id,relationshipId,previousRevisionId,scopeOrganisationId,assertionState,evidence,observedAt,verifiedAt,effectiveFrom,effectiveTo,effectiveFromPrecision,effectiveToPrecision,provenance,actorId,childLocationId,parentLocationId,membershipState)
      SELECT ${id},r.relationshipId,CASE WHEN r.scopeOrganisationId IS ${input.organisationId} THEN r.id END,${input.organisationId},r.assertionState,r.evidence,r.observedAt,r.verifiedAt,r.effectiveFrom,r.effectiveTo,r.effectiveFromPrecision,r.effectiveToPrecision,
        json_set(r.provenance,'$.outlineRole',${input.role}),${ctx.user.id},r.childLocationId,r.parentLocationId,r.membershipState
      FROM locationMembershipHead r JOIN locationMembership root ON root.id=r.relationshipId
      JOIN location p ON p.id=r.parentLocationId JOIN location c ON c.id=r.childLocationId
      WHERE r.id=${input.revisionId} AND p.id=${input.locationId} AND p.state!='redirect' AND c.state NOT IN ('manual','redirect')
        AND p.ownerOrganisationId=${input.organisationId} AND root.provenance->>'$.process'='physical-building-composition'
        AND r.assertionState='asserted' AND r.membershipState='current' AND ${relationshipScopeSql('locationMembership', input.organisationId)}
      RETURNING id`)
    if (!row) error(409, 'The membership changed. Reload to review its current role.')
    return row.id
  },
)
