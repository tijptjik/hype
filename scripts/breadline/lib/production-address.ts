// VALIDATION
import { z } from 'zod'
// TYPES
import type { FeatureAddress } from '../../../src/lib/addresses/featureAddress'

type ProductionFeatureAddress = Omit<FeatureAddress, 'source'> & {
  source: {
    status: 'unresolved'
    address2dId: null
    address3dId: null
    address3dUnitId: null
    addressSnapshotId: null
    records: Record<string, unknown>
    fallbackDisplay: Record<string, string>
  }
}

// Keep the deployed unresolved source contract independent of the newer reader.
const productionSource = z.strictObject({
  status: z.literal('unresolved'),
  address2dId: z.null(),
  address3dId: z.null(),
  address3dUnitId: z.null(),
  addressSnapshotId: z.null(),
  records: z.object({}).strict(),
  fallbackDisplay: z.record(z.string(), z.string()),
})

/** Rejects stale import plans that would restore incompatible address sources.
 * @param addressMeta Serialized Feature address metadata from a proposed row.
 * @returns Nothing when the imported source matches the deployed contract.
 * @remarks This guard is for the unresolved Breadline Place importer only.
 */
export function assertProductionFeatureAddress(addressMeta: string): void {
  const value = JSON.parse(addressMeta)
  if (!productionSource.safeParse(value?.address?.source).success)
    throw new Error(
      'Feature address is incompatible with deployed production; regenerate the import plan',
    )
}

/** Projects an unresolved imported address into the deployed Place-era contract.
 * @param address Newer Location address produced by the import parser.
 * @returns A production-compatible envelope retaining the complete original source.
 * @remarks Only the explicit legacy-Place import path uses this adapter. Resolved
 * identities must go through a reviewed migration rather than being reinterpreted.
 */
export function toProductionFeatureAddress(
  address: FeatureAddress,
): ProductionFeatureAddress {
  const source = address.source
  if (
    source.status !== 'unresolved' ||
    source.address2dId ||
    source.address3dId ||
    source.address3dUnitId ||
    source.snapshotId ||
    Object.keys(source.rawSource).length
  )
    throw new Error(
      'Production import requires an unresolved address without source identity',
    )
  if (address.legacy?.breadlineLocationAddressSource)
    throw new Error('Original import address source is already retained')

  // Preserve authored structure outside the older reader's strict source object.
  return {
    ...address,
    source: {
      status: source.status,
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      addressSnapshotId: null,
      records: {},
      fallbackDisplay: source.fallbackDisplay,
    },
    legacy: { ...address.legacy, breadlineLocationAddressSource: source },
  }
}
