// VALIDATION
import { z } from 'zod'
import { PlaceFactsSchema } from './validation'
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'

/** Local baselines cannot claim unverified canonical Address identities. */
export const LocalPlaceInputSchema = z.strictObject({
  state: z.enum(['manual', 'unresolved']),
  facts: PlaceFactsSchema.superRefine((facts, context) => {
    if (!Object.values(facts.names).some(name => name.trim().length > 0)) {
      context.addIssue({
        code: 'custom',
        path: ['names'],
        message: 'A Place name is required',
      })
    }
    const address = facts.location.address
    if (
      address.status !== 'unresolved' ||
      address.address2dId ||
      address.address3dId ||
      address.address3dUnitId ||
      address.addressSnapshotId ||
      Object.keys(address.records).length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['location', 'address'],
        message:
          'Local address evidence must remain unresolved until a canonical address is verified',
      })
    }
    for (const [index, number] of facts.phoneNumber.entries()) {
      if (!normalizeHongKongPhoneNumber(number))
        context.addIssue({
          code: 'custom',
          path: ['phoneNumber', index],
          message: 'Invalid Hong Kong phone number',
        })
    }
  }).transform(facts => ({
    ...facts,
    phoneNumber: facts.phoneNumber.map(number => {
      const normalized = normalizeHongKongPhoneNumber(number)
      if (!normalized) throw new Error('Invalid Hong Kong phone number')
      return normalized
    }),
  })),
})
export type LocalPlaceInput = z.infer<typeof LocalPlaceInputSchema>
