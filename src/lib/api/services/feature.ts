// DRIZZLE
import { eq, inArray, sql, type SQL } from 'drizzle-orm'
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api'
import { toBooleanOrUndefined } from '$lib/api/services'
import { isRelevantHubAdmin } from '$lib/api/services/authz'
// DB
import { applyPrismConstraints, transformI18nSafely } from '$lib/db'
import { applyTriStateBooleanCondition } from '$lib/db/query'
import { toImageEnvelope } from '$lib/db/services/image'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import {
  createFeature,
  createI18n,
  createProperties,
  mergeFeatureProperties,
} from '$lib/db/services/feature'
import { probeLayerForUpdate } from '$lib/db/services/layer'
// I18N
import { toLocaleKey } from '$lib/i18n'
// SCHEMA
import { feature, layer } from '$lib/db/schema/index'
import {
  FeatureAdminProfileAPI,
  FeatureCardProfileAPI,
  FeatureDetailProfileAPI,
  FeatureEntityFormData,
  FeatureListProfileAPI,
} from '$lib/db/zod/schema/feature'
// ENUMS
import {
  HierarchicalResource,
  ImageContextResource,
  supportedLocales,
} from '$lib/enums'
// CLIENT
import { buildNeighbourhoodSubdivisionMap } from '$lib/client/services/geospatial'
// TYPES
import type {
  Database,
  EntityResponse,
  ListResponse,
  Locale,
  LocaleKey,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { ImageDB } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  FeatureAdminDBRaw,
  FeatureDB,
  FeatureNew,
  FeatureEntityByProfile,
  FeatureListByProfile,
  FeatureProfile,
  FeatureQueryRowByProfile,
  UserContributedFeature,
} from '$lib/db/zod/schema/feature.types'

const requiredLocaleKeys = supportedLocales.map(locale =>
  toLocaleKey(locale),
) as LocaleKey[]

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
// - withExpandedNeighbourhoods
//
// FEATURE CREATION WITH ENRICHMENT
// - createUserContributedFeature

/********************
 *  DB RELATIONS
 ************/

const featureListRelations = {
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
}

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
  if (profile === 'admin') {
    return featureAdminRelations as FeatureRelationsByProfile<P>
  }
  if (profile === 'card' || profile === 'detail') {
    return featureDetailRelations as FeatureRelationsByProfile<P>
  }
  return featureListRelations as FeatureRelationsByProfile<P>
}

/********************
 *  PROFILE SHAPING
 ************/

const featureProfiles = ['list', 'card', 'detail', 'admin'] as const

type FeatureImageRelation = {
  featureId?: string
  intent?: string | null
  isPublished?: boolean | null
  image?: ImageDB | null
}

type FeatureResponseRow = FeatureAdminDBRaw & {
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
    ? toImageEnvelope(
        image,
        profile === 'admin' ? 'admin' : profile,
        ImageContextResource.feature,
        featureId,
      )
    : null

  if (!options.includeAll) return selected

  return {
    image: selected,
    images: visibleRows
      .filter((imageRow): imageRow is FeatureImageRelation & { image: ImageDB } =>
        Boolean(imageRow.image),
      )
      .map(imageRow =>
        toImageEnvelope(
          imageRow.image,
          profile === 'admin' ? 'admin' : 'detail',
          ImageContextResource.feature,
          featureId,
        ),
      ),
    imageCount: imageRows.length,
    imagePublishedCount: imageRows.filter(imageRow => imageRow.isPublished).length,
  }
}

const toPropertyShape = (properties: FeatureResponseRow['properties']) =>
  (properties ?? []).map(property => ({
    ...property,
    i18n: (() => {
      if (!property.property?.isTranslatable) return null
      const transformed = transformI18nSafely(property.i18n as never)
      if (!transformed) return null
      const hasAllLocales = requiredLocaleKeys.every(
        localeKey => transformed[localeKey],
      )
      if (!hasAllLocales) return null
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
          i18n: transformI18nSafely(property.property.i18n as never),
          values:
            property.property.values?.map(value => ({
              ...value,
              i18n: transformI18nSafely(value.i18n as never),
            })) ?? [],
        }
      : undefined,
    propertyValue: property.propertyValue
      ? {
          ...property.propertyValue,
          i18n: transformI18nSafely(property.propertyValue.i18n as never),
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
    },
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
  const imageProfile =
    profile === 'admin' ? 'admin' : profile === 'list' ? 'list' : 'detail'
  const imageState = toFeatureImageEnvelope(
    row.images as FeatureImageRelation[],
    row.id,
    imageProfile,
    {
      includeAll: profile !== 'list' && profile !== 'card',
      filterUnpublished: false,
    },
  )

  const base = {
    ...row,
    i18n: transformI18nSafely(row.i18n as never),
    properties: toPropertyShape(row.properties),
    image:
      profile === 'list' || profile === 'card'
        ? imageState
        : (imageState as { image: unknown }).image,
  }

  if (profile === 'list') {
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

  if (profile === 'detail') {
    const normalizedProperties = normalizeFeaturePropertiesForLayer(
      row.id,
      row.properties,
      row.layer,
    )
    const detailImageState = toFeatureImageEnvelope(
      row.images as FeatureImageRelation[],
      row.id,
      'detail',
      { includeAll: true, filterUnpublished: false },
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
): { isPublished?: boolean; isArchived?: boolean } => ({
  isPublished: toBooleanOrUndefined(params.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(params.isArchived) ?? false,
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
  const maintainerProjectIds = Array.from(
    new Set(
      userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
            role.type === 'project' &&
            (role.role === 'owner' || role.role === 'maintainer') &&
            typeof role.projectId === 'string' &&
            role.projectId.length > 0,
        )
        .map(role => role.projectId),
    ),
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
  const isScopedAdmin = isSuperAdmin || isHubAdmin || translatorProjectIds.length > 0

  if (!isAdminRequest) {
    removeExcludedColumns(filtersToApply, ['isPublished', 'isArchived'])
    conditions.push(eq(feature.isPublished, true))
    conditions.push(eq(feature.isArchived, false))
  } else if (!isScopedAdmin) {
    conditions.push(eq(feature.isPublished, true))
    conditions.push(eq(feature.isArchived, false))
  }

  const { isPublished, isArchived, ...otherFilters } = filtersToApply
  const requestedIsPublished = toBooleanOrUndefined(isPublished)
  const requestedIsArchived = toBooleanOrUndefined(isArchived)

  if (!isSuperAdmin && !isHubAdmin && isAdminRequest) {
    const allowedProjectIds = requestedIsArchived
      ? maintainerProjectIds
      : translatorProjectIds

    if (allowedProjectIds.length === 0) {
      conditions.push(sql`false`)
    } else {
      const allowedLayerIds = db
        .select({ id: layer.id })
        .from(layer)
        .where(inArray(layer.projectId, allowedProjectIds))
      conditions.push(inArray(feature.layerId, allowedLayerIds))
    }
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
  applyQueryFilters(feature, otherFilters, conditions)

  return {
    conditions,
    filtersToApply,
  }
}

// TODO Remove this once neighbourhoods become first-class entities.
/**
 * Expands neighbourhood filter values to include known subdivisions.
 */
export function withExpandedNeighbourhoods(queryParams: QueryParams): QueryParams {
  const params = { ...queryParams }
  const neighbourhoodKey = 'addressProperties.neighbourhood'

  if (!(neighbourhoodKey in params)) return params

  const neighbourhoods = Array.isArray(params[neighbourhoodKey])
    ? (params[neighbourhoodKey] as string[])
    : [params[neighbourhoodKey] as string]

  const expanded = new Set<string>()
  const subdivisionMap = buildNeighbourhoodSubdivisionMap()

  neighbourhoods.forEach(neighbourhood => {
    expanded.add(neighbourhood)
    subdivisionMap.get(neighbourhood)?.forEach(value => {
      expanded.add(value)
    })
  })

  params[neighbourhoodKey] = Array.from(expanded)
  return params
}

/********************
 *  FEATURE CREATION WITH ENRICHMENT
 ************/

/**
 * Creates a user-contributed feature with translated fallback locales.
 */
export const createUserContributedFeature = async (
  db: Database,
  newFeature: UserContributedFeature,
  region: string,
  subscriptionKey: string,
) => {
  const layerScope = await probeLayerForUpdate(db, newFeature.layerId as string)
  if (!layerScope) {
    throw new Error('Layer not found')
  }

  const providedLocales = Object.keys(newFeature.i18n).filter(locale => {
    const textObj = newFeature.i18n[locale as Locale]
    if (!textObj) return false

    return Object.entries(textObj).some(
      ([key, value]) => key !== 'locale' && value !== null && value !== undefined,
    )
  }) as Locale[]

  if (providedLocales.length === 0) {
    throw new Error('At least one locale must have content')
  }

  const sourceLocale = providedLocales[0]
  const sourceTextObj = newFeature.i18n[sourceLocale]

  if (!sourceTextObj?.title) {
    throw new Error('Source locale must have a title')
  }

  const enrichedI18n: Partial<Record<LocaleKey, unknown>> = {}

  for (const locale of supportedLocales) {
    const localeKey = toLocaleKey(locale)
    const isSourceLocale = locale === sourceLocale

    if (isSourceLocale) {
      enrichedI18n[localeKey] = {
        title: sourceTextObj.title,
        description: sourceTextObj.description || null,
        displayAddress: sourceTextObj.displayAddress || null,
        titleGen: false,
        descriptionGen: false,
        displayAddressGen: false,
        addressProperties: {},
      }
      continue
    }

    const fieldsToTranslate = [
      sourceTextObj.title,
      sourceTextObj.description,
      sourceTextObj.displayAddress,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)

    let translatedValues: string[] = []
    if (fieldsToTranslate.length > 0 && subscriptionKey) {
      const { translateText } = await import('$lib/api/external/translation')
      try {
        translatedValues = await translateText(
          fieldsToTranslate,
          sourceLocale,
          locale,
          region,
          subscriptionKey,
        )
      } catch (translationError) {
        console.error(
          `Translation failed for ${sourceLocale} -> ${locale}:`,
          translationError,
        )
      }
    }

    let translationIndex = 0
    const translatedTitle =
      sourceTextObj.title && translationIndex < translatedValues.length
        ? translatedValues[translationIndex++]
        : null
    const translatedDescription =
      sourceTextObj.description && translationIndex < translatedValues.length
        ? translatedValues[translationIndex++]
        : null
    const translatedDisplayAddress =
      sourceTextObj.displayAddress && translationIndex < translatedValues.length
        ? translatedValues[translationIndex++]
        : null

    enrichedI18n[localeKey] = {
      title: translatedTitle || sourceTextObj.title,
      description: translatedDescription || sourceTextObj.description || null,
      displayAddress: translatedDisplayAddress || sourceTextObj.displayAddress || null,
      titleGen: Boolean(translatedTitle),
      descriptionGen: Boolean(translatedDescription),
      displayAddressGen: Boolean(translatedDisplayAddress),
      addressProperties: {},
    }
  }

  const enrichedProperties = await Promise.all(
    (newFeature.properties || []).map(async property => {
      if (!property.i18n) return property

      const propertyLocales = Object.keys(property.i18n) as Locale[]
      if (propertyLocales.length === 0) return property
      const propertySourceLocale = propertyLocales[0]
      const propertySourceTextObj = property.i18n[propertySourceLocale]
      if (!propertySourceTextObj?.value) return property

      const enrichedPropertyI18n: Partial<
        Record<LocaleKey, { value: string; valueGen: boolean }>
      > = {}

      for (const locale of supportedLocales) {
        const localeKey = toLocaleKey(locale)
        if (locale === propertySourceLocale) {
          enrichedPropertyI18n[localeKey] = {
            value: propertySourceTextObj.value,
            valueGen: false,
          }
          continue
        }

        let translatedValue: string | null = null
        if (subscriptionKey) {
          try {
            const { translateText } = await import('$lib/api/external/translation')
            translatedValue =
              (
                await translateText(
                  [propertySourceTextObj.value],
                  propertySourceLocale,
                  locale,
                  region,
                  subscriptionKey,
                )
              )[0] ?? null
          } catch {}
        }

        enrichedPropertyI18n[localeKey] = {
          value: translatedValue || propertySourceTextObj.value,
          valueGen: Boolean(translatedValue),
        }
      }

      return {
        ...property,
        i18n: enrichedPropertyI18n,
      }
    }),
  )

  const validatedFeature = FeatureEntityFormData.parse({
    ...newFeature,
    organisationId: layerScope.organisationId,
    projectId: layerScope.projectId,
    isPendingReview: true,
    i18n: enrichedI18n as FeatureNew['i18n'],
    properties: enrichedProperties,
  })

  const created = await createFeature(db, {
    ...validatedFeature,
    organisationId: layerScope.organisationId,
    projectId: layerScope.projectId,
    addressMeta: validatedFeature.addressMeta ?? {},
    isPublished: false,
    isArchived: false,
  })

  await createI18n(db, validatedFeature.i18n, created.id)
  await createProperties(db, created.id, validatedFeature.properties ?? [])

  return created
}
