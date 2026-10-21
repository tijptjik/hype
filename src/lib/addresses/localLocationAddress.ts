// Shared, versioned SaanSeoi content contract. Publication identity remains outside authored content.
export {
  ADDRESS_GRANULARITIES,
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
