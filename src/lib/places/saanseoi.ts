// VALIDATION
import { z } from 'zod'
import { PlaceFactsSchema } from './validation'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// TYPES
import type { PlaceFacts } from './model'

const identifier = z.string().min(1)
const optionalId = identifier.nullable()
const recordSchema = z.object({
  type: z.literal('places'),
  id: identifier,
  attributes: z.object({
    geometry: PlaceFactsSchema.shape.location.shape.geometry,
    snapshotId: identifier,
    resourceReleaseId: identifier,
    addressSnapshotId: optionalId,
    address2dId: optionalId,
    address3dId: optionalId,
    address3dUnitId: optionalId,
    phones: z.array(z.string()).nullable(),
    identifiers: z.object({ wikidata: z.object({ brandId: identifier }) }).nullable(),
    i18n: z.record(
      z.string(),
      z.object({
        name: z.string().nullable(),
        brandName: z.string().nullable(),
        freeformAddress: z.string().nullable().optional(),
      }),
    ),
  }),
})
const metaSchema = z.object({
  apiReleaseSet: identifier,
  resolvedApiVersion: identifier,
  schemaVersion: identifier,
})

export type SaanSeoiPlaceProjection = {
  ssId: string
  apiVersion: string
  releaseId: string
  snapshotId: string
  facts: PlaceFacts
  payload: Record<string, unknown>
  issues: Array<
    | { kind: 'invalidPhone'; index: number; value: string }
    | { kind: 'addressRecordsPending' }
  >
}

/**
 * Project one full-profile canonical collection record from a pinned publication.
 * @param resource Full JSON:API Place resource, retained unchanged as source evidence.
 * @param meta Collection metadata, including the publication and schema version.
 * @param pin Expected publication and Place snapshot from the sync checkpoint.
 * @returns Place facts plus explicit phone/address omissions and original source payload.
 * @remarks The legacy detail/search endpoints are latest-only. Use the collection's
 * releaseSet selector, profile=full and all supported locales for reproducible reads.
 * Address references remain unresolved until their pinned structured records are loaded.
 */
export function projectSaanSeoiPlace(
  resource: unknown,
  meta: unknown,
  pin: { apiReleaseSet: string; snapshotId: string },
): SaanSeoiPlaceProjection {
  const parsed = recordSchema.parse(resource)
  const publication = metaSchema.parse(meta)
  if (
    publication.apiReleaseSet !== pin.apiReleaseSet ||
    parsed.attributes.snapshotId !== pin.snapshotId
  ) {
    throw new Error('Place publication does not match the selected checkpoint')
  }
  const source = parsed.attributes
  const names: Record<string, string> = {}
  const brandNames: Record<string, string> = {}
  const fallbackDisplay: Record<string, string> = {}
  // Preserve each localized value; never choose an arbitrary locale as the identity.
  for (const [locale, translation] of Object.entries(source.i18n)) {
    if (translation.name !== null) names[locale] = translation.name
    if (translation.brandName !== null) brandNames[locale] = translation.brandName
    if (translation.freeformAddress != null)
      fallbackDisplay[locale] = translation.freeformAddress
  }
  const issues: SaanSeoiPlaceProjection['issues'] = []
  const phoneNumber: string[] = []
  for (const [index, value] of (source.phones ?? []).entries()) {
    const normalized = normalizeHongKongPhoneNumber(value)
    if (normalized) phoneNumber.push(normalized)
    else issues.push({ kind: 'invalidPhone', index, value })
  }
  const brandId = source.identifiers?.wikidata.brandId
  const brands =
    brandId || Object.keys(brandNames).length
      ? [{ identifiers: brandId ? { wikidata: brandId } : {}, names: brandNames }]
      : []
  if (source.address2dId || source.address3dId || source.address3dUnitId)
    issues.push({ kind: 'addressRecordsPending' })
  return {
    ssId: parsed.id,
    apiVersion: publication.resolvedApiVersion,
    releaseId: source.resourceReleaseId,
    snapshotId: source.snapshotId,
    facts: PlaceFactsSchema.parse({
      names,
      phoneNumber,
      brands,
      location: {
        geometry: source.geometry,
        address: {
          status: 'unresolved',
          address2dId: source.address2dId,
          address3dId: source.address3dId,
          address3dUnitId: source.address3dUnitId,
          addressSnapshotId: source.addressSnapshotId,
          records: {},
          fallbackDisplay,
        },
      },
    }),
    payload: {
      resource: z.record(z.string(), z.unknown()).parse(resource),
      meta: z.record(z.string(), z.unknown()).parse(meta),
    },
    issues,
  }
}
