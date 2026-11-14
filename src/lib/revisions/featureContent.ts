// TRANSLATION METADATA
import {
  AutomaticTranslationsSchema,
  TranslationProvenanceSchema,
} from '#lib/i18n/automaticSchema.js'
import {
  FeatureNameTemplateSchema,
  FeatureKindSchema,
  TargetContextSchema,
  AssociationRelationSchema,
} from '#lib/features/locationPolicy.js'
// IMAGE INTENTS
import { ImageIntentIdSchema } from '#lib/images/intents.js'
// VALIDATION
import { z } from 'zod'
// DOMAIN
import { LocationBrandsSchema } from '#lib/locations/factsDetails.js'
import { validateRevisionGallery } from './gallery'
// TYPES
import type { RevisionMergePolicy, RevisionValue } from './merge'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. VERSIONED CONTENT CONTRACT
// 2. VALIDATION AND MERGE BOUNDARIES
// - validateFeatureRevisionContent
// 3. TRANSLATION CANDIDATES
// - applyFeatureTranslationPatch
// ---

/********************
 *  1. VERSIONED CONTENT CONTRACT
 ************/
// +++ Versioned Content Contract

const id = z
  .string()
  .min(1)
  .refine(
    value => value === value.trim(),
    'Identifiers cannot contain surrounding whitespace',
  )
const jsonObject = z.record(z.string(), z.json())
const textValue = z.strictObject({
  translationProvenance: TranslationProvenanceSchema.optional(),
  value: z.string().nullable(),
  generated: z.boolean().nullable(),
})
const translation = z.strictObject({
  translationProvenance: TranslationProvenanceSchema.optional(),
  // Optional preserves immutable pre-migration hashes; title.value remains authored base text.
  nameOverride: z.string().nullable().optional(),
  title: z.strictObject({ value: z.string(), generated: z.boolean() }),
  description: z.strictObject({ value: z.string().nullable(), generated: z.boolean() }),
  address: z.strictObject({
    value: z.string().nullable(),
    generated: z.boolean(),
    properties: jsonObject.nullable(),
  }),
})
// Detached Features retain the same complete brand values as their former Location.
const brands = LocationBrandsSchema

// Geometry remains a complete value; validation does not silently normalize legacy coordinates.
const position = z
  .array(z.number().finite())
  .min(2)
  .refine(
    value => value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90,
    'GeoJSON positions require valid longitude/latitude',
  )
const ring = z
  .array(position)
  .min(4)
  .refine(
    value =>
      value[0].length === value[value.length - 1].length &&
      value[0].every(
        (coordinate, index) => coordinate === value[value.length - 1][index],
      ),
    'Polygon rings must close at the initial position',
  )
const bbox = z
  .union([
    z.tuple([z.number(), z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  ])
  .optional()
const geometries = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Point'), coordinates: position, bbox }),
  z.strictObject({
    type: z.literal('MultiPoint'),
    coordinates: z.array(position),
    bbox,
  }),
  z.strictObject({
    type: z.literal('LineString'),
    coordinates: z.array(position).min(2),
    bbox,
  }),
  z.strictObject({
    type: z.literal('MultiLineString'),
    coordinates: z.array(z.array(position).min(2)),
    bbox,
  }),
  z.strictObject({ type: z.literal('Polygon'), coordinates: z.array(ring), bbox }),
  z.strictObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ring)),
    bbox,
  }),
])

type ContentGeometry =
  | z.infer<typeof geometries>
  | {
      type: 'GeometryCollection'
      geometries: ContentGeometry[]
      bbox?:
        | [number, number, number, number]
        | [number, number, number, number, number, number]
    }
/** Retains valid GeoJSON structure, including collection/bounds metadata, without coercion. */
export const FeatureRevisionGeometrySchema: z.ZodType<ContentGeometry> = z.lazy(() =>
  z.union([
    geometries,
    z.strictObject({
      type: z.literal('GeometryCollection'),
      geometries: z.array(FeatureRevisionGeometrySchema),
      bbox,
    }),
  ]),
)

const location = z.strictObject({
  locationId: id,
  associationVersion: id,
  factsRevisionId: id,
  locationRevisionId: id,
  acceptedOverrides: jsonObject,
  factsOrganisationRevision: id.nullable(),
  locationOrganisationRevision: id.nullable(),
  occupancyRevisionId: id.nullable(),
  addressRevisionId: id.nullable(),
  membershipRevisionIds: z.array(id),
  placementOverrides: jsonObject,
  acceptedGeometry: FeatureRevisionGeometrySchema.nullable(),
  acceptancePolicy: jsonObject.nullable(),
  acceptanceProposalId: id.nullable(),
  memberships: z.array(
    z.strictObject({
      containerLocationId: id,
      role: z.enum(['building', 'premises']),
      bindingVersion: id,
      occupancyRevisionId: id.nullable(),
      membershipRevisionId: id.nullable(),
    }),
  ),
})

const definition = z.strictObject({
  key: z.string(),
  type: z.string(),
  component: z.string(),
  dataType: z.string(),
  dateResolution: z.string(),
  timeMaxHour: z.number().int(),
  cardinality: z.string(),
  presentation: z.string(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  audience: z.enum(['public', 'internal']),
  isTranslatable: z.boolean(),
  labels: z.record(id, z.strictObject({ value: z.string(), generated: z.boolean() })),
  selectedOption: z
    .strictObject({
      id,
      value: z.string().nullable(),
      translations: z.record(
        id,
        z.strictObject({ value: z.string(), generated: z.boolean() }),
      ),
    })
    .nullable(),
})

const property = z.strictObject({
  // Storage and its historical interpretation move together; context never grants permissions.
  selection: z
    .strictObject({
      propertyValueId: id.nullable(),
      value: z.string().nullable(),
      // Keep exact structured storage, including JSON null, distinct from SQL NULL.
      valueJson: z.string().nullable(),
      definition,
    })
    .superRefine((selection, ctx) => {
      // Legacy classifier forms stored an unused empty scalar beside the selected ID.
      // Preserve that evidence exactly; a non-empty competing scalar is still invalid.
      const scalar =
        selection.propertyValueId !== null && selection.value === ''
          ? null
          : selection.value
      if (
        [selection.propertyValueId, scalar, selection.valueJson].filter(
          value => value !== null,
        ).length > 1
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Property storage modes are mutually exclusive',
        })
      if (
        selection.propertyValueId !== (selection.definition.selectedOption?.id ?? null)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Selected option context must match the stored selection',
        })
      if (selection.valueJson !== null) {
        try {
          z.json().parse(JSON.parse(selection.valueJson))
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Structured property storage is not valid JSON',
          })
        }
      }
    }),
  translations: z.record(id, textValue),
})

const galleryEntry = z.strictObject({
  imageRevisionId: id,
  intent: ImageIntentIdSchema,
  // Publication derived from the effective intent policy; retained in historical snapshots.
  isPublished: z.boolean(),
  caption: z.record(id, z.string()),
  alt: z.record(id, z.string()),
})

/**
 * Strict authored Feature aggregate. Identity, roles, workflow and derived fields are absent.
 * @remarks Private server snapshots can contain internal properties and private gallery entries.
 * Never expose this schema as an unrestricted remote input or contributor response. Location
 * references and image ownership require authoritative checks in the publishing transaction.
 */
export const FeatureRevisionContentSchema = z
  .strictObject({
    format: z.literal('feature-content/v1'),
    profile: z.strictObject({
      // Optional preserves existing immutable content hashes.
      featureType: z.string().nullable().optional(),
      nameTemplate: FeatureNameTemplateSchema.extend({
        // Retained historical inputs only; new writes store these on translations.
        baseNames: z.record(z.string(), z.string()).optional(),
        overrides: z.record(z.string(), z.string()).optional(),
      }).nullish(),
      kind: FeatureKindSchema.nullish(),
      targetContext: TargetContextSchema.nullish(),
      associationRelation: AssociationRelationSchema.nullish(),

      isIntangible: z.boolean(),
      visitability: z.strictObject({
        isVisitable: z.boolean(),
        asOf: z.string().nullable(),
      }),
    }),
    placement: z.strictObject({
      geometry: FeatureRevisionGeometrySchema,
      addressMeta: jsonObject.nullable(),
      location: location.nullable(),
    }),
    detachedBrands: brands.nullable(),
    translations: z.record(id, translation),
    properties: z.record(id, property),
    gallery: z.strictObject({
      entries: z.record(id, galleryEntry),
      order: z.array(id),
      // Omission preserves historical hashes and means automatic intent ordering.
      sortMode: z.enum(['automatic', 'manual']).optional(),
    }),
  })
  .superRefine((content, ctx) => {
    for (const message of validateRevisionGallery(content.gallery))
      ctx.addIssue({ code: 'custom', path: ['gallery'], message })
    if (content.placement.location && content.detachedBrands !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['detachedBrands'],
        message: 'Linked Features cannot also own detached brands',
      })
    const accepted = content.placement.location
    if (accepted) {
      if (
        new Set(accepted.membershipRevisionIds).size !==
        accepted.membershipRevisionIds.length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['placement', 'location'],
          message: 'Duplicate accepted membership references',
        })
      const keys = accepted.memberships.map(member =>
        JSON.stringify([member.containerLocationId, member.role]),
      )
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: 'custom',
          path: ['placement', 'location'],
          message: 'Duplicate accepted container bindings',
        })
    }
  })

export type FeatureRevisionContent = z.infer<typeof FeatureRevisionContentSchema>

// ---
/********************
 *  2. VALIDATION AND MERGE BOUNDARIES
 ************/
// +++ Validation And Merge Boundaries

/** Immutable format-specific merge boundaries; callers cannot supply a client policy. */
export const FEATURE_CONTENT_MERGE_POLICY: RevisionMergePolicy = {
  isAtomic: path =>
    (path.length === 1 && ['placement', 'detachedBrands'].includes(path[0])) ||
    (path.length === 2 && path[0] === 'profile' && path[1] === 'visitability') ||
    (path.length === 3 && path[0] === 'translations') ||
    (path.length === 3 && path[0] === 'properties' && path[2] === 'selection') ||
    (path.length === 4 && path[0] === 'properties' && path[2] === 'translations'),
}

/**
 * Validates the merged authored aggregate without accepting control fields or unknown versions.
 * @param value Server-built candidate or merged revision content.
 * @returns Structural errors; database ownership, availability and authority checks remain required.
 */
export function validateFeatureRevisionContent(value: RevisionValue): string[] {
  const result = FeatureRevisionContentSchema.safeParse(value)
  return result.success
    ? []
    : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
}

// ---
/********************
 *  3. TRANSLATION CANDIDATES
 ************/
// +++ Translation Candidates

export const FeatureTranslationPatchSchema = z.strictObject({
  translations: z.record(
    id,
    z.strictObject({
      title: z.string().optional(),
      description: z.string().nullable().optional(),
    }),
  ),
})
export type FeatureTranslationPatch = z.infer<typeof FeatureTranslationPatchSchema>

/**
 * Applies only permitted text edits to an isolated immutable-base copy.
 * @param base Authorized server-loaded Feature content, never client-supplied snapshot data.
 * @param patch Requested text changes; unknown fields are rejected rather than stripped.
 * @param permission Current server-resolved locales and field groups permitted for this contributor.
 * @returns Complete candidate content, preserving omitted/hidden values and all shared references.
 * @remarks This function neither writes nor publishes. Inherited Location titles need separate
 * Location correction review. Editing title text and its generated/manual flag is one operation.
 */
export function applyFeatureTranslationPatch(
  base: FeatureRevisionContent,
  patch: FeatureTranslationPatch,
  permission: {
    locales: readonly string[]
    fields: readonly ('title' | 'description')[]
  },
): FeatureRevisionContent {
  const content = FeatureRevisionContentSchema.parse(base)
  const changes = FeatureTranslationPatchSchema.parse(patch)
  for (const [locale, edits] of Object.entries(changes.translations)) {
    if (!permission.locales.includes(locale))
      throw new Error('Translation locale is not permitted')
    if (!Object.hasOwn(content.translations, locale))
      throw new Error(
        'New translation locales require an explicit complete locale proposal',
      )
    for (const field of ['title', 'description'] as const) {
      if (edits[field] === undefined) continue
      if (!permission.fields.includes(field))
        throw new Error('Translation field is not permitted')
      if (
        field === 'title' &&
        content.placement.location &&
        content.placement.location.acceptancePolicy?.nameMode !== 'independent'
      )
        throw new Error('Inherited names require separate Location correction review')
      if (field === 'title' && edits.title !== undefined)
        content.translations[locale].title = { value: edits.title, generated: false }
      else if (field === 'description' && edits.description !== undefined)
        content.translations[locale].description = {
          value: edits.description,
          generated: false,
        }
    }
  }
  return FeatureRevisionContentSchema.parse(content)
}
