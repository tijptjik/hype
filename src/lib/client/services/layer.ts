import type { LocaleKey } from '$lib/types'
import type {
  Layer,
  LayerBooleanField,
  LayerFormInput,
  LayerFormLocaleInput,
  LayerSubmitData,
  LayerSubmitUpdatesParams,
} from '$lib/db/zod/schema/layer.types'
import { toFormLocaleRecord } from '$lib/i18n'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FORM NORMALIZATION
//    - normalizeLayerFormLocale
//    - toLayerFormInput
//
// 2. BOOLEAN TOGGLE OVERRIDES
//    - overrideLayerEntityBoolean
//    - overrideLayerListItemBoolean
//
// 3. SUBMIT PAYLOAD NORMALIZATION
//    - toComparableLayerProperties
//    - toComparableLayerI18n
//    - mergeLayerFromSubmit
//
// 4. SUBMIT OVERRIDES AND UPDATE TARGETS
//    - overrideLayerEntityFromSubmit
//    - overrideLayerListItemFromSubmit
//    - getLayerSubmitUpdates

type LayerFormLocale = LayerFormLocaleInput
type LayerI18nRecord = Partial<Record<LocaleKey, unknown>>
type LayerI18nPatch = Partial<Record<LocaleKey, Partial<LayerFormLocale>>>

// ═══════════════════════
// 1. FORM NORMALIZATION
// ═══════════════════════

/**
 * Normalizes a partial locale payload into a complete layer-form locale block.
 * Used to guarantee required form keys during create and optimistic update flows.
 */
function normalizeLayerFormLocale(
  locale: Partial<LayerFormLocale> | null | undefined,
): LayerFormLocale {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
  }
}

/**
 * Converts a layer entity into the canonical layer form input payload.
 * Used to initialize create/update forms with stable defaults and normalized i18n.
 */
export function toLayerFormInput(data?: Layer | null): LayerFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        organisationId: '',
        projectId: '',
        i18n: {
          en: normalizeLayerFormLocale(undefined),
          zhHans: normalizeLayerFormLocale(undefined),
          zhHant: normalizeLayerFormLocale(undefined),
        },
        properties: [],
        isDefaultVisible: false,
        metadata: {},
      },
    }
  }

  const i18nRecord = toFormLocaleRecord(
    (data.i18n ?? null) as Record<string, unknown> | null,
  ) as LayerI18nRecord | null | undefined
  const toLocale = (locale: unknown): Partial<LayerFormLocale> | null | undefined =>
    (locale ?? null) as Partial<LayerFormLocale> | null | undefined
  return {
    meta: {
      id: data.id,
      updatedAt: data.modifiedAt,
      mode: 'update',
      isAdminRequest: true,
    },
    data: {
      organisationId: data.organisationId,
      projectId: data.projectId,
      i18n: {
        en: normalizeLayerFormLocale(toLocale(i18nRecord?.en)),
        zhHans: normalizeLayerFormLocale(toLocale(i18nRecord?.zhHans)),
        zhHant: normalizeLayerFormLocale(toLocale(i18nRecord?.zhHant)),
      },
      properties: (data.properties ?? [])
        .filter(
          (
            property,
          ): property is {
            propertyId: string
            isVisible?: boolean
            isUserContributable?: boolean
          } =>
            typeof property?.propertyId === 'string' && property.propertyId.length > 0,
        )
        .map(property => ({
          propertyId: property.propertyId,
          isVisible: Boolean(property.isVisible),
          isUserContributable: Boolean(property.isUserContributable),
        })),
      isDefaultVisible: Boolean(data.isDefaultVisible),
      metadata: data.metadata ?? {},
    },
  }
}

// ═══════════════════════
// 2. BOOLEAN TOGGLE OVERRIDES
// ═══════════════════════

/**
 * Builds an optimistic updater for a single boolean field on layer entity queries.
 * Used after publish/archive mutations to keep entity cache in sync immediately.
 */
export function overrideLayerEntityBoolean(field: LayerBooleanField, value: boolean) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

/**
 * Builds an optimistic updater for a boolean field on a specific layer list item.
 * Used to patch list caches after fast toggle actions without refetch.
 */
export function overrideLayerListItemBoolean(
  layerId: string,
  field: LayerBooleanField,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === layerId ? { ...item, [field]: value } : item,
    ),
  })
}

// ═══════════════════════
// 3. SUBMIT PAYLOAD NORMALIZATION
// ═══════════════════════

/**
 * Projects submitted property assignments to a deterministic comparable shape.
 * Used to avoid carrying incidental fields when merging submit payloads into cache.
 */
const toComparableLayerProperties = (
  value: unknown,
): Array<{
  propertyId: string
  isVisible: boolean
  isUserContributable: boolean
}> => {
  const toBoolean = (input: unknown): boolean => {
    if (typeof input === 'boolean') return input
    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase()
      if (normalized === 'true' || normalized === '1' || normalized === 'on')
        return true
      if (normalized === 'false' || normalized === '0' || normalized === 'off')
        return false
    }
    if (typeof input === 'number') return input !== 0
    return false
  }

  if (!Array.isArray(value)) return []
  return value
    .filter(
      (
        item,
      ): item is {
        propertyId: string
        isVisible?: boolean
        isUserContributable?: boolean
      } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { propertyId?: unknown }).propertyId === 'string',
    )
    .map(item => ({
      propertyId: item.propertyId,
      isVisible: toBoolean(item.isVisible),
      isUserContributable: toBoolean(item.isUserContributable),
    }))
}

/**
 * Converts submitted i18n payload into patch-ready locale fragments.
 * Used to merge partial locale updates without clobbering untouched locale fields.
 */
const toComparableLayerI18n = (value: unknown): LayerI18nPatch | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const i18nRecord = toFormLocaleRecord(value as Record<string, unknown>) as
    | LayerI18nRecord
    | null
    | undefined

  const normalizeLocalePatch = (
    locale: unknown,
  ): Partial<LayerFormLocale> | undefined => {
    if (!locale || typeof locale !== 'object') return undefined
    const source = locale as Record<string, unknown>
    const patch: Partial<LayerFormInput['data']['i18n']['en']> = {}
    if ('name' in source)
      patch.name = typeof source.name === 'string' ? source.name : ''
    if ('nameShort' in source) {
      patch.nameShort = typeof source.nameShort === 'string' ? source.nameShort : ''
    }
    if ('description' in source) {
      patch.description =
        typeof source.description === 'string' ? source.description : ''
    }
    if ('nameGen' in source && typeof source.nameGen === 'boolean') {
      patch.nameGen = source.nameGen
    }
    if ('nameShortGen' in source)
      if (typeof source.nameShortGen === 'boolean') {
        patch.nameShortGen = source.nameShortGen
      }
    if ('descriptionGen' in source) {
      if (typeof source.descriptionGen === 'boolean') {
        patch.descriptionGen = source.descriptionGen
      }
    }
    return Object.keys(patch).length > 0 ? patch : undefined
  }

  const en = normalizeLocalePatch(i18nRecord?.en)
  const zhHans = normalizeLocalePatch(i18nRecord?.zhHans)
  const zhHant = normalizeLocalePatch(i18nRecord?.zhHant)
  if (!en && !zhHans && !zhHant) return undefined

  return {
    ...(en ? { en } : {}),
    ...(zhHans ? { zhHans } : {}),
    ...(zhHant ? { zhHant } : {}),
  }
}

/**
 * Merges submitted layer form data into an existing cached layer object.
 * Used by optimistic update helpers for both entity and list query caches.
 */
const mergeLayerFromSubmit = (
  current: Record<string, unknown>,
  submittedData: LayerSubmitData,
): Record<string, unknown> => {
  const next = { ...current }
  if (typeof submittedData.projectId === 'string') {
    next.projectId = submittedData.projectId
  }
  if (typeof submittedData.organisationId === 'string') {
    next.organisationId = submittedData.organisationId
  }
  if (submittedData.i18n && typeof submittedData.i18n === 'object') {
    const submittedI18n = toComparableLayerI18n(submittedData.i18n)
    if (submittedI18n) {
      const currentI18n = (toFormLocaleRecord(
        (current.i18n ?? null) as Record<string, unknown> | null,
      ) ?? {}) as Partial<LayerFormInput['data']['i18n']>

      next.i18n = {
        ...currentI18n,
        ...(submittedI18n.en
          ? {
              en: {
                ...(currentI18n.en ?? {}),
                ...submittedI18n.en,
              },
            }
          : {}),
        ...(submittedI18n.zhHans
          ? {
              zhHans: {
                ...(currentI18n.zhHans ?? {}),
                ...submittedI18n.zhHans,
              },
            }
          : {}),
        ...(submittedI18n.zhHant
          ? {
              zhHant: {
                ...(currentI18n.zhHant ?? {}),
                ...submittedI18n.zhHant,
              },
            }
          : {}),
      }
    }
  }
  if (Array.isArray(submittedData.properties)) {
    next.properties = toComparableLayerProperties(submittedData.properties)
  }
  if (typeof submittedData.isDefaultVisible === 'boolean') {
    next.isDefaultVisible = submittedData.isDefaultVisible
  }
  if (submittedData.metadata && typeof submittedData.metadata === 'object') {
    next.metadata = submittedData.metadata
  }
  return next
}

// ═══════════════════════
// 4. SUBMIT OVERRIDES AND UPDATE TARGETS
// ═══════════════════════

/**
 * Builds an optimistic updater for a layer entity from submitted form data.
 * Used after save actions to reflect edits before server revalidation completes.
 */
export function overrideLayerEntityFromSubmit(submittedData: LayerSubmitData) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? mergeLayerFromSubmit(current.data, submittedData) : null,
  })
}

/**
 * Builds an optimistic updater for a specific layer list item from submitted data.
 * Used to keep list views consistent with pending layer edits.
 */
export function overrideLayerListItemFromSubmit(
  layerId: string,
  submittedData: LayerSubmitData,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === layerId ? mergeLayerFromSubmit(item, submittedData) : item,
    ),
  })
}

/**
 * Returns query handles that should be invalidated/revalidated after layer submit.
 * Used to centralize post-submit cache update targets for layer workflows.
 */
export function getLayerSubmitUpdates<TEntityResult, TListResult>({
  layerId,
  entityQuery,
  listQuery,
}: LayerSubmitUpdatesParams<TEntityResult, TListResult>): Array<
  TEntityResult | TListResult
> {
  if (!layerId) return []
  return [entityQuery, listQuery]
}
