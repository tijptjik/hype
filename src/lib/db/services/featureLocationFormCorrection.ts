// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { addressSourceCoordinates } from '#lib/addresses/sourceCoordinates.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { prepareRevisionCheck } from './revisionBatch'
import { readLocationResetSources } from './locationReset'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { readPhoneNumbers } from '#lib/utils/phone-property.js'
// SERVICES
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
  sharedLocationFacts,
  type PreparedSharedCorrection,
} from './locationShared'
import type { SharedCorrectionPatch } from '#lib/locations/sharedCorrection.js'
import {
  prepareOrganisationLocationWrite,
  readOrganisationLocation,
} from './organisationLocation'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { LocationReset } from '#lib/locations/reset.js'
import {
  LocationProfileEditSchema,
  type LocationProfileEdit,
} from '#lib/locations/profileEdit.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'

/** Route direct staff form changes by field ownership and prepare one atomic history write.
 * @param db Database. @param input Server-owned ancestry, accepted content and authorized form candidate.
 * @returns Guarded correction writes and a comparison containing only separately authorized differences.
 * @remarks The normal Feature validator still checks all remaining fields; no client can grant itself Organisation correction authority.
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
    names?: Record<string, string>
    fieldModes?: Partial<
      Record<
        'names' | 'phoneNumber' | 'websites' | 'socials' | 'brands' | 'location',
        'community' | 'internal'
      >
    >
    authorizeCommunity?: () => Promise<{ canEdit: boolean; superAdmin: boolean }>
    /** Server-resolved default; internal identities never contribute to community curations. */
    defaultFieldMode?: 'community' | 'internal'
    nameMode?: 'inherit' | 'independent'
    profileEdit?: LocationProfileEdit
    brandEdit?: LocationBrandEdit
    authorizeOrganisation?: () => Promise<void>
  },
): Promise<{
  queries: BatchItem<'sqlite'>[]
  comparison: FeatureRevisionContent
  authorized: boolean
  preparedSharedCorrections?: PreparedSharedCorrection[]
}> {
  const association = input.content.placement.location
  const comparison = structuredClone(input.previous)
  const queries: BatchItem<'sqlite'>[] = []
  const preparedSharedCorrections: PreparedSharedCorrection[] = []
  if (!association) {
    if (input.profileEdit) throw new Error('LOCATION_REQUIRED')
    return { queries, comparison, authorized: false }
  }
  const original = input.previous.placement.location
  if (!original) throw new Error('LOCATION_CHANGED')
  if (
    (input.reset && input.reset.expectedRevision !== original.associationVersion) ||
    (input.brandEdit &&
      input.brandEdit.expectedRevision !== original.associationVersion)
  )
    throw new Error('LOCATION_CHANGED')
  const profileEdit = input.profileEdit
    ? LocationProfileEditSchema.parse(input.profileEdit)
    : undefined
  if (profileEdit && profileEdit.expectedRevision !== original.associationVersion)
    throw new Error('LOCATION_CHANGED')
  let overrides = FeatureLocationOverridesSchema.parse(association.acceptedOverrides)
  const beforeOverrides = structuredClone(overrides)
  let organisationChanged = false,
    authorized = false
  // Feature-owned geometry and lifecycle flags are not writes to either shared or Organisation facts.
  comparison.placement = structuredClone(input.content.placement)
  comparison.profile.isIntangible = input.content.profile.isIntangible
  // Only the universal phone property creates a linked Location override; WhatsApp and custom phone controls remain Feature-owned.
  for (const id of new Set([
    ...Object.keys(input.previous.properties),
    ...Object.keys(input.content.properties),
  ])) {
    const previous = input.previous.properties[id]
    const after = input.content.properties[id]
    if (
      previous?.selection.definition.key !== 'phoneNumber' &&
      after?.selection.definition.key !== 'phoneNumber'
    )
      continue
    if (
      equalRevisionValue(previous ?? null, after ?? null) &&
      !input.reset?.phoneNumber
    )
      continue
    // Explicit Feature edits retain Organisation overrides; the per-field mode below controls community contribution.
    // The Organisation write below retains its concurrency fence and atomic Feature history.
    const phones = input.reset?.phoneNumber
      ? []
      : readPhoneNumbers(after?.selection.value ?? '')
    if (!phones) throw new Error('INVALID_PHONE_NUMBER')
    overrides.phoneNumber = input.reset?.phoneNumber
      ? { mode: 'inherit' }
      : { mode: 'override', value: phones }
    organisationChanged = true
    if (after && !input.reset?.phoneNumber)
      after.selection.value = JSON.stringify(phones)
    if (after) comparison.properties[id] = structuredClone(after)
    else delete comparison.properties[id]
    authorized = true
  }
  const nameModeChanged =
    input.nameMode &&
    input.nameMode !== (original.acceptancePolicy?.nameMode ?? 'inherit')
  // Changing inheritance requires Organisation authority and uses pinned Location evidence.
  if (nameModeChanged && input.nameMode) {
    if (!input.authorizeOrganisation)
      throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
    await input.authorizeOrganisation()
    association.acceptancePolicy = {
      ...association.acceptancePolicy,
      nameMode: input.nameMode,
    }
    if (input.nameMode === 'inherit') {
      const project = await db.get<{ projectId: string }>(
        sql`SELECT projectId FROM feature WHERE id=${input.featureId}`,
      )
      if (!project) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
      const sources = await readLocationResetSources(db, {
        locationId: association.locationId,
        projectId: project.projectId,
        factsRevisionId: association.factsRevisionId,
        locationRevisionId: association.locationRevisionId,
        acceptancePolicy: association.acceptancePolicy,
        preparedSharedCorrections,
      })
      if (!sources) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
      const effective = resolveFeatureLocation(
        sources.facts,
        sources.locationFacts.location,
        overrides,
      )
      for (const [locale, row] of Object.entries(input.content.translations)) {
        const name =
          Object.entries(effective.names).find(
            ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
          )?.[1] ?? ''
        row.title = { value: name, generated: false }
        if (input.content.profile.nameTemplate?.baseNames) {
          input.content.profile.nameTemplate.baseNames[locale] = name
        }
        if (comparison.translations[locale])
          comparison.translations[locale].title = structuredClone(row.title)
      }
    }
    authorized = true
  }
  if (!nameModeChanged && original.acceptancePolicy?.nameMode !== 'independent') {
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
  if (input.names) {
    overrides.names ??= {}
    for (const [locale, value] of Object.entries(input.names)) {
      overrides.names[locale] = { mode: 'override', value }
      if (association.acceptancePolicy?.nameMode !== 'independent') {
        const key = Object.keys(input.content.translations).find(
          key => canonicalContentTag(key) === canonicalContentTag(locale),
        )
        if (key) {
          input.content.translations[key].title = { value, generated: false }
          if (comparison.translations[key])
            comparison.translations[key].title = { value, generated: false }
          if (input.content.profile.nameTemplate?.baseNames)
            input.content.profile.nameTemplate.baseNames[key] = value
        }
      }
    }
    organisationChanged = true
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
      // Address-only edits retain the pinned Location point when no provider address point exists.
      if (!address.data.coordinates) {
        const project = await db.get<{ projectId: string }>(
          sql`SELECT projectId FROM feature WHERE id=${input.featureId}`,
        )
        if (!project) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
        const sources = await readLocationResetSources(db, {
          locationId: association.locationId,
          projectId: project.projectId,
          factsRevisionId: association.factsRevisionId,
          locationRevisionId: association.locationRevisionId,
          acceptancePolicy: association.acceptancePolicy,
          preparedSharedCorrections,
        })
        if (!sources) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
        const effective = resolveFeatureLocation(
          sources.facts,
          sources.locationFacts.location,
          overrides,
        )
        address.data.coordinates = effective.location?.geometry.coordinates ?? null
      }
      overrides.location = {
        mode: 'override',
        value: localIdentityFromAddress('address', {}, address.data, 'shared').facts
          .location,
      }
      organisationChanged = true
    }
  }
  // Direct profile contacts do not depend on a configured Feature property.
  for (const field of ['phoneNumber', 'websites', 'socials'] as const) {
    const value = profileEdit?.values[field]
    if (value === undefined) continue
    Object.assign(overrides, { [field]: { mode: 'override', value } })
    organisationChanged = true
    if (field === 'phoneNumber') {
      for (const [id, property] of Object.entries(input.content.properties)) {
        if (property.selection.definition.key !== 'phoneNumber') continue
        property.selection.value = JSON.stringify(value)
        comparison.properties[id] = structuredClone(property)
      }
    }
  }
  if (
    profileEdit?.values.accessibility &&
    overrides.accessibility?.mode !== 'inherit' &&
    overrides.accessibility
  ) {
    overrides.accessibility = { mode: 'inherit' }
    organisationChanged = true
  }
  if (input.brandEdit) {
    overrides.brands = input.brandEdit.choice
    organisationChanged = true
  }
  if (input.reset?.names.length || input.reset?.location || input.reset?.phoneNumber) {
    overrides.names ??= {}
    for (const locale of input.reset.names)
      overrides.names[locale] = { mode: 'inherit' }
    if (input.reset.location) overrides.location = { mode: 'inherit' }
    if (input.reset.phoneNumber) overrides.phoneNumber = { mode: 'inherit' }
    organisationChanged = true
  }
  const modes = {
    ...((original.acceptancePolicy?.fieldEditModes as Record<string, string>) ?? {}),
    ...input.fieldModes,
  }
  if (input.fieldModes) {
    if (!input.authorizeOrganisation)
      throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
    await input.authorizeOrganisation()
    association.acceptancePolicy = {
      ...association.acceptancePolicy,
      fieldEditModes: modes,
    }
    authorized = true
  }
  // Community-mode edits retain the same override and contribute only changed fields, never reset-to-inherit.
  // Mobility answers are community facts, with no Organisation-owned parallel copy.
  const patch: SharedCorrectionPatch = profileEdit?.values.accessibility
    ? { accessibility: { mode: 'override', value: profileEdit.values.accessibility } }
    : {}
  for (const field of [
    'names',
    'phoneNumber',
    'websites',
    'socials',
    'brands',
    'location',
  ] as const) {
    const choice = overrides[field]
    if (equalLocationValue(beforeOverrides[field] ?? null, choice ?? null)) continue
    const mode = modes[field] ?? input.defaultFieldMode ?? 'internal'
    if (mode !== 'community' || !choice) continue
    if (field === 'names') {
      const names = Object.fromEntries(
        Object.entries(overrides.names ?? {})
          .filter(
            ([locale, choice]) =>
              choice.mode === 'override' &&
              !equalRevisionValue(beforeOverrides.names?.[locale] ?? null, choice),
          )
          .map(([locale, choice]) => [
            locale,
            choice.mode === 'override' ? choice.value : '',
          ]),
      )
      if (Object.keys(names).length) patch.names = { mode: 'override', value: names }
    } else if ('mode' in choice && choice.mode !== 'inherit') {
      Object.assign(patch, { [field]: choice })
    }
  }
  if (Object.keys(patch).length) {
    if (!input.authorizeCommunity) throw new Error('SHARED_LOCATION_EDIT_FORBIDDEN')
    const rights = await input.authorizeCommunity()
    const source = await db.get<{ id: string; facts: string }>(
      sql`SELECT r.id,r.facts FROM locationRevisionContent r JOIN location l ON l.id=r.locationId WHERE l.id=${association.locationId} AND l.state IN ('linked','unresolved') ORDER BY r.version DESC LIMIT 1`,
    )
    if (!source) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
    const head = await readSharedLocationCorrection(db, association.locationId)
    // A locale edit merges with community names, never publishes unrelated internal translations.
    if (patch.names?.mode === 'override') {
      const community = await sharedLocationFacts(
        db,
        association.locationId,
        readLocationFacts(source.facts),
        head?.id ?? null,
      )
      patch.names.value = {
        ...community.facts.names,
        ...(patch.names.value as Record<string, string>),
      }
    }
    const shared = await prepareSharedLocationCorrection(db, {
      locationId: association.locationId,
      sourceRevisionId: source.id,
      expectedRevision: head?.id ?? null,
      actorId: input.actorId,
      rights,
      guard: input.guard,
      patch,
      provenance: {
        kind: 'feature-community-edit',
        featureId: input.featureId,
        authorOrganisationId: input.organisationId,
      },
    })
    queries.push(...shared.queries)
    preparedSharedCorrections.push({
      id: shared.id,
      locationId: association.locationId,
      corrections: shared.corrections,
    })
    const priorPins = (association.acceptancePolicy?.factsSharedFields ?? []) as {
      field: string
      revision: string | null
    }[]
    const fields = Object.keys(patch).filter(field => field !== 'location')
    association.acceptancePolicy = {
      ...association.acceptancePolicy,
      factsSharedFields: [
        ...priorPins.filter(pin => !fields.includes(pin.field)),
        ...fields.map(field => ({ field, revision: shared.id })),
      ],
      ...(patch.location ? { locationSharedRevision: shared.id } : {}),
      lastSharedRevision: shared.id,
    }
  }
  if (organisationChanged) {
    if (!input.authorizeOrganisation)
      throw new Error('ORGANISATION_LOCATION_EDIT_FORBIDDEN')
    await input.authorizeOrganisation()
    // Merge only authored choices into the current Organisation head, preserving other Features' field edits.
    const current = await readOrganisationLocation(
      db,
      input.organisationId,
      association.locationId,
    )
    const merged = structuredClone(current?.overrides ?? beforeOverrides)
    for (const field of [
      'names',
      'phoneNumber',
      'websites',
      'socials',
      'brands',
      'location',
      'accessibility',
    ] as const) {
      if (equalLocationValue(beforeOverrides[field] ?? null, overrides[field] ?? null))
        continue
      if (field === 'names') {
        merged.names ??= {}
        for (const [locale, choice] of Object.entries(overrides.names ?? {})) {
          if (!equalLocationValue(beforeOverrides.names?.[locale] ?? null, choice))
            merged.names[locale] = choice
        }
      } else Object.assign(merged, { [field]: overrides[field] })
    }
    overrides = FeatureLocationOverridesSchema.parse(merged)
    queries.push(
      prepareRevisionCheck(
        db,
        current
          ? sql`(SELECT revision FROM organisationLocationHead WHERE organisationId=${input.organisationId} AND locationId=${association.locationId})=${current.revision}`
          : sql`NOT EXISTS(SELECT 1 FROM organisationLocationHead WHERE organisationId=${input.organisationId} AND locationId=${association.locationId})`,
      ),
    )
    const write = await prepareOrganisationLocationWrite(db, {
      organisationId: input.organisationId,
      locationId: association.locationId,
      actorId: input.actorId,
      overrides,
      guard: input.guard,
      provenance: { kind: 'feature-staff-edit', featureId: input.featureId },
    })
    queries.push(...write.queries, prepareRevisionCheck(db, write.guard))
    association.acceptedOverrides = overrides as typeof association.acceptedOverrides
    association.factsOrganisationRevision = write.revision
    association.locationOrganisationRevision = write.revision
    authorized = true
  }
  if (input.reset?.names.length || input.reset?.location || input.reset?.phoneNumber) {
    const project = await db.get<{ projectId: string }>(
      sql`SELECT projectId FROM feature WHERE id=${input.featureId}`,
    )
    if (!project) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
    const sources = await readLocationResetSources(db, {
      locationId: association.locationId,
      projectId: project.projectId,
      factsRevisionId: association.factsRevisionId,
      locationRevisionId: association.locationRevisionId,
      acceptancePolicy: association.acceptancePolicy,
      preparedSharedCorrections,
    })
    if (!sources) throw new Error('LOCATION_SOURCE_UNAVAILABLE')
    const effective = resolveFeatureLocation(
      sources.facts,
      sources.locationFacts.location,
      overrides,
    )
    // Reset materializes only accepted evidence; a newer community phone still follows adoption policy.
    if (input.reset.phoneNumber) {
      for (const [id, property] of Object.entries(input.content.properties)) {
        if (property.selection.definition.key !== 'phoneNumber') continue
        property.selection.value = JSON.stringify(effective.phoneNumber ?? [])
        comparison.properties[id] = structuredClone(property)
      }
    }
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
    preparedSharedCorrections,
    comparison,
    authorized:
      authorized ||
      addressChanged ||
      !equalRevisionValue(input.previous.placement, input.content.placement) ||
      input.previous.profile.isIntangible !== input.content.profile.isIntangible,
  }
}
