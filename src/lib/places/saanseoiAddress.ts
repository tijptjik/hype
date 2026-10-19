// VALIDATION
import { z } from 'zod'
// TYPES
import type { SaanSeoiPlaceProjection } from './saanseoi'

const identifier = z.string().min(1)
const coverageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.enum(['direct', 'ancestor']),
    ownerAddress2dId: identifier,
    address3dId: identifier,
    membership: z.enum(['established', 'unresolved']),
  }),
])
const addressSchema = z.object({
  type: z.literal('addresses'),
  id: identifier,
  attributes: z.object({
    snapshotId: identifier,
    address3dCoverage: coverageSchema,
    i18n: z.record(z.string(), z.object({ formattedAddress: z.string() })),
    sources: z.array(z.unknown()),
  }),
})
const unitsSchema = z.object({
  type: z.literal('address3d'),
  id: identifier,
  attributes: z.object({
    snapshotId: identifier,
    address2dId: identifier,
    units: z.array(z.object({ id: identifier })),
    i18n: z.record(z.string(), z.unknown()),
    sources: z.array(z.unknown()).nullable(),
  }),
})
const responseSchema = z.object({
  data: addressSchema,
  included: z.array(z.unknown()).optional(),
  meta: z.object({ apiReleaseSet: identifier }),
})

/**
 * Attach full structured Address records to an already pinned Place projection.
 * @param projection Place facts with exact canonical Address references.
 * @param response Full-profile Address detail response, including units when referenced.
 * @param pin Independently selected Address publication; its ID differs from the Place publication.
 * @returns A new projection with verified Address records and retained source evidence.
 * @remarks No network or database writes occur. Missing, mixed-snapshot or unresolved
 * unit coverage throws, leaving the caller's unresolved projection intact for retry/review.
 * Raw records retain SaanSeoi's schema, translations, membership and attribution.
 */
export function resolveSaanSeoiPlaceAddress(
  projection: SaanSeoiPlaceProjection,
  response: unknown,
  pin: { apiReleaseSet: string },
): SaanSeoiPlaceProjection {
  const reference = projection.facts.location.address
  const parsed = responseSchema.parse(response)
  if (
    !reference.address2dId ||
    !reference.addressSnapshotId ||
    parsed.meta.apiReleaseSet !== pin.apiReleaseSet ||
    parsed.data.id !== reference.address2dId ||
    parsed.data.attributes.snapshotId !== reference.addressSnapshotId
  ) {
    throw new Error(
      'Address publication or identity does not match the Place reference',
    )
  }

  // A unit is meaningful only in its exact inventory and verified owner membership.
  if (reference.address3dUnitId && !reference.address3dId)
    throw new Error('Address unit requires its canonical inventory')
  if (reference.address3dId) {
    const coverage = parsed.data.attributes.address3dCoverage
    if (
      coverage.kind === 'none' ||
      coverage.membership !== 'established' ||
      coverage.address3dId !== reference.address3dId ||
      (coverage.kind === 'direct' &&
        coverage.ownerAddress2dId !== reference.address2dId)
    ) {
      throw new Error('Address inventory membership is not established')
    }
    const candidates = (parsed.included ?? []).filter(value => {
      const resource = z.object({ type: z.string(), id: z.string() }).safeParse(value)
      return (
        resource.success &&
        resource.data.type === 'address3d' &&
        resource.data.id === reference.address3dId
      )
    })
    if (candidates.length !== 1)
      throw new Error('Expected exactly one referenced Address inventory')
    const inventory = unitsSchema.parse(candidates[0])
    if (
      inventory.attributes.snapshotId !== reference.addressSnapshotId ||
      inventory.attributes.address2dId !== coverage.ownerAddress2dId ||
      (reference.address3dUnitId &&
        inventory.attributes.units.filter(unit => unit.id === reference.address3dUnitId)
          .length !== 1)
    ) {
      throw new Error('Address inventory snapshot, owner or unit does not match')
    }
  }

  // Preserve the full response instead of translating structured Addresses into legacy fields.
  const evidence = structuredClone(z.record(z.string(), z.unknown()).parse(response))
  return {
    ...projection,
    facts: {
      ...projection.facts,
      location: {
        ...projection.facts.location,
        address: { ...reference, status: 'resolved', records: evidence },
      },
    },
    payload: { ...projection.payload, address: evidence },
    issues: projection.issues.filter(issue => issue.kind !== 'addressRecordsPending'),
  }
}
