// NODE
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// IMPORT POLICY
import donorImportPolicy from './donor-import-policy.json'
import donorBrandIdentities from './donor-brand-identities.json'
import { reviewedDonorMtr } from './lib/donor-mtr-decisions'
// VALIDATION
import { normalizeHongKongPhoneNumber } from '../../src/lib/utils/phone-property'
import { LocalPlaceInputSchema } from '../../src/lib/places/local'
import { emptyFeatureAddress } from '../../src/lib/addresses/featureAddress'
import { createFeatureSpatialIndex } from '../../src/lib/map/featureSpatial'

type SourceRow = Record<string, string | number | null>
const brandIds: Record<string, string> = {
  maxims: '7ZvF0blB7t3c',
  arome: 'C181ezlDw6hu',
  '7eleven': 'f6F0jfv4whUw',
  honore: 'dzs4TYXuJncr',
  yamazaki: 'E6c2h1CF76tu',
  independent: 'blBrandInd01',
  kayser: 'blBrandKay01',
}

/** Quotes a SQLite literal. @param value - Primitive or JSON value. @returns SQL literal. */
function sql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite SQL number')
    return String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}
/** Inserts explicit columns. @param table - Trusted table name. @param row - Values. @returns SQL. */
function insert(table: string, row: Record<string, unknown>): string {
  return `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(sql).join(',')});`
}

/**
 * Generates a repeatable Places + Features import against an explicit destination snapshot.
 * @param args - --source mirror --target snapshot --output SQL path.
 * @returns Nothing; writes a private plan and count-only receipt.
 * @remarks Source changes to accepted mappings fail closed. No remote writes.
 */
export function planBreadlineFeatures(args: string[]): void {
  process.umask(0o077)
  const option = (name: string): string => {
    const value = args[args.indexOf(name) + 1]
    if (!args.includes(name) || !value || value.startsWith('--'))
      throw new Error(`Missing ${name}`)
    return value
  }
  const source = new Database(option('--source'), { readonly: true })
  const target = new Database(option('--target'), { readonly: true })
  const output = option('--output')
  const scope = target
    .query(
      "SELECT p.id projectId,p.organisationId FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.code='breadline' AND o.code='hkfoodworks'",
    )
    .get() as { projectId: string; organisationId: string } | null
  if (!scope) throw new Error('Breadline scope missing')
  const authors = target
    .query(
      "SELECT u.id FROM user u JOIN projectRole r ON r.userId=u.id WHERE r.projectId=? AND r.role='maintainer' AND lower(u.name) LIKE '%claudio%'",
    )
    .all(scope.projectId) as { id: string }[]
  if (authors.length !== 1) throw new Error('Expected one reviewed Claudio maintainer')
  const corrections = JSON.parse(
    readFileSync('scripts/breadline/feature-coordinate-corrections.json', 'utf8'),
  ) as Record<
    string,
    { original: [number, number]; corrected: [number, number]; evidence: string }
  >
  const statements = [
    '-- Breadline Places + Features migration. Requires schema migrations through 0111.',
    '-- Generated from a fresh source snapshot; source hashes preserve accepted identity.',
    '-- Apply in an error-propagating transaction; do not use Bun multi-statement exec.',
  ]
  // Known brand labels now populate Place facts; do not create new classifier options.
  // Run history establishes participation; active status alone does not qualify a donor.
  const donorRuns = new Set(
    (
      source.query('SELECT DISTINCT donor_id FROM breadline__public__runs').all() as {
        donor_id: number
      }[]
    ).map(row => String(row.donor_id)),
  )
  // Curated independent shop identities are retained directly in Place brand provenance.
  const excludedDonors: {
    sourceId: string
    reason: string
    alreadyImported: boolean
  }[] = []
  let reviewedMtr = 0
  const unmappedReviewedExits: string[] = []
  // Apply accepted access after insertion, clearing only the matching automatic job.
  const applyReview = (
    sourceId: string,
    id: string,
    hash: string,
    coordinates: number[],
    geometry: string,
  ): void => {
    const reviewed = reviewedDonorMtr(sourceId, hash, coordinates)
    if (!reviewed) return
    reviewedMtr++
    if (!reviewed.mtrExit) unmappedReviewedExits.push(sourceId)
    statements.push(
      `UPDATE feature SET mtrStation=${sql(reviewed.mtrStation)},mtrExit=${sql(reviewed.mtrExit)},mtrDistance=${sql(reviewed.mtrDistance)},mtrResolution=${sql(reviewed.mtrResolution)} WHERE id=${sql(id)} AND geometry=${sql(geometry)};`,
    )
    statements.push(
      `DELETE FROM featureMtrJob WHERE featureId=${sql(id)} AND geometry=${sql(geometry)};`,
    )
  }
  let created = 0,
    matched = 0,
    invalidPhones = 0,
    corrected = 0
  for (const table of ['donors', 'dropoffs'] as const) {
    const layerId = table === 'donors' ? '1msQMcuqfHrP' : 'kin0shUTfrUi'
    if (
      !target
        .query('SELECT id FROM layer WHERE id=? AND projectId=?')
        .get(layerId, scope.projectId)
    )
      throw new Error('Expected Breadline layer missing')
    const rows = source
      .query(`SELECT * FROM breadline__public__${table} ORDER BY id`)
      .all() as SourceRow[]
    for (const row of rows) {
      const sourceId = String(row.id)
      if (table === 'donors') {
        const reason = (donorImportPolicy.excludedDonorIds as number[]).includes(
          Number(row.id),
        )
          ? 'explicit_exclusion'
          : donorImportPolicy.requireRecordedRun && !donorRuns.has(sourceId)
            ? 'no_recorded_runs'
            : null
        if (reason) {
          excludedDonors.push({
            sourceId,
            reason,
            alreadyImported: Boolean(
              target
                .query(
                  "SELECT 1 FROM breadlineImportFeature WHERE sourceTable='donors' AND sourceId=?",
                )
                .get(sourceId),
            ),
          })
          continue
        }
      }
      const id =
        'bl' +
        (table === 'donors' ? 'D' : 'P') +
        createHash('sha256').update(sourceId).digest('hex').slice(0, 9)
      const hash = String(row._breadline_row_hash)
      const existing = target
        .query(
          'SELECT featureId,sourceHash FROM breadlineImportFeature WHERE sourceTable=? AND sourceId=?',
        )
        .get(table, sourceId) as { featureId: string; sourceHash: string } | null
      if (existing) {
        if (existing.featureId !== id || existing.sourceHash !== hash)
          throw new Error(`Source changed for ${table}:${sourceId}; review required`)
        const association = target
          .query('SELECT placeId FROM featurePlace WHERE featureId=?')
          .get(id)
        if (!association)
          throw new Error(
            `Mapped ${table}:${sourceId} still needs the existing-Feature Place split`,
          )
        if (table === 'donors') {
          const feature = target
            .query('SELECT geometry FROM feature WHERE id=?')
            .get(id) as { geometry: string } | null
          if (!feature) throw new Error(`Missing mapped donor:${sourceId}`)
          applyReview(
            sourceId,
            id,
            hash,
            JSON.parse(feature.geometry).coordinates,
            feature.geometry,
          )
        }
        matched++
        continue
      }
      if (target.query('SELECT id FROM feature WHERE id=?').get(id))
        throw new Error('Unmapped feature ID collision')
      let coordinates: [number, number] = [Number(row.longitude), Number(row.latitude)]
      const correction = table === 'donors' ? corrections[sourceId] : undefined
      if (correction) {
        if (JSON.stringify(coordinates) !== JSON.stringify(correction.original))
          throw new Error('Coordinate correction source changed')
        coordinates = correction.corrected
        corrected++
      }
      if (
        !coordinates.every(Number.isFinite) ||
        coordinates[0] < 113.7 ||
        coordinates[0] > 114.6 ||
        coordinates[1] < 22.1 ||
        coordinates[1] > 22.6
      )
        throw new Error(`Invalid source geometry ${table}:${sourceId}`)
      const geometry = { type: 'Point' as const, coordinates }
      const names: Record<string, string> = {}
      const addresses: Record<string, string> = {}
      for (const locale of ['en', 'zh-hant', 'zh-hans']) {
        const english = locale === 'en'
        names[locale] = String(
          (english ? row.name_en : row.name_zh) || row.name_en || '',
        )
        addresses[locale] = String(
          (english
            ? row.address_display_en || row.address_full_en
            : row.address_display_zn || row.address_full_zh) ||
            row.address_full_en ||
            '',
        )
      }
      const phone =
        table === 'donors'
          ? normalizeHongKongPhoneNumber(String(row.phone || ''))
          : null
      if (table === 'donors' && row.phone && !phone) invalidPhones++
      const phones = phone ? [phone] : []
      const brands = []
      if (table === 'donors') {
        const curated =
          row.brand === 'independent'
            ? donorBrandIdentities.find(brand => brand.sourceName === row.name_en)
            : undefined
        const optionId = curated?.id ?? brandIds[String(row.brand)]
        if (!optionId) throw new Error('Unknown source brand')
        // "Independent" describes ownership, not a brand; retain the original code in provenance.
        if (curated || row.brand !== 'independent') {
          const translations = target
            .query('SELECT locale,value FROM propertyValueI18n WHERE propertyValueId=?')
            .all(optionId) as { locale: string; value: string }[]
          const brandNames = curated
            ? { en: curated.name, 'zh-hant': curated.name, 'zh-hans': curated.name }
            : row.brand === 'kayser'
              ? {
                  en: 'Maison Kayser',
                  'zh-hant': 'Maison Kayser',
                  'zh-hans': 'Maison Kayser',
                }
              : Object.fromEntries(
                  translations.map(value => [value.locale, value.value]),
                )
          if (!Object.keys(brandNames).length)
            throw new Error('Missing reviewed brand translations')
          brands.push({
            identifiers: {
              breadlineBrand: curated?.code ?? String(row.brand),
              hypePropertyValueId: optionId,
            },
            names: brandNames,
          })
        }
      }
      const local = LocalPlaceInputSchema.parse({
        state: 'unresolved',
        facts: {
          names,
          phoneNumber: phones,
          brands,
          location: { geometry, address: emptyFeatureAddress(addresses).source },
        },
      })
      const placeId = `blPlace_${id}`
      const revisionId = `blPlaceBaseline_${id}`
      if (target.query('SELECT id FROM place WHERE id=?').get(placeId))
        throw new Error('Unmapped Place ID collision')

      // Peninsula remains privately managed; inactive donors remain unavailable/unpublished.
      const requiresLocationReview = table === 'donors' && row.id === 171
      const published =
        table === 'dropoffs' ||
        (Boolean(row.active) && row.id !== 658 && !requiresLocationReview)
      statements.push(
        insert('feature', {
          id,
          ...scope,
          layerId,
          contributorId: authors[0].id,
          geometry,
          spatialIndex: createFeatureSpatialIndex(geometry),
          addressMeta: {
            address: { ...emptyFeatureAddress(addresses), coordinates },
            breadlineSource: { table, id: sourceId },
            ...(correction ? { coordinateCorrection: correction.evidence } : {}),
          },
          isPublished: published ? 1 : 0,
          publisherId: published ? authors[0].id : null,
          publishedAt: published ? new Date().toISOString() : null,
          isArchived: 0,
          isPendingReview: requiresLocationReview ? 1 : 0,
          isDraft: 0,
          isIntangible: 0,
          isVisitable: table === 'donors' ? Number(row.active) : 1,
          createdAt: row.created_at,
          modifiedAt: row.last_updated_at || row.created_at,
        }),
      )
      for (const locale of ['en', 'zh-hant', 'zh-hans']) {
        // Source has Traditional Chinese only; preserve it as the documented Chinese fallback.
        const english = locale === 'en'
        statements.push(
          insert('featureI18n', {
            featureId: id,
            locale,
            title: (english ? row.name_en : row.name_zh) || row.name_en,
            titleGen: 0,
            description: null,
            descriptionGen: 0,
            displayAddress:
              (english
                ? row.address_display_en || row.address_full_en
                : row.address_display_zn || row.address_full_zh) || row.address_full_en,
            displayAddressGen: 0,
            addressProperties: {},
          }),
        )
      }
      // The universal property is the materialized phone array; brands inherit from Place.
      statements.push(
        insert('featureProperty', {
          featureId: id,
          propertyId: 'gPropPhNum01',
          propertyValueId: null,
          value: JSON.stringify(local.facts.phoneNumber),
        }),
      )
      const payload = {
        kind: 'breadline-place-import',
        version: 2,
        sourceTable: table,
        sourceId,
        sourceHash: hash,
        source: row,
        policyVersion: donorImportPolicy.version,
        coordinateCorrection: correction ?? null,
        invalidPhone: table === 'donors' && Boolean(row.phone) && !phone,
      }
      statements.push(
        insert('place', {
          id: placeId,
          state: 'unresolved',
          ownerProjectId: scope.projectId,
        }),
      )
      statements.push(
        insert('placeRevision', {
          id: revisionId,
          placeId,
          sequence: 1,
          origin: 'local',
          contentHash: createHash('sha256')
            .update(JSON.stringify({ payload, facts: local.facts }))
            .digest('hex'),
          payload,
          facts: local.facts,
        }),
      )
      statements.push(
        insert('featurePlace', {
          featureId: id,
          placeId,
          factsRevisionId: revisionId,
          locationRevisionId: revisionId,
          overrides: {},
          revision: `breadline-import:${table}:${sourceId}:${hash}`,
          actorId: authors[0].id,
        }),
      )
      statements.push(
        insert('breadlineImportFeature', {
          sourceTable: table,
          sourceId,
          featureId: id,
          sourceHash: hash,
        }),
      )
      if (table === 'donors')
        applyReview(sourceId, id, hash, coordinates, JSON.stringify(geometry))
      created++
    }
  }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, statements.join('\n') + '\n', { mode: 0o600 })
  writeFileSync(
    output + '.receipt.json',
    JSON.stringify(
      {
        version: 2,
        created,
        createdPlaces: created,
        matched,
        invalidPhones,
        coordinateCorrections: corrected,
        policyVersion: donorImportPolicy.version,
        excludedDonors,
        reviewedMtr,
        unmappedReviewedExits,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      created,
      matched,
      invalidPhones,
      coordinateCorrections: corrected,
      excludedDonors: excludedDonors.length,
      excludedAlreadyImported: excludedDonors.filter(row => row.alreadyImported).length,
      reviewedMtr,
      unmappedReviewedExits,
      output,
    }),
  )
  source.close()
  target.close()
}
if (import.meta.main) planBreadlineFeatures(process.argv.slice(2))
