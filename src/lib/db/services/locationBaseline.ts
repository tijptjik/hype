// DRIZZLE
import { and, eq, or } from 'drizzle-orm'
// SCHEMA
import { feature, featureI18n, featureProperty } from '../schema/feature'
import { hub } from '../schema/hub'
import { property, propertyValue, propertyValueI18n } from '../schema/property'
// DOMAIN
import { LocalAddressI18nSchema } from '#lib/addresses/localLocationAddress.js'
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// TYPES
import type { Database, LocaleKey } from '#lib/types.js'
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'
import type {
  FeatureDBPartial,
  FeatureI18nPartial,
  NewFeatureProperty,
} from '#lib/db/zod/schema/feature.types.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

export type FeatureLocationProposal = {
  data: Pick<FeatureDBPartial, 'geometry' | 'addressMeta' | 'isIntangible'>
  i18n: Record<string, FeatureI18nPartial>
  properties?: NewFeatureProperty[]
}

export type PersistedLocationBaseline = {
  featureId: string
  projectId: string
  modifiedAt: string
  effective: EffectiveLocationFacts
  address: FeatureAddress
  legacyPropertyIds: string[]
}
export type LocationBaselineResult =
  | { status: 'ready'; baseline: PersistedLocationBaseline }
  | { status: 'ineligible'; reason: 'not-found' | 'draft' | 'intangible' | 'non-point' }
  | {
      status: 'review'
      reason:
        | 'invalid-address'
        | 'invalid-phone'
        | 'ambiguous-properties'
        | 'invalid-brand'
    }

/**
 * Read persisted Feature facts for initial Location association without changing any rows.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Persisted project scope from authorization.
 * @param proposal Optional validated form projection; property definitions still come from the database.
 * @param associationContext Existing-link edits may retain intangible Feature interpretations.
 * @returns Complete preservation baseline or an explicit exclusion/review reason.
 * @remarks Legacy brand option identities remain local identifiers, never inferred
 * SaanSeoi brands. Full address corrections remain separate from immutable source
 * evidence. The association write must guard the returned Feature modifiedAt.
 */
export async function readFeatureLocationBaseline(
  db: Database,
  featureId: string,
  projectId: string,
  proposal?: FeatureLocationProposal,
  associationContext?: 'linked',
): Promise<LocationBaselineResult> {
  const stored = await db
    .select({
      id: feature.id,
      projectId: feature.projectId,
      modifiedAt: feature.modifiedAt,
      geometry: feature.geometry,
      addressMeta: feature.addressMeta,
      isDraft: feature.isDraft,
      isIntangible: feature.isIntangible,
      localLocationBrands: feature.localLocationBrands,
    })
    .from(feature)
    .where(and(eq(feature.id, featureId), eq(feature.projectId, projectId)))
    .get()
  if (!stored) return { status: 'ineligible', reason: 'not-found' }
  const row = {
    ...stored,
    geometry: proposal?.data.geometry ?? stored.geometry,
    addressMeta: proposal?.data.addressMeta ?? stored.addressMeta,
    isIntangible: proposal?.data.isIntangible ?? stored.isIntangible,
  }
  if (row.isDraft) return { status: 'ineligible', reason: 'draft' }
  if (row.isIntangible && associationContext !== 'linked')
    return { status: 'ineligible', reason: 'intangible' }
  if (row.geometry.type !== 'Point')
    return { status: 'ineligible', reason: 'non-point' }
  const translations = proposal
    ? Object.entries(proposal.i18n).map(([locale, value]) => ({
        locale,
        title: value.title ?? '',
        displayAddress: value.displayAddress ?? null,
      }))
    : await db
        .select({
          locale: featureI18n.locale,
          title: featureI18n.title,
          displayAddress: featureI18n.displayAddress,
        })
        .from(featureI18n)
        .where(eq(featureI18n.featureId, featureId))
  const names: Record<string, string> = {}
  const labels: Record<string, string> = {}
  for (const translation of translations) {
    const locale =
      ADDRESS_LOCALES[translation.locale as LocaleKey] ?? translation.locale
    names[locale] = translation.title
    if (translation.displayAddress !== null) labels[locale] = translation.displayAddress
  }
  const parsedAddress = FeatureAddressSchema.safeParse(
    row.addressMeta?.address ?? emptyFeatureAddress(labels),
  )
  if (!parsedAddress.success) return { status: 'review', reason: 'invalid-address' }
  const address = parsedAddress.data
  // Preserve effective labels while retaining the full structured correction envelope.
  const fallbackDisplay = { ...address.source.fallbackDisplay }
  const { displayOverrides: retainedDisplayOverrides, ...sourceEvidence } =
    address.source
  const displayOverrides = { ...retainedDisplayOverrides }
  // Preserve complete authored labels (including explicit clears) in every content locale.
  for (const [tag, corrections] of Object.entries(address.overrides)) {
    if (Object.hasOwn(corrections, 'formattedAddress')) {
      displayOverrides[tag] = String(corrections.formattedAddress ?? '')
    } else if (Object.keys(corrections).length) {
      delete displayOverrides[tag]
    }
  }
  for (const locale of Object.keys(ADDRESS_LOCALES) as LocaleKey[]) {
    const tag = ADDRESS_LOCALES[locale]
    if (
      Object.hasOwn(address.overrides, tag) ||
      (Object.hasOwn(labels, tag) &&
        (!address.source.authored ||
          labels[tag] !== getAddressDisplay(address, locale)))
    )
      fallbackDisplay[tag] = Object.hasOwn(address.overrides, tag)
        ? getAddressDisplay(address, locale)
        : labels[tag]
  }
  // Carry Feature corrections into its effective location without changing the shared Location revision.
  const authored = address.source.authored
    ? structuredClone(address.source.authored)
    : undefined
  if (authored) {
    for (const [tag, corrections] of Object.entries(address.overrides)) {
      const components = Object.fromEntries(
        Object.entries(corrections).filter(
          ([key]) => key !== 'formattedAddress' && key in LocalAddressI18nSchema.shape,
        ),
      )
      if (Object.keys(components).length)
        authored.i18n[tag] = LocalAddressI18nSchema.parse({
          ...authored.i18n[tag],
          formattedAddress: '',
          ...components,
        })
      if (
        authored.unit &&
        ('floorExpression' in corrections || 'unitExpression' in corrections)
      ) {
        authored.unitI18n[tag] = {
          floorExpression:
            (corrections.floorExpression as string) ??
            authored.unitI18n[tag]?.floorExpression ??
            authored.unit.floorRef,
          unitExpression:
            (corrections.unitExpression as string) ??
            authored.unitI18n[tag]?.unitExpression ??
            authored.unit.unitRef,
        }
      }
    }
    if (address.unitDetails) {
      authored.unit = {
        unitRef: '',
        unitType: 'U',
        floorRef: '',
        floorType: 'F',
        unitPortion: null,
        ...authored.unit,
        ...Object.fromEntries(
          Object.entries(address.unitDetails).filter(
            ([, value]) => value !== undefined && value !== null,
          ),
        ),
      }
      authored.unitI18n = {}
    }
  }
  let properties = await db
    .select({
      id: property.id,
      key: property.key,
      scope: property.scope,
      hubCode: hub.code,
      propertyValueId: featureProperty.propertyValueId,
      value: featureProperty.value,
    })
    .from(featureProperty)
    .innerJoin(property, eq(property.id, featureProperty.propertyId))
    .leftJoin(hub, eq(hub.id, property.hubId))
    .where(
      and(
        eq(featureProperty.featureId, featureId),
        or(eq(property.key, 'phoneNumber'), eq(property.key, 'brand')),
      ),
    )
  if (proposal?.properties !== undefined) {
    // Resolve submitted property identities from the catalog, never client-hydrated metadata.
    const definitions = await db
      .select({
        id: property.id,
        key: property.key,
        scope: property.scope,
        hubCode: hub.code,
      })
      .from(property)
      .leftJoin(hub, eq(hub.id, property.hubId))
      .where(or(eq(property.key, 'phoneNumber'), eq(property.key, 'brand')))
    const byId = new Map(definitions.map(definition => [definition.id, definition]))
    properties = proposal.properties.flatMap(value => {
      const definition = byId.get(value.propertyId)
      return definition
        ? [
            {
              ...definition,
              propertyValueId: value.propertyValueId || null,
              value: value.value ?? null,
            },
          ]
        : []
    })
  }
  const phones = properties.filter(item => item.key === 'phoneNumber')
  if (phones.some(item => item.scope !== 'hub' || item.hubCode !== 'core'))
    return { status: 'review', reason: 'ambiguous-properties' }
  const brands = properties.filter(item => item.key === 'brand')
  const detached = stored.localLocationBrands
  if (phones.length > 1 || (!detached && brands.length > 1))
    return { status: 'review', reason: 'ambiguous-properties' }
  const phoneNumber: string[] = []
  for (const phone of phones) {
    if (phone.propertyValueId) return { status: 'review', reason: 'invalid-phone' }
    if (phone.value === null || phone.value === '') continue
    let values: unknown = phone.value
    if (phone.value.trim().startsWith('[')) {
      try {
        values = JSON.parse(phone.value)
      } catch {
        return { status: 'review', reason: 'invalid-phone' }
      }
    } else values = [phone.value]
    if (
      !Array.isArray(values) ||
      values.some(
        value => typeof value !== 'string' || !normalizeHongKongPhoneNumber(value),
      )
    )
      return { status: 'review', reason: 'invalid-phone' }
    // Preserve existing spelling; normalizing here would silently change the initial baseline.
    phoneNumber.push(...(values as string[]))
  }
  const projectedBrands: NonNullable<EffectiveLocationFacts['brands']> = []
  for (const brand of detached ? [] : brands) {
    // Forms carry empty catalog fields even when no legacy classifier is assigned.
    if (!brand.propertyValueId && (brand.value === null || brand.value === '')) continue
    if (!brand.propertyValueId || brand.value !== null)
      return { status: 'review', reason: 'invalid-brand' }
    const option = await db
      .select({ id: propertyValue.id })
      .from(propertyValue)
      .where(
        and(
          eq(propertyValue.id, brand.propertyValueId),
          eq(propertyValue.propertyId, brand.id),
        ),
      )
      .get()
    if (!option) return { status: 'review', reason: 'invalid-brand' }
    const values = await db
      .select({ locale: propertyValueI18n.locale, value: propertyValueI18n.value })
      .from(propertyValueI18n)
      .where(eq(propertyValueI18n.propertyValueId, brand.propertyValueId))
    const brandNames: Record<string, string> = {}
    for (const value of values) {
      const locale = ADDRESS_LOCALES[value.locale as LocaleKey] ?? value.locale
      brandNames[locale] = value.value
    }
    projectedBrands.push({
      identifiers: { hypePropertyValueId: brand.propertyValueId },
      names: brandNames,
    })
  }
  const facts = LocationFactsSchema.safeParse({
    names,
    phoneNumber,
    brands: detached?.brands ?? projectedBrands,
    location: {
      geometry: row.geometry,
      address: {
        ...sourceEvidence,
        fallbackDisplay,
        ...(Object.keys(displayOverrides).length ? { displayOverrides } : {}),
        ...(authored ? { authored } : {}),
      },
    },
  })
  if (!facts.success) return { status: 'review', reason: 'invalid-address' }
  return {
    status: 'ready',
    baseline: {
      featureId,
      projectId,
      modifiedAt: row.modifiedAt,
      effective: facts.data,
      address,
      legacyPropertyIds: properties.map(item => item.id),
    },
  }
}
