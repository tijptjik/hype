import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'
import { SharedFieldPinsSchema } from '#lib/locations/sharedCorrection.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
import { sharedLocationFacts } from './locationShared'
// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
import { property, propertyI18n } from '../schema/property'
import { hub } from '../schema/hub'
// DOMAIN
import {
  locationActionReasons,
  type LocationHistoryAction,
} from '#lib/revisions/locationActions.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import { contentStorageTag } from '#lib/i18n/contentRecords.js'
// SERVICES
import {
  hasFeatureLifecycleStorage,
  prepareFeatureEdit,
  readCurrentFeatureRevision,
} from './featureLifecycle'
import {
  buildFeatureRevisionBaselineContent,
  parseFeatureRevisionSource,
} from './featureRevisionContent'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'

/** Pin and materialize an explicitly accepted shared correction in one Feature revision.
 * @param db Database. @param input Authorized Feature and immutable shared evidence.
 * @returns Atomic Feature projection/history statements, or null for a changed association.
 * @remarks Independent names, manual pins and accepted occupancy/address bindings remain independent. Visibility is preserved.
 */
export async function prepareSharedFeatureAdoption(
  db: Database,
  input: {
    featureId: string
    projectId: string
    actorId: string
    action: LocationHistoryAction
    locationId: string
    sharedRevisionId: string | null
    sourceRevisionId: string
    facts: LocationFacts
    guard: SQL
    includeLocation?: boolean
    /** True only when accepting the complete facts group from this source revision. */
    acceptSourceFacts?: boolean
    origin?: 'user' | 'system'
    fields?: string[]
    organisation?: {
      revision: string | null
      overrides: import('#lib/locations/model.js').FeatureLocationOverrides
    }
  },
) {
  if (!(await hasFeatureLifecycleStorage(db))) return null
  const current = await readCurrentFeatureRevision(db, {
    featureId: input.featureId,
    guard: input.guard,
  })
  if (!current || current.content.placement.location?.locationId !== input.locationId)
    return null
  const accepted = current.content.placement.location
  const address = FeatureAddressSchema.safeParse(
    current.content.placement.addressMeta?.address,
  )
  // A copied discovery address is not an independent pin once the Feature links to its Location.
  const includeLocation = Boolean(
    input.includeLocation &&
      !accepted.occupancyRevisionId &&
      !accepted.addressRevisionId &&
      (!address.success || address.data.association?.mode !== 'manual'),
  )
  const source = await db.get<{ facts: string }>(
    sql`SELECT facts FROM locationRevision WHERE id=${accepted.factsRevisionId} AND locationId=${input.locationId}`,
  )
  if (!source) return null
  const previousFacts = (
    await sharedLocationFacts(
      db,
      input.locationId,
      readLocationFacts(source.facts),
      typeof accepted.acceptancePolicy?.factsSharedRevision === 'string'
        ? accepted.acceptancePolicy.factsSharedRevision
        : null,
      accepted.acceptancePolicy?.factsSharedFields,
    )
  ).facts
  const facts = structuredClone(previousFacts)
  for (const field of input.fields ?? [
    'phoneNumber',
    'websites',
    'socials',
    'accessibility',
  ])
    Object.assign(facts, { [field]: input.facts[field as keyof LocationFacts] })

  if (input.fields?.includes('groupId')) facts.group = input.facts.group

  const changesPhone = !input.fields || input.fields.includes('phoneNumber')
  const phoneDefinitions = changesPhone
    ? await db
        .select({ definition: property })
        .from(property)
        .innerJoin(hub, eq(hub.id, property.hubId))
        .where(
          and(
            eq(property.key, 'phoneNumber'),
            eq(property.scope, 'hub'),
            eq(hub.code, 'core'),
          ),
        )
    : []
  if (changesPhone && phoneDefinitions.length !== 1)
    throw new Error('Universal phone property is unavailable or ambiguous')
  const phoneDefinition = phoneDefinitions[0]?.definition
  const phoneLabels = phoneDefinition
    ? await db
        .select()
        .from(propertyI18n)
        .where(eq(propertyI18n.propertyId, phoneDefinition.id))
    : []
  return prepareFeatureEdit(db, {
    featureId: input.featureId,
    actorId: input.actorId,
    guard: input.guard,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    origin: input.origin ?? 'user',
    reason: locationActionReasons[input.action],
    identity: { actorId: input.actorId },
    validate: () => [],
    // Community evidence may be inserted later in this atomic batch; render from the same accepted facts.
    templateLocation: content =>
      resolveFeatureLocation(
        facts,
        facts.location,
        FeatureLocationOverridesSchema.parse(
          content.placement.location?.acceptedOverrides ?? {},
        ),
      ),
    derive: (before, captured) => {
      const next = structuredClone(before)
      const association = next.placement.location
      if (!association) throw new Error('Feature Location changed')
      association.associationVersion = crypto.randomUUID()
      association.memberships = association.memberships.map(row => ({
        ...row,
        bindingVersion: association.associationVersion,
      }))
      const changedFields = (
        input.fields ?? ['phoneNumber', 'websites', 'socials', 'accessibility']
      ).filter(field => field !== 'location')
      const priorPins = SharedFieldPinsSchema.parse(
        association.acceptancePolicy?.factsSharedFields ?? [],
      )
      association.acceptancePolicy = {
        ...association.acceptancePolicy,
        lastSharedRevision: input.sharedRevisionId,
        factsSharedFields: [
          ...priorPins.filter(pin => !changedFields.includes(pin.field)),
          ...changedFields.map(field => ({ field, revision: input.sharedRevisionId })),
        ],
        ...(includeLocation ? { locationSharedRevision: input.sharedRevisionId } : {}),
      }
      if (input.acceptSourceFacts) {
        association.factsRevisionId = input.sourceRevisionId
        association.acceptancePolicy.factsSharedRevision = input.sharedRevisionId
        association.acceptancePolicy.factsSharedFields = []
      }
      if (includeLocation) association.locationRevisionId = input.sourceRevisionId
      if (input.organisation) {
        association.acceptedOverrides = input.organisation
          .overrides as typeof association.acceptedOverrides
        association.factsOrganisationRevision = input.organisation.revision
        association.locationOrganisationRevision = input.organisation.revision
      }
      const effective = resolveFeatureLocation(
        facts,
        facts.location,
        FeatureLocationOverridesSchema.parse(association.acceptedOverrides),
      )
      const source = parseFeatureRevisionSource(captured.snapshot)
      // Only phone data is projected through the universal Feature contact property.
      const phone = phoneDefinition
      if (phone && !source.fieldDefinitions.some(row => row.id === phone.id)) {
        source.fieldDefinitions.push(phone)
        source.fieldTranslations.push(...phoneLabels)
      }
      if (phone) {
        source.properties = source.properties.filter(row => row.propertyId !== phone.id)
        source.properties.push({
          featureId: input.featureId,
          propertyId: phone.id,
          propertyValueId: null,
          value: JSON.stringify(effective.phoneNumber ?? []),
          valueJson: null,
        })
        source.propertyTranslations = source.propertyTranslations.filter(
          row => row.propertyId !== phone.id,
        )
        const projected = buildFeatureRevisionBaselineContent(source, {
          revisions: Object.fromEntries(
            Object.entries(before.gallery.entries).map(([id, row]) => [
              id,
              row.imageRevisionId,
            ]),
          ),
          order: before.gallery.order,
        })
        next.properties[String(phone.id)] = projected.properties[String(phone.id)]
      }
      if (
        input.fields?.includes('names') &&
        association.acceptancePolicy.nameMode !== 'independent'
      ) {
        for (const [locale, name] of Object.entries(effective.names)) {
          const key = contentStorageTag(locale)
          if (next.translations[key])
            next.translations[key].title = { value: name ?? '', generated: false }
        }
      }
      // Staff corrections update linked placement; explicit manual and occupancy placements retain their evidence.
      if (includeLocation) {
        const projected = materializeEffectiveLocation({
          fieldGroup: 'location',
          inheritPlacement: true,
          facts,
          locationFacts: facts,
          overrides: association.acceptedOverrides,
          data: {
            geometry: source.record.geometry as never,
            addressMeta: source.record.addressMeta as never,
          },
          i18n: Object.fromEntries(
            source.translations.map(row => [String(row.locale), row]),
          ) as never,
        })
        next.placement.geometry = projected.data
          .geometry as typeof next.placement.geometry
        next.placement.addressMeta = projected.data
          .addressMeta as typeof next.placement.addressMeta
        association.acceptedGeometry = next.placement
          .geometry as typeof association.acceptedGeometry
        delete association.acceptancePolicy.locationMode
        for (const [locale, row] of Object.entries(projected.i18n)) {
          if (next.translations[locale])
            next.translations[locale].address = {
              value: row.displayAddress ?? '',
              generated: Boolean(row.displayAddressGen),
              properties: row.addressProperties ?? {},
            }
        }
      }
      return next
    },
  })
}
