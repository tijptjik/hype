// DRIZZLE
import { and, eq, or } from 'drizzle-orm'
// SCHEMA
import { feature, featureI18n, featureProperty } from '../schema/feature'
import { hub } from '../schema/hub'
import { property, propertyValueI18n } from '../schema/property'
// DOMAIN
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { PlaceFactsSchema } from '#lib/places/validation.js'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// TYPES
import type { Database, LocaleKey } from '#lib/types.js'
import type { EffectivePlaceFacts } from '#lib/places/resolve.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

export type PersistedPlaceBaseline = {
  featureId: string
  projectId: string
  modifiedAt: string
  effective: EffectivePlaceFacts
  address: FeatureAddress
  legacyPropertyIds: string[]
}
export type PlaceBaselineResult =
  | { status: 'ready'; baseline: PersistedPlaceBaseline }
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
 * Read persisted Feature facts for initial Place association without changing any rows.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Persisted project scope from authorization.
 * @returns Complete preservation baseline or an explicit exclusion/review reason.
 * @remarks Legacy brand option identities remain local identifiers, never inferred
 * SaanSeoi brands. Full address corrections remain separate from immutable source
 * evidence. The association write must guard the returned Feature modifiedAt.
 */
export async function readFeaturePlaceBaseline(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<PlaceBaselineResult> {
  const row = await db
    .select({
      id: feature.id,
      projectId: feature.projectId,
      modifiedAt: feature.modifiedAt,
      geometry: feature.geometry,
      addressMeta: feature.addressMeta,
      isDraft: feature.isDraft,
      isIntangible: feature.isIntangible,
    })
    .from(feature)
    .where(and(eq(feature.id, featureId), eq(feature.projectId, projectId)))
    .get()
  if (!row) return { status: 'ineligible', reason: 'not-found' }
  if (row.isDraft) return { status: 'ineligible', reason: 'draft' }
  if (row.isIntangible) return { status: 'ineligible', reason: 'intangible' }
  if (row.geometry.type !== 'Point')
    return { status: 'ineligible', reason: 'non-point' }
  const translations = await db
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
    const locale = ADDRESS_LOCALES[translation.locale as LocaleKey]
    if (!locale) continue
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
  for (const locale of Object.keys(ADDRESS_LOCALES) as LocaleKey[]) {
    const tag = ADDRESS_LOCALES[locale]
    if (Object.hasOwn(labels, tag) || Object.hasOwn(address.overrides, tag))
      fallbackDisplay[tag] = Object.hasOwn(address.overrides, tag)
        ? getAddressDisplay(address, locale)
        : labels[tag]
  }
  const properties = await db
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
  const phones = properties.filter(item => item.key === 'phoneNumber')
  if (phones.some(item => item.scope !== 'hub' || item.hubCode !== 'core'))
    return { status: 'review', reason: 'ambiguous-properties' }
  const brands = properties.filter(item => item.key === 'brand')
  if (phones.length > 1 || brands.length > 1)
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
  const projectedBrands: NonNullable<EffectivePlaceFacts['brands']> = []
  for (const brand of brands) {
    if (!brand.propertyValueId || brand.value !== null)
      return { status: 'review', reason: 'invalid-brand' }
    const values = await db
      .select({ locale: propertyValueI18n.locale, value: propertyValueI18n.value })
      .from(propertyValueI18n)
      .where(eq(propertyValueI18n.propertyValueId, brand.propertyValueId))
    const brandNames: Record<string, string> = {}
    for (const value of values) {
      const locale = ADDRESS_LOCALES[value.locale as LocaleKey]
      if (locale) brandNames[locale] = value.value
    }
    projectedBrands.push({
      identifiers: { hypePropertyValueId: brand.propertyValueId },
      names: brandNames,
    })
  }
  const facts = PlaceFactsSchema.safeParse({
    names,
    phoneNumber,
    brands: projectedBrands,
    location: {
      geometry: row.geometry,
      address: { ...address.source, fallbackDisplay },
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
