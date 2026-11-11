import { SharedFieldPinsSchema } from '#lib/locations/sharedCorrection.js'
// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { addressSourceCoordinates } from '#lib/addresses/sourceCoordinates.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { readLocationResetSources } from './locationReset'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { readPhoneNumbers } from '#lib/utils/phone-property.js'
// SERVICES
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
import { prepareOrganisationLocationWrite } from './organisationLocation'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { LocationReset } from '#lib/locations/reset.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'

/** Route direct staff form changes by field ownership and prepare one atomic history write.
 * @param db Database. @param input Server-owned ancestry, accepted content and authorized form candidate.
 * @returns Guarded correction writes and a comparison containing only separately authorized differences.
 * @remarks The normal Feature validator still checks all remaining fields; no client can grant itself shared authority.
 */
export async function prepareFeatureLocationFormCorrection(
  db: Database,
  input: {
    featureId: string
    organisationId: string
    actorId: string
    guard: SQL
    previous: FeatureRevisionContent
    content: FeatureRevisionContent
    reset?: LocationReset
    brandEdit?: LocationBrandEdit
    authorizeShared?: () => Promise<{ canEdit: boolean; superAdmin: boolean }>
    authorizeOrganisation?: () => Promise<void>
  },
) {
  const association = input.content.placement.location
  const comparison = structuredClone(input.previous)
  const queries: BatchItem<'sqlite'>[] = []
  if (!association) return { queries, comparison, authorized: false }
  const original = input.previous.placement.location!
  if (
    (input.reset && input.reset.expectedRevision !== original.associationVersion) ||
    (input.brandEdit &&
      input.brandEdit.expectedRevision !== original.associationVersion)
  )
    throw new Error('LOCATION_CHANGED')
  const overrides = FeatureLocationOverridesSchema.parse(association.acceptedOverrides)
  let organisationChanged = false,
    authorized = false
  // Feature-owned geometry and lifecycle flags are not writes to either shared or Organisation facts.
  comparison.placement = structuredClone(input.content.placement)
  comparison.profile.isIntangible = input.content.profile.isIntangible
  for (const id of new Set([
    ...Object.keys(input.previous.properties),
    ...Object.keys(input.content.properties),
  ])) {
    const previous = input.previous.properties[id]
    const after = input.content.properties[id]
    if (
      (previous?.selection.definition.component ??
        after?.selection.definition.component) !== 'PhoneField'
    )
      continue
    if (
      equalRevisionValue(previous ?? null, after ?? null) &&
      !input.reset?.phoneNumber
    )
      continue
    if (!input.authorizeShared) throw new Error('SHARED_LOCATION_EDIT_FORBIDDEN')
    const rights = await input.authorizeShared()
    const source = await db.get<{ id: string }>(
      sql`SELECT id FROM locationRevision WHERE locationId=${association.locationId} ORDER BY version DESC LIMIT 1`,
    )
    if (!source) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
    const head = await readSharedLocationCorrection(db, association.locationId)
    if (
      (head?.id ?? null) !==
      (original.acceptancePolicy?.lastSharedRevision ??
        original.acceptancePolicy?.factsSharedRevision ??
        null)
    )
      throw new Error('SHARED_LOCATION_CHANGED')
    const phones = readPhoneNumbers(after?.selection.value ?? '')
    if (!phones) throw new Error('INVALID_PHONE_NUMBER')
    const shared = await prepareSharedLocationCorrection(db, {
      locationId: association.locationId,
      sourceRevisionId: source.id,
      expectedRevision: head?.id ?? null,
      actorId: input.actorId,
      rights,
      guard: input.guard,
      patch: {
        phoneNumber: input.reset?.phoneNumber
          ? { mode: 'inherit' }
          : { mode: 'override', value: phones },
      },
      provenance: { kind: 'feature-staff-edit', featureId: input.featureId },
    })
    queries.push(...shared.queries)
    const priorPins = SharedFieldPinsSchema.parse(
      association.acceptancePolicy?.factsSharedFields ?? [],
    )
    association.acceptancePolicy = {
      ...association.acceptancePolicy,
      lastSharedRevision: shared.id,
      factsSharedFields: [
        ...priorPins.filter(pin => pin.field !== 'phoneNumber'),
        { field: 'phoneNumber', revision: shared.id },
      ],
    }
    // An Organisation override remains authoritative; editing shared data never silently clears it.
    const effectivePhones =
      overrides.phoneNumber?.mode === 'override'
        ? overrides.phoneNumber.value
        : overrides.phoneNumber?.mode === 'clear'
          ? []
          : shared.facts.phoneNumber
    if (after) after.selection.value = JSON.stringify(effectivePhones)
    if (after) comparison.properties[id] = structuredClone(after)
    else delete comparison.properties[id]
    authorized = true
  }
  if (original.acceptancePolicy?.nameMode !== 'independent') {
    for (const [locale, row] of Object.entries(input.content.translations)) {
      const prior = input.previous.translations[locale]
      if (equalRevisionValue(prior?.title ?? null, row.title)) continue
      overrides.names ??= {}
      overrides.names[locale] = { mode: 'override', value: row.title.value ?? '' }
      organisationChanged = true
      if (comparison.translations[locale])
        comparison.translations[locale].title = structuredClone(row.title)
    }
  }
  // Address edits remain Feature-owned unless the editor explicitly resets Organisation inheritance.
  for (const [locale, row] of Object.entries(input.content.translations))
    if (comparison.translations[locale])
      comparison.translations[locale].address = structuredClone(row.address)
  // Display preference and marker projection belong to the Feature, not Organisation address evidence.
  const previousAddress = structuredClone(input.previous.placement.addressMeta)
  const nextAddress = structuredClone(input.content.placement.addressMeta)
  for (const metadata of [previousAddress, nextAddress]) {
    const address = metadata?.address
    if (address && typeof address === 'object' && !Array.isArray(address)) {
      delete address.locationDisplayMode
      delete address.markerCoordinates
    }
  }
  const addressChanged = !equalRevisionValue(previousAddress, nextAddress)
  if (addressChanged) {
    if (!input.authorizeOrganisation)
      throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
    await input.authorizeOrganisation()
    const address = FeatureAddressSchema.safeParse(
      input.content.placement.addressMeta?.address,
    )
    if (address.success && !address.data.association) {
      overrides.location = {
        mode: 'override',
        value: localIdentityFromAddress('address', {}, address.data, 'shared').facts
          .location,
      }
      organisationChanged = true
    }
  }
  if (input.brandEdit) {
    overrides.brands = input.brandEdit.choice
    organisationChanged = true
  }
  if (input.reset?.names.length || input.reset?.location) {
    overrides.names ??= {}
    for (const locale of input.reset.names)
      overrides.names[locale] = { mode: 'inherit' }
    if (input.reset.location) overrides.location = { mode: 'inherit' }
    organisationChanged = true
  }
  if (organisationChanged) {
    if (!input.authorizeOrganisation)
      throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
    await input.authorizeOrganisation()
    const write = await prepareOrganisationLocationWrite(db, {
      organisationId: input.organisationId,
      locationId: association.locationId,
      actorId: input.actorId,
      overrides,
      guard: input.guard,
      provenance: { kind: 'feature-staff-edit', featureId: input.featureId },
    })
    queries.push(...write.queries)
    association.acceptedOverrides = overrides as typeof association.acceptedOverrides
    association.factsOrganisationRevision = write.revision
    association.locationOrganisationRevision = write.revision
    authorized = true
  }
  if (input.reset?.names.length || input.reset?.location) {
    const sources = await readLocationResetSources(db, {
      locationId: association.locationId,
      projectId: (await db.get<{ projectId: string }>(
        sql`SELECT projectId FROM feature WHERE id=${input.featureId}`,
      ))!.projectId,
      factsRevisionId: association.factsRevisionId,
      locationRevisionId: association.locationRevisionId,
      acceptancePolicy: association.acceptancePolicy,
    })
    if (!sources) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
    const effective = resolveFeatureLocation(
      sources.facts,
      sources.locationFacts.location,
      overrides,
    )
    for (const locale of input.reset.names) {
      const row = input.content.translations[locale]
      if (row) row.title = { value: effective.names[locale] ?? '', generated: false }
      if (comparison.translations[locale] && row)
        comparison.translations[locale].title = structuredClone(row.title)
    }
    if (input.reset.location && effective.location) {
      input.content.placement.geometry = effective.location.geometry
      input.content.placement.addressMeta = {
        ...input.content.placement.addressMeta,
        address: FeatureAddressSchema.parse({
          version: 1,
          source: effective.location.address,
          coordinates: addressSourceCoordinates(effective.location.address),
          matchStatus: effective.location.address.status,
          overrides: {},
        }),
      } as typeof input.content.placement.addressMeta
      comparison.placement = structuredClone(input.content.placement)
    }
  }
  // Changed association evidence requires a fresh token and matching membership versions.
  if (!equalRevisionValue(original, association)) {
    association.associationVersion = crypto.randomUUID()
    for (const membership of association.memberships)
      membership.bindingVersion = association.associationVersion
  }
  comparison.placement.location = structuredClone(association)
  return {
    queries,
    comparison,
    authorized:
      authorized ||
      addressChanged ||
      !equalRevisionValue(input.previous.placement, input.content.placement) ||
      input.previous.profile.isIntangible !== input.content.profile.isIntangible,
  }
}
