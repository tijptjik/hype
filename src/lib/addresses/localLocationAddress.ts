// VALIDATION
import { AddressContentSchema } from '@saanseoi/address/content'
import { z } from 'zod'

// Shared, versioned SaanSeoi content contract. Publication identity remains outside authored content.
export {
  ADDRESS_SCOPES,
  // Preserve existing form consumers while rollout tooling uses the current shared contract.
  ADDRESS_SCOPES as ADDRESS_GRANULARITIES,
  ADDRESS_BLOCK_TYPES,
  ADDRESS_UNIT_TYPES,
  ADDRESS_FLOOR_TYPES,
  LocalAddressI18nSchema,
  LocalAddressUnitSchema,
  LocalAddressUnitI18nSchema,
  AddressContentSchema as LocalLocationAddressSchema,
  createAddressContent as createLocalLocationAddress,
} from '@saanseoi/address/content'
export type { AddressContent as LocalLocationAddress } from '@saanseoi/address/content'

// Store the proposal accepted by the author, including the exact labels used for matching.
const parseLabels = z.record(z.string().min(1).max(35), z.string().max(4000))
export const LocalAddressParseReviewSchema = z.strictObject({
  content: AddressContentSchema,
  source: parseLabels,
  parserVersion: z.string().min(1).max(100),
  unresolved: parseLabels,
  diagnostics: z.array(z.string().max(4000)),
})
