// Compatibility types copied from old $lib/types import section on feat/data-import.
// Keep these local while the import feature is reviewed against the current schema.
import type {
  AddressMeta,
  AddressProperties,
  FieldComponentType,
  FieldDiscriminator,
  Id,
  Locale,
  LocaleKey,
  Resource,
} from '$lib/types'
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type {
  Image,
  ImageCtxEnvelope,
  ImageUploadCtx,
  Intent,
} from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type {
  Property,
  PropertyValue,
  PropertyValueI18nDB,
} from '$lib/db/zod/schema/property.types'

export type {
  AddressMeta,
  AddressProperties,
  Feature,
  FeatureFromCollection,
  FieldComponentType,
  FieldDiscriminator,
  Id,
  Image,
  ImageCtxEnvelope,
  ImageUploadCtx,
  Intent,
  Layer,
  Locale,
  LocaleKey,
  Organisation,
  Project,
  Property,
  PropertyValue,
  PropertyValueI18nDB,
  Resource,
}
export type FeaturePartial = Partial<Feature>
export type PropertyNew = Partial<Property>

export type BatchUploadResult = {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error' | 'conflict'
  savedImage?: ImageCtxEnvelope
  error?: string
  featureId?: string | null
  imageSequence?: string | null
  intendedIntent?: Intent
  uploadCtx?: ImageUploadCtx
  existingCanonicalImage?: ImageCtxEnvelope | null
  existingDuplicateImage?: ImageCtxEnvelope | null
}

export type LayerConstraint = {
  type: 'specific' | 'multiple' | 'all'
  layers: string[]
}

export type FeatureCSVColumn = {
  header: string
  sampleValues: string[]
  modelType:
    | 'Feature'
    | 'User'
    | 'Property'
    | 'Layer'
    | 'Address'
    | 'AddressMeta'
    | 'SKIP'
  locale?: Locale | 'None'
  propertyKey?: string
  extractedPropertyKey?: string
  propertyType?: FieldDiscriminator
  field?: string
  layerConstraint?: LayerConstraint
}

export type FeatureImportStep =
  | 'column-mapping'
  | 'user-matching'
  | 'layer-matching'
  | 'property-matching'
  | 'translation'
  | 'geo-lookup'
  | 'geo-code'
  | 'feature-resolution'
  | 'finished'

export type UserValidationResult = {
  value: string
  isValid: boolean
  userId?: string
  error?: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export type LayerValidationResult = {
  value: string
  isValid: boolean
  layerId?: string
  error?: string
  i18n?: unknown
}

export type ImageDropEvent = {
  acceptedFiles: File[]
  fileRejections: unknown[]
}

export type ParsedImageFilename = {
  featureId: string | null
  imageSequence: string | null
}

export type FeatureContext = {
  feature: FeatureFromCollection | Feature
  project: Project
  organisation: Organisation
  projectId: string
  organisationId: string
  existingCanonicalImage: ImageCtxEnvelope | null
  hasCanonicalImage: boolean
  existingImages: ImageCtxEnvelope[]
}
