// RUNTIME
import { existsSync, readFileSync, realpathSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { createCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import { deriveLocationId } from '../../src/lib/locations/id.server'
import { LocalLocationFootprintSchema } from '../../src/lib/locations/footprint'
// TYPES
import type { LocationFacts } from '../../src/lib/locations/model'
import type { Geometry, Position } from 'geojson'

type SourceFeature = { geometry: Geometry; properties: Record<string, unknown> }
type Plan = {
  version: number
  status: string
  premises: Array<{
    ref: string
    names: Record<string, string>
    geometry: Geometry
    indoorSource?: { manifest: { retrievedAt: string }; venue: SourceFeature }
    source: unknown
  }>
  units: Array<{
    ref: string
    names: Record<string, string>
    retrievedAt: string
    rawSource: SourceFeature
  }>
  memberships: Array<{ childRef: string; parentRef: string }>
  occupantEvidence: Array<{
    sourceOccupantId: string
    unitRef: string
    names: Record<string, string>
    rawSource: SourceFeature
    review: { reasons: string[] }
  }>
}

/** Strip elevation only from display geometry; source evidence keeps all original coordinates.
 * @param geometry Source geometry. @returns Two-dimensional display geometry.
 */
function planar(geometry: Geometry): Geometry {
  if (geometry.type === 'GeometryCollection')
    throw new Error('Unsupported geometry collection')
  const visit = (value: unknown): unknown =>
    Array.isArray(value) && typeof value[0] === 'number'
      ? value.slice(0, 2)
      : (value as unknown[]).map(visit)
  return { ...geometry, coordinates: visit(geometry.coordinates) } as Geometry
}

/** Build a local baseline without inventing an upstream address or publication.
 * @param names Source names. @param geometry Source point or footprint. @param kind Physical classification.
 * @returns Typed display facts; detailed floor and section fields stay in source evidence.
 */
function facts(
  names: Record<string, string>,
  geometry: Geometry,
  kind: 'premises' | 'building_part',
): LocationFacts {
  const shape = planar(geometry)
  const points: Position[] = []
  const visit = (v: unknown): void => {
    if (!Array.isArray(v)) return
    if (typeof v[0] === 'number') points.push(v as Position)
    else v.forEach(visit)
  }
  if ('coordinates' in shape) visit(shape.coordinates)
  if (!points.length) throw new Error('Missing source coordinates')
  const coordinates: [number, number] = [0, 1].map(
    i => (Math.min(...points.map(p => p[i])) + Math.max(...points.map(p => p[i]))) / 2,
  ) as [number, number]
  return {
    names: Object.fromEntries(
      Object.entries(names).map(([locale, name]) => [locale.toLowerCase(), name]),
    ),
    entity: { kind, details: {} },
    phoneNumber: [],
    brands: [],
    ...(shape.type === 'Polygon' || shape.type === 'MultiPolygon'
      ? {
          footprint: LocalLocationFootprintSchema.parse({
            mode: 'inline',
            geometry: shape,
          }),
        }
      : {}),
    location: {
      geometry: { type: 'Point', coordinates },
      address: {
        status: 'unresolved',
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        snapshotId: null,
        rawSource: {},
        fallbackDisplay: {},
      },
    },
  }
}

/** Apply a reviewed plan to an offline copy or an explicitly selected local development database.
 * @returns Import counts. @remarks Existing source keys replay without rewriting facts or history.
 * Optional occupancy mappings require an existing shared establishment and its exact current revision.
 * --apply-local permits only the managed local D1 directory; remote bindings are never supported.
 */
async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const applyLocal = arguments_.includes('--apply-local')
  const [database, planPath, actorId, mappingPath] = arguments_.filter(
    value => value !== '--apply-local',
  )
  if (!database || !planPath || !actorId)
    throw new Error(
      'Usage: apply-mtr-drafts.ts OFFLINE.sqlite PLAN.json ACTOR_ID [REVIEWED_OCCUPANCIES.json]',
    )
  const path = realpathSync(database)
  const managedLocal =
    existsSync('.wrangler/state/v3/d1') &&
    path.startsWith(`${realpathSync('.wrangler/state/v3/d1')}/`)
  if (
    path.includes('://') ||
    (managedLocal && !applyLocal) ||
    (applyLocal && !managedLocal)
  )
    throw new Error(
      'Use an offline copy, or --apply-local with a managed local D1 database',
    )
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  if (plan.version !== 1 || plan.status !== 'plan-only')
    throw new Error('Unsupported onboarding plan')
  const mappings = mappingPath
    ? (JSON.parse(readFileSync(mappingPath, 'utf8')) as Array<{
        sourceOccupantId: string
        establishmentLocationId: string
        expectedRevisionId: string
      }>)
    : []
  if (new Set(mappings.map(m => m.sourceOccupantId)).size !== mappings.length)
    throw new Error('Duplicate occupant mapping')
  const domain = openSqliteDomain(path)
  const refs = new Map<string, string>()
  const common = {
    previousRevisionId: null,
    scopeOrganisationId: null,
    assertionState: 'asserted' as const,
    verifiedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
  }
  domain.sqlite.exec('BEGIN IMMEDIATE')
  try {
    for (const row of [...plan.premises, ...plan.units]) {
      if (refs.has(row.ref)) throw new Error('Duplicate plan identity')
      const unit = 'rawSource' in row
      const result = await createCanonicalLocationDraft(domain.db, {
        sourceKey: row.ref,
        kind: unit ? 'building_part' : 'premises',
        actorId,
        facts: facts(
          row.names,
          unit
            ? row.rawSource.geometry
            : (row.indoorSource?.venue.geometry ?? row.geometry),
          unit ? 'building_part' : 'premises',
        ),
        rawSource: {
          record: row,
          occupantEvidence: plan.occupantEvidence.filter(o => o.unitRef === row.ref),
        },
      })
      refs.set(row.ref, result.locationId)
    }
    for (const member of plan.memberships) {
      const child = refs.get(member.childRef),
        parent = refs.get(member.parentRef)
      if (!child || !parent) throw new Error('Unknown membership endpoint')
      const unit = plan.units.find(u => u.ref === member.childRef)
      if (!unit) throw new Error('Membership source unit is missing')
      const id = deriveLocationId('canonical-draft', `membership:${member.childRef}`)
      await appendLocationRelationship(
        domain.db,
        {
          ...common,
          table: 'locationMembership',
          id,
          relationshipId: id,
          childLocationId: child,
          parentLocationId: parent,
          membershipState: 'current',
          observedAt: new Date(unit.retrievedAt).toISOString(),
          evidence: [
            {
              source: {
                kind: 'record',
                resourceType: 'locationRevision',
                revisionId: `${child}_draft`,
              },
              supports: ['childLocationId', 'parentLocationId'],
              quotedText: null,
              description: 'LandsD unit venue_id identifies the station premises.',
              sourceDate: null,
            },
          ],
        },
        actorId,
      )
    }
    for (const mapping of mappings) {
      const source = plan.occupantEvidence.find(
        o => o.sourceOccupantId === mapping.sourceOccupantId,
      )
      if (!source || source.review.reasons.includes('code-only-or-unnamed'))
        throw new Error(
          'Cannot use missing or code-only occupant as establishment evidence',
        )
      const unit = refs.get(source.unitRef)
      const sourceUnit = plan.units.find(u => u.ref === source.unitRef)
      if (!unit || !sourceUnit) throw new Error('Occupancy source unit is missing')
      const retained = domain.sqlite
        .query(
          "SELECT id FROM location WHERE id=? AND matchingType='establishment' AND state IN ('linked','unresolved') AND (SELECT id FROM locationRevisionContent WHERE locationId=location.id ORDER BY version DESC LIMIT 1)=?",
        )
        .get(mapping.establishmentLocationId, mapping.expectedRevisionId)
      if (!retained)
        throw new Error('Reviewed establishment identity or revision changed')
      const id = deriveLocationId(
        'canonical-draft',
        `occupancy:${source.sourceOccupantId}`,
      )
      await appendLocationRelationship(
        domain.db,
        {
          ...common,
          table: 'locationOccupancy',
          id,
          relationshipId: id,
          establishmentLocationId: mapping.establishmentLocationId,
          containerLocationId: unit,
          addressRevisionId: null,
          occupancyState: 'current',
          observedAt: new Date(sourceUnit.retrievedAt).toISOString(),
          evidence: [
            {
              source: {
                kind: 'record',
                resourceType: 'locationRevision',
                revisionId: `${unit}_draft`,
              },
              supports: ['establishmentLocationId', 'containerLocationId'],
              quotedText: null,
              description:
                'Reviewed establishment mapping to LandsD occupant ' +
                source.sourceOccupantId +
                ' and its explicit unit_id.',
              sourceDate: null,
            },
          ],
        },
        actorId,
      )
    }
    domain.sqlite.exec('COMMIT')
    console.log(
      JSON.stringify({
        locations: refs.size,
        memberships: plan.memberships.length,
        reviewedOccupancies: mappings.length,
        pendingOccupantEvidence: plan.occupantEvidence.length - mappings.length,
      }),
    )
  } catch (error) {
    domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
