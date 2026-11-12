import { readFeatureIntentPolicy } from '#lib/db/services/featureIntentPolicy.js'
import { requireFeatureType } from '#lib/features/intents.js'
// SVELTEKIT
import { error } from '@sveltejs/kit'
import {
  historicalFeatureVisibility,
  historicalSourceLayerId,
} from '#lib/db/services/historicalLayers.js'
// DRIZZLE
import { and, or, eq, sql, type SQL } from 'drizzle-orm'
// ADDRESS
import { projectFeatureAddress } from '#lib/addresses/featureAddress.js'
// API
import { applyQueryFilters, removeExcludedColumns } from '#lib/api/index.js'
import { toBooleanOrUndefined } from '#lib/api/services/index.js'
import { isRelevantHubAdmin } from '#lib/api/services/authz/index.js'
// DB
import { hasFeatureLifecycleStorage } from '#lib/db/services/featureLifecycle.js'
import {
  createFeatureTask,
  saveFeatureTaskDraft,
  type ContributionDraftTask,
} from '#lib/db/services/taskContribution.js'
import {
  featureRevisionCreationEnabled,
  prepareFeatureCreationContent,
} from '#lib/db/services/featureCreationRevision.js'
import { saveFeatureCreationTaskDraft } from '#lib/db/services/featureLifecycleCreationTask.js'
import {
  createFeatureForm,
  saveUnlinkedFeatureForm,
} from '#lib/db/services/featureFormSave.js'
import { validateFeaturePhoneProperties } from '#lib/db/services/feature-property-validation.js'
import { applyPrismConstraints } from '#lib/db/index.js'
import { propertyLocalesToForm } from '#lib/properties/locales.js'
import { applyTriStateBooleanCondition } from '#lib/db/query.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
import { toImageEnvelope, toNormalizedImageRecord } from '#lib/db/services/image.js'
import { userColumnsWithPrivacyProtected } from '#lib/db/services/user.js'
import {
  mergeFeatureProperties,
  probeFeatureForUpdate,
} from '#lib/db/services/feature.js'
import { probeLayerForUpdate } from '#lib/db/services/layer.js'
// I18N
import { supportedLocaleKeys } from '#lib/i18n.js'
import {
  adaptContentMap,
  canonicalContentTag,
  contentFormKey,
  contentRowsToForm,
} from '#lib/i18n/contentRecords.js'
// SCHEMA
import { feature } from '#lib/db/schema/index.js'
import {
  FeatureCompactProfileAPI,
  FeatureAdminProfileAPI,
  FeatureCardProfileAPI,
  FeatureDraftEntityFormData,
  FeatureDetailProfileAPI,
  FeatureEntityFormData,
  FeatureListProfileAPI,
} from '#lib/db/zod/schema/feature.js'
// ENUMS
import { HierarchicalResource, ImageContextResource } from '#lib/enums.js'
// CLIENT
// TYPES
import type { TaskDB, TaskNew } from '#lib/db/zod/schema/task.types.js'
import type {
  Database,
  EntityResponse,
  ListResponse,
  LocaleKey,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '#lib/types.js'
import type { ImageDB } from '#lib/db/zod/schema/image.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type {
  Feature,
  FeatureAdminDBRaw,
  FeatureDB,
  FeatureNew,
  FeatureEntityByProfile,
  FeatureListByProfile,
  FeatureProfile,
  FeatureQueryRowByProfile,
  UserContributedFeature,
} from '#lib/db/zod/schema/feature.types.js'

const requiredLocaleKeys = supportedLocaleKeys

type DraftFeatureLocaleOutput = FeatureNew['i18n'][LocaleKey]
type DraftPropertyLocaleInput = { value?: string; valueGen?: boolean }

type PreparedUserContributedFeatureDraft = {
  validatedFeature: FeatureNew
  layerScope: NonNullable<Awaited<ReturnType<typeof probeLayerForUpdate>>>
}

type UserContributedFeatureDraftStage = 'draft' | 'final'

/**
 * Checks whether a locale bucket contains any meaningful user-provided content.
 * @param entry Candidate locale entry.
 * @returns Whether the locale entry has at least one non-empty field.
 */
function hasMeaningfulLocaleContent(
  entry: Record<string, unknown> | null | undefined,
): boolean {
  if (!entry) return false

  return Object.entries(entry).some(([key, value]) => {
    if (key === 'locale') return false
    if (typeof value === 'string') return value.trim().length > 0
    return value !== null && value !== undefined
  })
}

/**
 * Returns a trimmed string value or an empty string.
 * @param value Candidate string value.
 * @returns Trimmed string when present.
 */
function toTrimmedString(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

const stripFeaturePropertyI18n = <T extends { properties?: unknown }>(input: T): T => ({
  ...input,
  properties: Array.isArray(input.properties)
    ? input.properties.map(property =>
        property && typeof property === 'object'
          ? {
              ...property,
              i18n: null,
            }
          : property,
      )
    : input.properties,
})

function parseFeatureProfileWithFallback<T>(
  schema: {
    parse: (input: unknown) => T
    safeParse: (input: unknown) => { success: boolean }
  },
  input: unknown,
  profile: FeatureProfile,
): T {
  const parsed = schema.safeParse(input)
  if (parsed.success) {
    return schema.parse(input)
  }

  console.warn('Feature profile parse fallback applied', {
    profile,
  })

  return schema.parse(stripFeaturePropertyI18n(input as { properties?: unknown }))
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - featureListRelations
// - featureDetailRelations
// - featureAdminRelations
// - getFeatureWithRelations
//
// PROFILE SHAPING
// - toFeatureImageEnvelope
// - toPropertyShape
// - toResponseShape
// - toFeatureProfile
// - toEntityResponseShape
// - toListResponseShape
//
// NORMALIZATION
// - toComparableFeatureProperties
//
// QUERY CONTEXT
// - toLookupConditions
// - toRequestedListState
// - toFeaturePrisms
// - toQueryConditions
//
// FEATURE CREATION WITH ENRICHMENT
// - createUserContributedFeature
// - createUserContributedFeatureTask
// - prepareUserContributedFeatureCreation
// - updateUserContributedFeatureTaskDraft
// - prepareUserContributedFeatureDraftUpdate

/********************
 *  DB RELATIONS
 ************/

const featureListRelations = {
  divisionMemberships: { columns: { divisionId: true, selected: true } },
  i18n: true,
  properties: {
    with: {
      i18n: true,
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true,
            },
          },
        },
      },
      propertyValue: {
        with: {
          i18n: true,
        },
      },
    },
  },
  images: {
    with: {
      image: {
        with: {
          contributor: true,
        },
      },
    },
  },
} as const

const featureDetailRelations = {
  ...featureListRelations,
  layer: {
    with: {
      properties: {
        with: {
          property: {
            with: {
              i18n: true,
              values: {
                with: {
                  i18n: true,
                },
              },
            },
          },
        },
      },
    },
  },
  contributor: {
    columns: userColumnsWithPrivacyProtected,
  },
  publisher: {
    columns: userColumnsWithPrivacyProtected,
  },
}

const featureAdminRelations = featureDetailRelations

type FeatureRelationsByProfile<P extends FeatureProfile> = P extends 'admin'
  ? typeof featureAdminRelations
  : P extends 'card' | 'detail'
    ? typeof featureDetailRelations
    : typeof featureListRelations

export const getFeatureWithRelations = <P extends FeatureProfile>(
  profile: P,
): FeatureRelationsByProfile<P> => {
  if (profile === 'compact') return { i18n: true } as FeatureRelationsByProfile<P>
  if (profile === 'admin') {
    return featureAdminRelations as FeatureRelationsByProfile<P>
  }
  if (profile === 'card' || profile === 'detail' || profile === 'full') {
    return featureDetailRelations as FeatureRelationsByProfile<P>
  }
  return featureListRelations as FeatureRelationsByProfile<P>
}

/********************
 *  PROFILE SHAPING
 ************/

const featureProfiles = [
  'compact',
  'default',
  'map',
  'full',
  'admin',
  'list',
  'card',
  'detail',
] as const

type FeatureImageRelation = {
  featureId?: string
  intent?: string | null
  isPublished?: boolean | null
  publishedAt?: string | null
  image?: ImageDB | null
}

type FeatureResponseRow = FeatureAdminDBRaw & {
  locationNames?: string | Record<string, string> | null
  imageCount?: number
  imagePublishedCount?: number
  layer?: Layer | null
}

const toFeatureImageEnvelope = (
  images: FeatureImageRelation[] | null | undefined,
  featureId: string,
  profile: 'list' | 'detail' | 'admin',
  options: { filterUnpublished?: boolean; includeAll?: boolean } = {},
) => {
  const imageRows = Array.isArray(images) ? images : []
  const visibleRows = options.filterUnpublished
    ? imageRows.filter(imageRow => imageRow.isPublished)
    : imageRows

  const canonical =
    visibleRows.find(imageRow => imageRow.intent === 'canonical' && imageRow.image) ??
    visibleRows.find(imageRow => imageRow.image)

  const image = canonical?.image
  const selected = image
    ? {
        ...toImageEnvelope(
          toNormalizedImageRecord(image),
          profile === 'admin' ? 'admin' : profile,
          ImageContextResource.feature,
          featureId,
        ),
        intent: canonical?.intent ?? null,
        isPublished: canonical?.isPublished ?? null,
        publishedAt: canonical?.publishedAt ?? null,
      }
    : null

  if (!options.includeAll) return selected

  return {
    image: selected,
    images: visibleRows
      .filter((imageRow): imageRow is FeatureImageRelation & { image: ImageDB } =>
        Boolean(imageRow.image),
      )
      .map(imageRow => ({
        ...toImageEnvelope(
          toNormalizedImageRecord(imageRow.image),
          profile === 'admin' ? 'admin' : 'detail',
          ImageContextResource.feature,
          featureId,
        ),
        intent: imageRow.intent ?? null,
        isPublished: imageRow.isPublished ?? null,
        publishedAt: imageRow.publishedAt ?? null,
      })),
    imageCount: imageRows.length,
    imagePublishedCount: imageRows.filter(imageRow => imageRow.isPublished).length,
  }
}

/** Project property translations without requiring all compiled UI languages.
 * @param properties Relational property rows. @returns Locale-preserving API values.
 */
const toPropertyShape = (properties: FeatureResponseRow['properties']) =>
  (properties ?? []).map(property => ({
    ...property,
    i18n: (() => {
      if (!property.property?.isTranslatable) return null
      const transformed = contentRowsToForm(property.i18n ?? [])
      if (!transformed) return null
      const hasValue = Object.values(transformed).some(entry => {
        const value =
          entry && typeof entry === 'object' && 'value' in entry
            ? (entry as { value?: unknown }).value
            : undefined
        return typeof value === 'string' && value.trim().length > 0
      })
      return hasValue ? transformed : null
    })(),
    property: property.property
      ? {
          ...property.property,
          i18n: propertyLocalesToForm(property.property.i18n),
          values:
            property.property.values?.map(value => ({
              ...value,
              i18n: propertyLocalesToForm(value.i18n),
            })) ?? [],
        }
      : undefined,
    propertyValue: property.propertyValue
      ? {
          ...property.propertyValue,
          i18n: propertyLocalesToForm(property.propertyValue.i18n),
        }
      : null,
  }))

export const normalizeFeaturePropertiesForLayer = (
  featureId: string,
  properties: FeatureResponseRow['properties'],
  layerData: Layer | null | undefined,
): NonNullable<FeatureResponseRow['properties']> => {
  if (!layerData) return [...(properties ?? [])]

  return mergeFeatureProperties(
    {
      id: featureId,
      properties: [...(properties ?? [])],
    } as Feature,
    layerData,
  ).properties as NonNullable<FeatureResponseRow['properties']>
}

/**
 * Normalizes arbitrary profile input into a supported feature profile.
 */
export const toFeatureProfile = (
  value: unknown,
  fallback: FeatureProfile,
): FeatureProfile =>
  typeof value === 'string' && (featureProfiles as readonly string[]).includes(value)
    ? (value as FeatureProfile)
    : fallback

const toProfileResponseShape = async (
  row: FeatureResponseRow,
  profile: FeatureProfile,
): Promise<FeatureEntityByProfile<FeatureProfile>> => {
  // Titles are materialized on writes; readers never recompute naming rules.
  const translations = contentRowsToForm(row.i18n ?? [])
  if (profile === 'compact')
    return FeatureCompactProfileAPI.parse({
      ...row,
      i18n: translations,
    })
  const imageProfile =
    profile === 'admin'
      ? 'admin'
      : ['list', 'default', 'map'].includes(profile)
        ? 'list'
        : 'detail'
  const filterUnpublished = profile !== 'admin'
  const imageState = toFeatureImageEnvelope(
    row.images as FeatureImageRelation[],
    row.id,
    imageProfile,
    {
      includeAll: ['full', 'detail', 'admin'].includes(profile),
      filterUnpublished,
    },
  )

  const base = {
    ...row,
    geometry:
      profile === 'default' && row.geometry?.type !== 'Point' ? null : row.geometry,
    i18n: translations,
    properties: toPropertyShape(row.properties),
    image:
      profile === 'list' ||
      profile === 'card' ||
      profile === 'default' ||
      profile === 'map'
        ? imageState
        : (imageState as { image: unknown }).image,
  }

  if (profile === 'list' || profile === 'default' || profile === 'map') {
    const listData = {
      ...base,
      image: imageState,
      imageCount: row.imageCount ?? row.images?.length ?? 0,
      imagePublishedCount:
        row.imagePublishedCount ??
        (row.images as Array<{ isPublished?: boolean }> | undefined)?.filter(
          imageRow => imageRow.isPublished,
        ).length ??
        0,
    }
    return parseFeatureProfileWithFallback(
      FeatureListProfileAPI,
      listData,
      profile,
    ) as FeatureEntityByProfile<FeatureProfile>
  }

  if (profile === 'card') {
    const normalizedProperties = normalizeFeaturePropertiesForLayer(
      row.id,
      row.properties,
      row.layer,
    )
    return parseFeatureProfileWithFallback(
      FeatureCardProfileAPI,
      {
        ...base,
        properties: toPropertyShape(normalizedProperties),
        image: imageState,
        imageCount: row.imageCount ?? row.images?.length ?? 0,
        imagePublishedCount:
          row.imagePublishedCount ??
          (row.images as Array<{ isPublished?: boolean }> | undefined)?.filter(
            imageRow => imageRow.isPublished,
          ).length ??
          0,
      },
      profile,
    ) as FeatureEntityByProfile<FeatureProfile>
  }

  if (profile === 'detail' || profile === 'full') {
    const normalizedProperties = normalizeFeaturePropertiesForLayer(
      row.id,
      row.properties,
      row.layer,
    )
    const detailImageState = toFeatureImageEnvelope(
      row.images as FeatureImageRelation[],
      row.id,
      'detail',
      { includeAll: true, filterUnpublished },
    ) as { image: unknown; images: unknown[] }
    return parseFeatureProfileWithFallback(
      FeatureDetailProfileAPI,
      {
        ...base,
        properties: toPropertyShape(normalizedProperties),
        image: detailImageState.image,
        images: detailImageState.images,
        imageCount: row.imageCount ?? row.images?.length ?? 0,
        imagePublishedCount:
          row.imagePublishedCount ??
          (row.images as Array<{ isPublished?: boolean }> | undefined)?.filter(
            imageRow => imageRow.isPublished,
          ).length ??
          0,
      },
      profile,
    ) as FeatureEntityByProfile<FeatureProfile>
  }

  const normalizedProperties = normalizeFeaturePropertiesForLayer(
    row.id,
    row.properties,
    row.layer,
  )
  const adminImageState = toFeatureImageEnvelope(
    row.images as FeatureImageRelation[],
    row.id,
    'admin',
    { includeAll: true, filterUnpublished: false },
  ) as { image: unknown; images: unknown[] }

  return parseFeatureProfileWithFallback(
    FeatureAdminProfileAPI,
    {
      ...base,
      properties: toPropertyShape(normalizedProperties),
      image: adminImageState.image,
      images: adminImageState.images,
    },
    profile,
  ) as FeatureEntityByProfile<FeatureProfile>
}

const toResponseShape = async <P extends FeatureProfile>(
  row: FeatureQueryRowByProfile<P>,
  profile: P,
): Promise<FeatureEntityByProfile<P>> =>
  (await toProfileResponseShape(
    row as FeatureResponseRow,
    profile,
  )) as FeatureEntityByProfile<P>

/**
 * Shapes a single feature entity into an API response envelope.
 */
export const toEntityResponseShape = async <P extends FeatureProfile = 'detail'>(
  row: FeatureQueryRowByProfile<P> | null,
  profile: P = 'detail' as P,
): Promise<EntityResponse<FeatureEntityByProfile<P>>> => {
  const startedAt = Date.now()
  if (!row) {
    return { data: null, durationMs: Date.now() - startedAt }
  }

  return {
    data: (await toProfileResponseShape(
      row as FeatureResponseRow,
      profile,
    )) as FeatureEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Shapes a paginated feature result into an API list envelope.
 */
export const toListResponseShape = async <P extends FeatureProfile = 'list'>(
  result: ListResponse<FeatureQueryRowByProfile<P>>,
  profile: P = 'list' as P,
): Promise<ListResponse<FeatureListByProfile<P>>> => {
  const data = await Promise.all(result.data.map(row => toResponseShape(row, profile)))

  return {
    ...result,
    data: data as FeatureListByProfile<P>[],
  }
}

/********************
 *  NORMALIZATION
 ************/

/**
 * Produces a stable property signature for update comparisons.
 */
export const toComparableFeatureProperties = (
  properties: Array<{
    propertyId?: string | null
    value?: string | null
    valueJson?: string | null
    propertyValueId?: string | null
    i18n?: Record<string, { value?: string | null }>
  }>,
): Array<{
  propertyId: string
  value: string | null
  propertyValueId: string | null
  i18n: Record<string, string | null>
}> =>
  properties
    .filter(
      (property): property is NonNullable<typeof property> & { propertyId: string } =>
        typeof property?.propertyId === 'string' && property.propertyId.length > 0,
    )
    .map(property => ({
      propertyId: property.propertyId,
      value: property.value ?? null,
      valueJson: property.valueJson ?? null,
      propertyValueId: property.propertyValueId ?? null,
      i18n: Object.fromEntries(
        Object.entries(property.i18n ?? {}).map(([localeKey, localeValue]) => [
          localeKey,
          localeValue?.value ?? null,
        ]),
      ),
    }))
    .sort((a, b) => a.propertyId.localeCompare(b.propertyId))

/********************
 *  QUERY CONTEXT
 ************/

/**
 * Builds id-based lookup conditions for feature reads.
 */
export const toLookupConditions = (params: {
  ref?: string
  refKey?: string | null
}): Partial<FeatureDB> => {
  if (params.refKey === 'id' || !params.refKey) {
    return {
      id: params.ref,
    } as Partial<FeatureDB>
  }
  return {
    id: params.ref,
  } as Partial<FeatureDB>
}

/**
 * Normalizes requested feature visibility flags from query conditions.
 */
export const toRequestedListState = (
  params: Partial<FeatureDB>,
): { isPublished?: boolean; isArchived?: boolean; isDraft?: boolean } => ({
  isPublished: toBooleanOrUndefined(params.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(params.isArchived) ?? false,
  isDraft: toBooleanOrUndefined(params.isDraft) ?? false,
})

/**
 * Normalizes prism input for feature queries.
 */
export const toFeaturePrisms = (prisms?: Prisms): Prisms | undefined => {
  if (!prisms) return undefined
  return {
    organisation: Array.isArray(prisms.organisation) ? prisms.organisation : [],
    project: Array.isArray(prisms.project) ? prisms.project : [],
    layer: Array.isArray(prisms.layer) ? prisms.layer : [],
  }
}

/**
 * Resolves role-aware feature query conditions.
 */
export const toQueryConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: Partial<FeatureDB>,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): {
  conditions: SQL<unknown>[]
  filtersToApply: QueryParams
} => {
  const filtersToApply: QueryParams = { ...(params as QueryParams) }
  const conditions: SQL<unknown>[] = []
  const normalizedPrisms = toFeaturePrisms(prisms)
  const ownerProjectIds = userRoles
    .filter(role => role.type === 'project' && role.role === 'owner')
    .map(role => (role as Extract<UserRoleDisco, { type: 'project' }>).projectId)
  const ownerOrganisationIds = userRoles
    .filter(role => role.type === 'organisation' && role.role === 'owner')
    .map(
      role => (role as Extract<UserRoleDisco, { type: 'organisation' }>).organisationId,
    )
  const translatorProjectIds = Array.from(
    new Set(
      userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
            role.type === 'project' &&
            (role.role === 'owner' ||
              role.role === 'maintainer' ||
              role.role === 'translator') &&
            typeof role.projectId === 'string' &&
            role.projectId.length > 0,
        )
        .map(role => role.projectId),
    ),
  )
  const isHubAdmin = isRelevantHubAdmin(userRoles, resourceHubId)

  if (normalizedPrisms) {
    conditions.push(
      ...applyPrismConstraints(db, HierarchicalResource.feature, normalizedPrisms),
    )
  }

  const isSuperAdmin = Boolean(user.superAdmin)
  const isScopedAdmin =
    isSuperAdmin ||
    isHubAdmin ||
    translatorProjectIds.length > 0 ||
    ownerOrganisationIds.length > 0

  if (!isAdminRequest) {
    conditions.push(historicalFeatureVisibility())
    removeExcludedColumns(filtersToApply, ['isPublished', 'isArchived'])
    conditions.push(eq(feature.isPublished, true))
    conditions.push(eq(feature.isArchived, false))
  } else if (!isScopedAdmin) {
    conditions.push(eq(feature.isPublished, true))
    conditions.push(eq(feature.isArchived, false))
  }

  const { isPublished, isArchived, isDraft, ...otherFilters } = filtersToApply
  const requestedIsPublished = toBooleanOrUndefined(isPublished)
  const requestedIsArchived = toBooleanOrUndefined(isArchived)
  const requestedIsDraft = toBooleanOrUndefined(isDraft)

  if (!isSuperAdmin && !isHubAdmin && isAdminRequest) {
    // Public rows remain readable; owners can view every archive state, while maintainers/translators only see non-archived rows.
    conditions.push(
      or(
        and(
          eq(feature.isPublished, true),
          eq(feature.isArchived, false),
          eq(feature.isDraft, false),
        ),
        chunkedInArray(feature.organisationId, ownerOrganisationIds),
        chunkedInArray(feature.projectId, ownerProjectIds),
        and(
          eq(feature.isArchived, false),
          chunkedInArray(feature.projectId, translatorProjectIds),
        ),
      ) ?? sql`0`,
    )
  }

  applyTriStateBooleanCondition(
    conditions,
    feature.isPublished,
    isAdminRequest ? requestedIsPublished : true,
  )
  applyTriStateBooleanCondition(
    conditions,
    feature.isArchived,
    isAdminRequest ? requestedIsArchived : false,
  )
  applyTriStateBooleanCondition(conditions, feature.isDraft, requestedIsDraft ?? false)
  applyQueryFilters(feature, otherFilters, conditions)

  return {
    conditions,
    filtersToApply,
  }
}

/********************
 *  FEATURE CREATION WITH ENRICHMENT
 ************/

/**
 * Prepare submitted content and optional machine translations without copying fallback text.
 * @param db Request database used to validate the layer and properties.
 * @param newFeature Authored content, including locales outside the UI language set.
 * @param region Translation provider region.
 * @param subscriptionKey Optional provider credential; manual storage works without it.
 * @param stage Draft or final required-title validation.
 * @returns Validated Feature payload and authoritative layer scope.
 * @remarks Populated values and their verification flags survive; failed targets stay empty.
 */
const prepareUserContributedFeatureDraft = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
  stage: UserContributedFeatureDraftStage = 'draft',
): Promise<PreparedUserContributedFeatureDraft> => {
  if (await historicalSourceLayerId(db, newFeature.layerId as string))
    throw new Error('HISTORICAL_LAYER_MEMBERSHIP_AUTOMATIC')
  const layerScope = await probeLayerForUpdate(db, newFeature.layerId as string)
  if (!layerScope) {
    throw new Error('Layer not found')
  }

  newFeature = { ...newFeature, i18n: adaptContentMap(newFeature.i18n) }
  const contentKeys = [
    ...new Set([...supportedLocaleKeys, ...Object.keys(newFeature.i18n)]),
  ]
  const providedLocaleKeys = contentKeys.filter(localeKey =>
    hasMeaningfulLocaleContent(
      newFeature.i18n[localeKey] as Record<string, unknown> | undefined,
    ),
  )

  const enrichedI18n: Record<string, DraftFeatureLocaleOutput> = {}
  const sourceLocaleKey =
    providedLocaleKeys.find(localeKey =>
      Boolean(newFeature.i18n[localeKey]?.title?.trim()),
    ) ?? providedLocaleKeys[0]
  const sourceTextObj = sourceLocaleKey ? newFeature.i18n[sourceLocaleKey] : null
  const hasSourceTitle = Boolean(sourceTextObj?.title?.trim())

  if (!sourceLocaleKey || !hasSourceTitle) {
    for (const localeKey of contentKeys) {
      const localeValue = newFeature.i18n[localeKey]

      enrichedI18n[localeKey] = {
        title: localeValue?.title?.trim() ?? '',
        description: localeValue?.description?.trim() ?? '',
        displayAddress: localeValue?.displayAddress?.trim() ?? '',
        titleGen: localeValue?.titleGen ?? false,
        descriptionGen: localeValue?.descriptionGen ?? false,
        displayAddressGen: localeValue?.displayAddressGen ?? false,
        addressProperties: localeValue?.addressProperties ?? {},
      }
    }
  } else {
    if (!sourceTextObj) {
      throw new Error('Source locale must have content')
    }

    for (const localeKey of contentKeys) {
      const targetTextObj = newFeature.i18n[localeKey]
      const isSourceLocale = localeKey === sourceLocaleKey

      if (isSourceLocale) {
        enrichedI18n[localeKey] = {
          title: toTrimmedString(sourceTextObj.title),
          description: toTrimmedString(sourceTextObj.description),
          displayAddress: toTrimmedString(sourceTextObj.displayAddress),
          titleGen: sourceTextObj.titleGen ?? false,
          descriptionGen: sourceTextObj.descriptionGen ?? false,
          displayAddressGen: sourceTextObj.displayAddressGen ?? false,
          addressProperties: sourceTextObj.addressProperties ?? {},
        }
        continue
      }

      const targetTitle = toTrimmedString(targetTextObj?.title)
      const targetDescription = toTrimmedString(targetTextObj?.description)
      const targetDisplayAddress = toTrimmedString(targetTextObj?.displayAddress)
      const sourceTitle = toTrimmedString(sourceTextObj.title)
      const sourceDescription = toTrimmedString(sourceTextObj.description)
      const sourceDisplayAddress = toTrimmedString(sourceTextObj.displayAddress)

      const fieldsToTranslate = [
        !targetTitle && sourceTitle ? sourceTitle : null,
        !targetDescription && sourceDescription ? sourceDescription : null,
        !targetDisplayAddress && sourceDisplayAddress ? sourceDisplayAddress : null,
      ].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )

      let translatedValues: string[] = []
      if (fieldsToTranslate.length > 0 && subscriptionKey) {
        const { translateText } = await import('#lib/api/external/translation.js')
        try {
          translatedValues = await translateText(
            fieldsToTranslate,
            sourceLocaleKey,
            localeKey,
            region,
            subscriptionKey,
          )
        } catch (translationError) {
          console.error(
            `Translation failed for ${sourceLocaleKey} -> ${localeKey}:`,
            translationError,
          )
        }
      }

      let translationIndex = 0
      const translatedTitle =
        !targetTitle && sourceTitle && translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null
      const translatedDescription =
        !targetDescription &&
        sourceDescription &&
        translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null
      const translatedDisplayAddress =
        !targetDisplayAddress &&
        sourceDisplayAddress &&
        translationIndex < translatedValues.length
          ? translatedValues[translationIndex++]
          : null

      enrichedI18n[localeKey] = {
        title: targetTitle || translatedTitle || '',
        description: targetDescription || translatedDescription || '',
        displayAddress: targetDisplayAddress || translatedDisplayAddress || '',
        titleGen: targetTitle
          ? (targetTextObj?.titleGen ?? false)
          : Boolean(translatedTitle),
        descriptionGen: targetDescription
          ? (targetTextObj?.descriptionGen ?? false)
          : Boolean(translatedDescription),
        displayAddressGen: targetDisplayAddress
          ? (targetTextObj?.displayAddressGen ?? false)
          : Boolean(translatedDisplayAddress),
        addressProperties: targetDisplayAddress
          ? (targetTextObj?.addressProperties ?? {})
          : {},
      }
    }
  }

  const enrichedProperties = await Promise.all(
    (newFeature.properties || []).map(async property => {
      if (!property.i18n) return property

      const propertyI18nByLocale =
        adaptContentMap(property.i18n as Record<string, DraftPropertyLocaleInput>) ?? {}
      const propertyKeys = [
        ...new Set([...contentKeys, ...Object.keys(propertyI18nByLocale)]),
      ]
      const propertySourceLocaleKey = propertyKeys.find(localeKey =>
        Boolean(propertyI18nByLocale[localeKey]?.value?.trim()),
      )
      if (!propertySourceLocaleKey) return property

      const propertySourceTextObj = propertyI18nByLocale[propertySourceLocaleKey]
      if (!propertySourceTextObj?.value?.trim()) return property

      const enrichedPropertyI18n: Partial<
        Record<string, { value: string; valueGen: boolean }>
      > = {}

      for (const localeKey of propertyKeys) {
        const currentValue = toTrimmedString(propertyI18nByLocale[localeKey]?.value)
        if (localeKey === propertySourceLocaleKey || currentValue) {
          enrichedPropertyI18n[localeKey] = {
            value: currentValue || toTrimmedString(propertySourceTextObj.value),
            valueGen: propertyI18nByLocale[localeKey]?.valueGen ?? false,
          }
          continue
        }

        let translatedValue: string | null = null
        if (subscriptionKey) {
          try {
            const { translateText } = await import('#lib/api/external/translation.js')
            translatedValue =
              (
                await translateText(
                  [toTrimmedString(propertySourceTextObj.value)],
                  propertySourceLocaleKey,
                  localeKey,
                  region,
                  subscriptionKey,
                )
              )[0] ?? null
          } catch {}
        }

        enrichedPropertyI18n[localeKey] = {
          value: translatedValue || '',
          valueGen: Boolean(translatedValue),
        }
      }

      return {
        ...property,
        i18n: enrichedPropertyI18n,
      }
    }),
  )

  const draftPayload = {
    ...newFeature,
    organisationId: layerScope.organisationId,
    projectId: layerScope.projectId,
    isPendingReview: true,
    isDraft: true,
    i18n: enrichedI18n as FeatureNew['i18n'],
    properties: enrichedProperties,
  }
  const validatedFeature = projectFeatureAddress(
    stage === 'final'
      ? FeatureEntityFormData.parse(draftPayload)
      : FeatureDraftEntityFormData.parse(draftPayload),
  )

  validatedFeature.properties = await validateFeaturePhoneProperties(
    db,
    validatedFeature.properties ?? [],
    new Set(),
    validatedFeature.layerId,
  )
  if (validatedFeature.featureType) {
    const type = requireFeatureType(
      (
        await readFeatureIntentPolicy(db, {
          type: 'layer',
          id: validatedFeature.layerId,
        })
      ).types,
      validatedFeature.featureType,
    )
    validatedFeature.kind = type.kind ?? 'object'
    validatedFeature.associationRelation = type.relation ?? 'locatedAt'
    if (
      validatedFeature.targetContext &&
      type.targetContexts &&
      !type.targetContexts.includes(validatedFeature.targetContext)
    )
      throw new Error('Location context is not available for this layer')
  }
  return {
    validatedFeature,
    layerScope,
  }
}

/**
 * Creates a user-contributed feature with translated fallback locales.
 * @param db Database handle.
 * @param newFeature Contribution payload and optional draft stage.
 * @param region Translation service region.
 * @param subscriptionKey Translation service credential.
 * @returns The persisted feature row.
 * @remarks Final submissions leave draft state but remain unpublished pending review.
 */
export const createUserContributedFeature = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
): Promise<FeatureDB> => {
  if (await featureRevisionCreationEnabled(db))
    throw new Error('Create revision-backed contributions with their review task')
  const input = await prepareUserContributedFeatureCreation(
    db,
    newFeature,
    region,
    subscriptionKey,
  )
  const actorId = newFeature.contributorId
  if (!actorId) throw error(400, 'Contributor ID is required')
  return createFeatureForm(db, {
    ...input,
    creationOrigin: { origin: 'app_contribution', actorId },
    revisionActor: { actorId, mode: 'contribution' },
  })
}

/**
 * Creates a translated contribution and its review task in one database transaction.
 * @param db Request database.
 * @param newFeature Authorized contribution input and requested draft stage.
 * @param region Translation service region.
 * @param subscriptionKey Translation service credential.
 * @param author Session-owned contributor and optional submitted message.
 * @returns The committed Feature and task.
 */
export const createUserContributedFeatureTask = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
  author: Pick<TaskNew, 'contributorId' | 'message'>,
): Promise<{ feature: FeatureDB; task: TaskDB }> => {
  if (await hasFeatureLifecycleStorage(db))
    throw new Error(
      'Start a creation contribution through its proposal task before uploading photos',
    )
  const input = await prepareUserContributedFeatureCreation(
    db,
    newFeature,
    region,
    subscriptionKey,
  )
  return createFeatureTask(db, input, author)
}

/**
 * Prepares translated and validated contribution fields without persisting them.
 * @param db Request database for authoritative layer scope and property validation.
 * @param newFeature Authorized contribution input.
 * @param region Translation service region.
 * @param subscriptionKey Translation service credential.
 * @returns Complete Feature form creation input.
 */
const prepareUserContributedFeatureCreation = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
): Promise<Parameters<typeof createFeatureForm>[1]> => {
  const stage: UserContributedFeatureDraftStage =
    newFeature.isDraft === true ? 'draft' : 'final'
  const { validatedFeature, layerScope } = await prepareUserContributedFeatureDraft(
    db,
    newFeature,
    region,
    subscriptionKey,
    stage,
  )

  const type = validatedFeature.featureType
    ? requireFeatureType(
        (
          await readFeatureIntentPolicy(db, {
            type: 'layer',
            id: validatedFeature.layerId,
          })
        ).types,
        validatedFeature.featureType,
      )
    : null
  const nameTemplate =
    type && (type.nameRule || type.relation === 'represents')
      ? {
          rule: type.nameRule ?? { base: 'location' as const, conditions: [] },
        }
      : null
  // Store localized authoring inputs beside the computed translation title.
  for (const [locale, row] of Object.entries(validatedFeature.i18n)) {
    Object.assign(row, {
      baseName: row.title,
      nameOverride: nameTemplate
        ? (validatedFeature.nameOverrides?.[canonicalContentTag(locale)] ?? null)
        : null,
    })
  }
  return {
    data: {
      ...validatedFeature,
      nameTemplate,
      organisationId: layerScope.organisationId,
      projectId: layerScope.projectId,
      addressMeta: validatedFeature.addressMeta ?? {},
      isPublished: false,
      isArchived: false,
      // Explicit drafts stay editable; immediate submissions are ready for review.
      isDraft: stage === 'draft',
    },
    i18n: validatedFeature.i18n,
    properties: validatedFeature.properties ?? [],
  }
}

/**
 * Updates an existing user-contributed feature draft in place.
 * @param db Request-local database.
 * @param featureId Authorized draft identity.
 * @param newFeature Validated contribution input.
 * @param region Translation service region.
 * @param subscriptionKey Translation credential.
 * @returns The updated draft after its parent and relations commit together.
 * @remarks A finalized or Location-linked Feature cannot be overwritten as a draft.
 */
export const updateUserContributedFeatureDraft = async (
  db: Database,
  featureId: FeatureDB['id'],
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
): Promise<FeatureDB> => {
  const input = await prepareUserContributedFeatureDraftUpdate(
    db,
    featureId,
    newFeature,
    region,
    subscriptionKey,
  )
  const updated = await saveUnlinkedFeatureForm(db, input)
  if (!updated) throw new Error('Feature draft update failed')
  return updated
}

/**
 * Saves an authorized contribution draft and its task in one transaction.
 * @param db Request-local database.
 * @param expectedTask Persisted task identity and revision after contributor authorization.
 * @param newFeature Submitted draft form data.
 * @param region Translation service region.
 * @param subscriptionKey Translation service credential.
 * @returns The committed Feature and task; stale submissions are rejected.
 */
export const updateUserContributedFeatureTaskDraft = async (
  db: Database,
  expectedTask: ContributionDraftTask,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
): Promise<{ feature: FeatureDB; task: TaskDB }> => {
  if (!expectedTask.featureId) throw error(409, 'TASK_REQUIRES_CREATION_PROPOSAL')
  const input = await prepareUserContributedFeatureDraftUpdate(
    db,
    expectedTask.featureId,
    { ...newFeature, isDraft: true, contributorId: expectedTask.contributorId },
    region,
    subscriptionKey,
  )
  const updated = await saveFeatureTaskDraft(db, input, expectedTask)
  if (!updated) throw error(409, 'STALE_TASK_DRAFT')
  return updated
}

/**
 * Prepares a translated draft update without persisting Feature or task changes.
 * @param db Request-local database.
 * @param featureId Authorized draft identity.
 * @param newFeature Submitted form data.
 * @param region Translation service region.
 * @param subscriptionKey Translation service credential.
 * @returns Complete Feature update with its expected revision.
 */
const prepareUserContributedFeatureDraftUpdate = async (
  db: Database,
  featureId: FeatureDB['id'],
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
): Promise<Parameters<typeof saveUnlinkedFeatureForm>[1]> => {
  const featureProbe = await probeFeatureForUpdate(db, featureId)
  if (!featureProbe) {
    throw new Error('Feature not found')
  }

  const stage: UserContributedFeatureDraftStage =
    newFeature.isDraft === true ? 'draft' : 'final'
  const { validatedFeature, layerScope } = await prepareUserContributedFeatureDraft(
    db,
    newFeature,
    region,
    subscriptionKey,
    stage,
  )

  return {
    featureId,
    actorId: newFeature.contributorId ?? undefined,
    projectId: featureProbe.projectId,
    expectedDraftState: true,
    i18n: validatedFeature.i18n,
    properties: validatedFeature.properties ?? [],
    updatedAt: featureProbe.modifiedAt,
    data: {
      organisationId: layerScope.organisationId,
      projectId: layerScope.projectId,
      layerId: validatedFeature.layerId,
      contributorId: validatedFeature.contributorId ?? null,
      geometry: validatedFeature.geometry,
      addressMeta: validatedFeature.addressMeta ?? {},
      isIntangible: validatedFeature.isIntangible,
      isVisitable: validatedFeature.isVisitable,
      isPendingReview: true,
      isPublished: false,
      isArchived: false,
      isDraft: true,
    },
  }
}

/**
 * Validates that a persisted user-contributed feature draft satisfies final-submission requirements.
 * @param db Database handle.
 * @param featureId Draft feature identifier.
 * @returns Nothing. Throws when the persisted draft is incomplete for final submission.
 */
export const assertUserContributedFeatureDraftIsSubmittable = async (
  db: Database,
  featureId: FeatureDB['id'],
): Promise<void> => {
  const persistedFeature = await db.query.feature.findFirst({
    with: {
      i18n: true,
      properties: {
        with: {
          i18n: true,
        },
      },
    },
    where: eq(feature.id, featureId),
  })

  if (!persistedFeature) {
    throw new Error('Feature not found')
  }

  const i18nByLocale = requiredLocaleKeys.reduce<
    Record<string, Record<string, unknown>>
  >(
    (accumulator, localeKey) => {
      accumulator[localeKey] = {
        title: '',
        titleGen: false,
        description: '',
        descriptionGen: false,
        displayAddress: '',
        displayAddressGen: false,
        addressProperties: {},
      }
      return accumulator
    },
    {} as Record<string, Record<string, unknown>>,
  )

  persistedFeature.i18n?.forEach(localeRecord => {
    const localeKey = contentFormKey(localeRecord.locale)
    i18nByLocale[localeKey] = {
      title: localeRecord.title ?? '',
      titleGen: Boolean(localeRecord.titleGen),
      description: localeRecord.description ?? '',
      descriptionGen: Boolean(localeRecord.descriptionGen),
      displayAddress: localeRecord.displayAddress ?? '',
      displayAddressGen: Boolean(localeRecord.displayAddressGen),
      addressProperties: localeRecord.addressProperties ?? {},
    }
  })

  const properties = (persistedFeature.properties ?? []).map(propertyRow => ({
    propertyId: propertyRow.propertyId,
    value: propertyRow.value ?? null,
    valueJson: propertyRow.valueJson ?? null,
    propertyValueId: propertyRow.propertyValueId ?? null,
    i18n: (propertyRow.i18n ?? []).reduce<
      Record<string, { value?: string; valueGen?: boolean }>
    >(
      (accumulator, localeRecord) => {
        accumulator[contentFormKey(localeRecord.locale)] = {
          value: localeRecord.value ?? undefined,
          valueGen: Boolean(localeRecord.valueGen),
        }
        return accumulator
      },
      {} as Record<string, { value?: string; valueGen?: boolean }>,
    ),
  }))

  FeatureEntityFormData.parse({
    organisationId: persistedFeature.organisationId,
    projectId: persistedFeature.projectId,
    layerId: persistedFeature.layerId,
    contributorId: persistedFeature.contributorId,
    geometry: persistedFeature.geometry,
    addressMeta: persistedFeature.addressMeta ?? {},
    isIntangible: persistedFeature.isIntangible,
    isVisitable: persistedFeature.isVisitable,
    isPendingReview: persistedFeature.isPendingReview,
    isDraft: false,
    i18n: i18nByLocale,
    properties,
  })
}

/** Save an authenticated creation contribution as a task and proposal, with no provisional Feature.
 * @param db Request database. @param input Contributor form and optional task identity.
 * @param region Translation region. @param subscriptionKey Optional translation credential.
 * @returns Scoped task/proposal identifiers for subsequent photo uploads.
 */
export async function saveUserContributedCreationTask(
  db: Database,
  input: {
    feature: UserContributedFeature
    actorId: string
    taskId?: string
  },
  region: string,
  subscriptionKey: string,
): Promise<Awaited<ReturnType<typeof saveFeatureCreationTaskDraft>>> {
  const form = await prepareUserContributedFeatureCreation(
    db,
    {
      ...input.feature,
      contributorId: input.actorId,
      isDraft: true,
    },
    region,
    subscriptionKey,
  )
  const prepared = await prepareFeatureCreationContent(db, {
    ...form,
    id: 'creation-proposal',
  })
  return saveFeatureCreationTaskDraft(db, {
    actorId: input.actorId,
    taskId: input.taskId,
    ...prepared,
    scope: {
      organisationId: form.data.organisationId,
      projectId: form.data.projectId,
      layerId: form.data.layerId,
    },
  })
}
