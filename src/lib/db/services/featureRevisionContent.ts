// VALIDATION
import { z } from 'zod'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// TYPES
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. SOURCE VALIDATION
// - parseFeatureRevisionSource
// - indexRows
// - translations
// 2. BASELINE CONTENT
// - buildFeatureRevisionBaselineContent
// ---

/********************
 *  1. SOURCE VALIDATION
 ************/
// +++ Source Validation

const row = z.record(z.string(), z.json())
const sourceSchema = z.strictObject({
  record: row,
  translations: z.array(row),
  properties: z.array(row),
  propertyTranslations: z.array(row),
  location: z.array(row).max(1),
  locationMemberships: z.array(row),
  galleryLinks: z.array(row),
  images: z.array(row),
  fieldDefinitions: z.array(row),
  fieldTranslations: z.array(row),
  fieldOptions: z.array(row),
  fieldOptionTranslations: z.array(row),
})
type Row = z.infer<typeof row>

/**
 * Validates private source evidence before mapping or preparing projection checks.
 * @param snapshot Server-captured source value, never a client payload.
 * @returns Parsed parent and relation arrays; this does not authorize access.
 */
export function parseFeatureRevisionSource(
  snapshot: RevisionValue,
): z.infer<typeof sourceSchema> {
  return sourceSchema.parse(snapshot)
}

/**
 * Indexes retained source rows without silently collapsing duplicate identities.
 * @param rows Persisted source rows from one aggregate.
 * @param key Stable identity column.
 * @returns Own-property dictionary; throws for missing or duplicate keys.
 */
function indexRows(rows: Row[], key: string): Record<string, Row> {
  const indexed: Record<string, Row> = Object.create(null)
  for (const row of rows) {
    const value = row[key]
    if (typeof value !== 'string' || !value.trim() || Object.hasOwn(indexed, value))
      throw new Error(`Invalid or duplicate source ${key}`)
    indexed[value] = row
  }
  return indexed
}

/**
 * Retains a complete locale map and its generated/manual flags.
 * @param rows Persisted locale rows for exactly one owner.
 * @param value Text column name.
 * @param generated Verification column name.
 * @returns Plain JSON locale dictionary suitable for strict content validation.
 */
function translations(rows: Row[], value: string, generated: string): RevisionValue {
  return Object.fromEntries(
    Object.entries(indexRows(rows, 'locale')).map(([locale, row]) => [
      locale,
      { value: row[value], generated: row[generated] },
    ]),
  )
}

// ---
/********************
 *  2. BASELINE CONTENT
 ************/
// +++ Baseline Content

/**
 * Converts captured application data into a strict initial Feature content revision.
 * @param snapshot Private result of readFeatureRevisionSource, fenced at enrollment.
 * @param media Explicit verified same-image revision pins and existing presentation order.
 * @returns Complete content with controls/derived fields excluded and all owned values retained.
 * @remarks This builds an initial baseline only, never a later recapture/restore operation.
 * Empty legacy captions are explicit. Missing media pins fail rather than dropping images,
 * hashing unknown bytes or selecting a latest revision. The enrollment transaction must
 * check source equality, image ownership and asset availability. Publication status is
 * decided separately from this content using current live controls and workflow authority.
 */
export function buildFeatureRevisionBaselineContent(
  snapshot: RevisionValue,
  media: { revisions: Readonly<Record<string, string>>; order: readonly string[] },
): FeatureRevisionContent {
  const source = parseFeatureRevisionSource(snapshot)
  const featureId = source.record.id
  if (typeof featureId !== 'string' || !featureId.trim())
    throw new Error('Feature source identity is missing')
  for (const group of [
    source.translations,
    source.properties,
    source.propertyTranslations,
    source.location,
    source.locationMemberships,
    source.galleryLinks,
  ]) {
    if (group.some(row => row.featureId !== featureId))
      throw new Error('Source rows belong to another Feature')
  }
  const definitions = indexRows(source.fieldDefinitions, 'id')
  const options = indexRows(source.fieldOptions, 'id')
  const values = indexRows(source.properties, 'propertyId')
  const links = indexRows(source.galleryLinks, 'imageId')
  const images = indexRows(source.images, 'id')
  if (
    source.propertyTranslations.some(
      row =>
        typeof row.propertyId !== 'string' || !Object.hasOwn(values, row.propertyId),
    )
  )
    throw new Error('Orphaned Feature property translations')
  if (
    Object.keys(media.revisions).length !== Object.keys(links).length ||
    Object.keys(links).some(
      id =>
        !Object.hasOwn(media.revisions, id) ||
        !media.revisions[id]?.trim() ||
        !Object.hasOwn(images, id),
    )
  )
    throw new Error('Every gallery image needs an explicit verified revision pin')

  // Build selected-value context without granting authority from historical definition flags.
  const properties = Object.fromEntries(
    Object.entries(values).map(([id, value]) => {
      if (!Object.hasOwn(definitions, id))
        throw new Error('Feature property definition is missing')
      const definition = definitions[id]
      const selectedId = value.propertyValueId
      const selected =
        typeof selectedId === 'string' && Object.hasOwn(options, selectedId)
          ? options[selectedId]
          : null
      if (selectedId !== null && (!selected || selected.propertyId !== id))
        throw new Error('Selected option belongs to another field or is missing')
      if (value.valueJson !== null && typeof value.valueJson !== 'string')
        throw new Error('Structured property storage must be JSON text')
      return [
        id,
        {
          selection: {
            propertyValueId: selectedId,
            value: value.value,
            valueJson: value.valueJson,
            definition: {
              key: definition.key,
              type: definition.type,
              component: definition.component,
              dataType: definition.dataType,
              dateResolution: definition.dateResolution,
              timeMaxHour: definition.timeMaxHour,
              cardinality: definition.cardinality,
              presentation: definition.presentation,
              min: definition.min,
              max: definition.max,
              audience: definition.audience,
              isTranslatable: definition.isTranslatable,
              labels: translations(
                source.fieldTranslations.filter(row => row.propertyId === id),
                'label',
                'labelGen',
              ),
              selectedOption: selected
                ? {
                    id: selected.id,
                    value: selected.value,
                    translations: translations(
                      source.fieldOptionTranslations.filter(
                        row => row.propertyValueId === selected.id,
                      ),
                      'value',
                      'valueGen',
                    ),
                  }
                : null,
            },
          },
          translations: translations(
            source.propertyTranslations.filter(row => row.propertyId === id),
            'value',
            'valueGen',
          ),
        },
      ]
    }),
  )
  const accepted = source.location[0]
  if (!accepted && source.locationMemberships.length)
    throw new Error('Detached Feature has accepted container bindings')
  const detached = source.record.localLocationBrands
  if (detached !== null && (typeof detached !== 'object' || Array.isArray(detached)))
    throw new Error('Invalid detached brand source')

  // Only owned content crosses the boundary; no row spreading can leak control columns.
  return FeatureRevisionContentSchema.parse({
    format: 'feature-content/v1',
    profile: {
      ...(source.record.featureType ? { featureType: source.record.featureType } : {}),
      ...(source.record.nameTemplate
        ? { nameTemplate: source.record.nameTemplate }
        : {}),
      ...(source.record.kind ? { kind: source.record.kind } : {}),
      ...(source.record.targetContext
        ? { targetContext: source.record.targetContext }
        : {}),
      ...(source.record.associationRelation
        ? { associationRelation: source.record.associationRelation }
        : {}),

      isIntangible: source.record.isIntangible,
      visitability: {
        isVisitable: source.record.isVisitable,
        asOf: source.record.visitableAsOf,
      },
    },
    placement: {
      geometry: source.record.geometry,
      addressMeta: source.record.addressMeta,
      location: accepted
        ? {
            locationId: accepted.locationId,
            associationVersion: accepted.version,
            factsRevisionId: accepted.factsRevisionId,
            locationRevisionId: accepted.locationRevisionId,
            acceptedOverrides: accepted.overrides,
            factsOrganisationRevision: accepted.factsOrganisationRevision,
            locationOrganisationRevision: accepted.locationOrganisationRevision,
            occupancyRevisionId: accepted.occupancyRevisionId,
            addressRevisionId: accepted.addressRevisionId,
            membershipRevisionIds: accepted.membershipRevisionIds,
            placementOverrides: accepted.placementOverrides,
            acceptedGeometry: accepted.acceptedGeometry,
            acceptancePolicy: accepted.acceptancePolicy,
            acceptanceProposalId: accepted.acceptanceProposalId,
            memberships: source.locationMemberships.map(row => ({
              containerLocationId: row.containerLocationId,
              role: row.role,
              bindingVersion: row.bindingVersion,
              occupancyRevisionId: row.occupancyRevisionId,
              membershipRevisionId: row.membershipRevisionId,
            })),
          }
        : null,
    },
    detachedBrands: detached?.brands ?? null,
    translations: Object.fromEntries(
      Object.entries(indexRows(source.translations, 'locale')).map(([locale, row]) => [
        locale,
        {
          title: { value: row.baseName ?? row.title, generated: row.titleGen },
          ...(row.nameOverride !== undefined ? { nameOverride: row.nameOverride } : {}),
          description: { value: row.description, generated: row.descriptionGen },
          address: {
            value: row.displayAddress,
            generated: row.displayAddressGen,
            properties: row.addressProperties,
          },
        },
      ]),
    ),
    properties,
    gallery: {
      entries: Object.fromEntries(
        Object.entries(links).map(([id, row]) => [
          id,
          {
            imageRevisionId: media.revisions[id],
            intent: row.intent,
            isPublished: row.localIsPublished ?? row.isPublished,
            caption: {},
            alt: {},
          },
        ]),
      ),
      order: [...media.order],
    },
  })
}
