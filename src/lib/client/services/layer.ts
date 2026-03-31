import type { ParentSectionProjectItem } from '$lib/bits'
import { getI18n, m, normalizeI18nLocaleRecord, toFormLocaleRecord } from '$lib/i18n'
import {
  resolveLayerActionPermissions,
  resolveLayerProjectSelectionScope,
  toLayerAuthActor,
} from '$lib/api/services/authz'
import type { LayerProjectSelectionScope } from '$lib/api/services/authz/layer'
import { updateFormData } from '$lib/client/services/form'
import {
  overrideResourceEntityBoolean,
  overrideResourceListItemBoolean,
} from '$lib/client/services/resource'
import type {
  LayerEditorPermissions,
  LayerFormLocale,
  LayerFormPayload,
  LayerFormPropertyRow,
  LayerI18nPatch,
  LayerI18nRecord,
  LayerParentProjectFormData,
  LayerPropertyRow,
  ResolvedLayerProperty,
} from '$lib/client/services/layer.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'
import type {
  Layer,
  LayerBooleanField,
  LayerFormInput,
  LayerGetState,
  LayerPropertyPartialExtra,
  LayerSubmitData,
  LayerSubmitUpdatesParams,
} from '$lib/db/zod/schema/layer.types'
import type { FormDataUpdaterForm, Locale } from '$lib/types'
import Blend from 'virtual:icons/lucide/blend'
import TypeIcon from 'virtual:icons/lucide/type'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FORM NORMALIZATION
//    - normalizeLayerFormLocale
//    - toLayerFormInput
//
// 2. PARENT PROJECT STATE
//    - getCurrentLayerFormData
//    - toSelectedParentProject
//    - toHiddenParentProjectInputAttrs
//    - replaceLayerParentProject
//    - toLayerParentProjectSearchQueries
//
// 3. PERMISSIONS + FIELD PRESENTATION
//    - resolveLayerEditorPermissions
//    - toLayerPropertyRows
//    - mergeProjectPropertiesIntoLayerForm
//
// 4. BOOLEAN TOGGLE OVERRIDES
//    - overrideLayerEntityBoolean
//    - overrideLayerListItemBoolean
//
// 5. SUBMIT PAYLOAD NORMALIZATION
//    - toComparableLayerProperties
//    - toComparableLayerI18n
//    - mergeLayerFromSubmit
//
// 6. SUBMIT OVERRIDES AND UPDATE TARGETS
//    - overrideLayerEntityFromSubmit
//    - overrideLayerListItemFromSubmit
//    - getLayerSubmitUpdates

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
// 2. PARENT PROJECT STATE
// ═══════════════════════

/**
 * Reads the current layer form payload regardless of whether the updater exposes
 * nested `data` fields or a flattened intermediate shape.
 * Used by layer editor helpers so page code does not need to repeat form-shape
 * fallbacks while reading parent project state.
 */
export function getCurrentLayerFormData(
  form: FormDataUpdaterForm<LayerFormPayload>,
): LayerParentProjectFormData {
  const formValue = form.fields.value() as {
    data?: LayerFormPayload
    projectId?: string
    organisationId?: string
    i18n?: Record<string, unknown>
  }
  const nested = formValue.data
  if (nested && typeof nested === 'object') return nested

  return {
    projectId: formValue.projectId,
    organisationId: formValue.organisationId,
    i18n: formValue.i18n,
  }
}

/**
 * Resolves the active parent project for the editor from selection state, live
 * form data, persisted entity data, and cached project records.
 * Used by the page to keep parent-project presentation stable while editing.
 */
export function toSelectedParentProject(params: {
  form: FormDataUpdaterForm<LayerFormPayload>
  layer: LayerGetState
  selectedParentProjectById: Record<string, ParentSectionProjectItem>
  projectCache: Map<string, Project>
}): ParentSectionProjectItem | null {
  const formData = getCurrentLayerFormData(params.form)
  const projectId = (formData.projectId ?? params.layer?.data?.projectId ?? null) as
    | string
    | null
  if (!projectId) return null

  const selected = params.selectedParentProjectById[projectId]
  if (selected) return selected

  const cachedProject = params.projectCache.get(projectId)
  if (!cachedProject) return null

  return {
    id: cachedProject.id,
    organisationId: cachedProject.organisationId,
    code: cachedProject.code,
    i18n: cachedProject.i18n,
    image: (cachedProject.image ?? null) as ParentSectionProjectItem['image'],
  }
}

/**
 * Produces the hidden parent-project input attrs from the best available project id.
 * Used to keep the parent project identifier mounted in the DOM even when selection
 * state is coming from cache or committed entity data.
 */
export function toHiddenParentProjectInputAttrs(params: {
  form: FormDataUpdaterForm<LayerFormPayload>
  selectedParentProject: ParentSectionProjectItem | null
  layer: LayerGetState
  committedLayer: LayerGetState
  toHiddenInput: (projectId: string) => Record<string, unknown> | null | undefined
}): Record<string, unknown> | null {
  const formData = getCurrentLayerFormData(params.form)
  const selectedProjectId = params.selectedParentProject?.id
  const layerProjectId = params.layer?.data?.projectId
  const committedProjectId = params.committedLayer?.data?.projectId
  const projectId = (
    selectedProjectId ??
    formData.projectId ??
    layerProjectId ??
    committedProjectId ??
    ''
  ).trim()
  if (!projectId) return null
  return params.toHiddenInput(projectId) ?? null
}

/**
 * Applies a chosen parent project to the layer form and returns the next
 * selection map keyed by project id.
 * Used by the page to centralize parent replacement behavior and keep the form
 * updater logic out of the route file.
 */
export function replaceLayerParentProject(params: {
  form: FormDataUpdaterForm<LayerFormPayload>
  project: ParentSectionProjectItem
}): Record<string, ParentSectionProjectItem> {
  updateFormData(params.form, data => {
    data.projectId = params.project.id
    data.organisationId = params.project.organisationId
    return data
  })

  return {
    [params.project.id]: params.project,
  }
}

/**
 * Builds the project search query plan for the layer parent-project picker.
 * Used to keep scope-based project search branching out of the page while still
 * letting the route orchestrate the actual remote calls.
 */
export function toLayerParentProjectSearchQueries<
  TBase extends Record<string, unknown>,
>(params: {
  scope: LayerProjectSelectionScope
  baseParams: TBase
}): Array<TBase & { conditions: Record<string, unknown> }> {
  if (!params.scope.canCreate) return []

  if (params.scope.allowAll) {
    return [
      {
        ...params.baseParams,
        conditions: { isArchived: null, isPublished: null },
      },
    ]
  }

  const queries: Array<TBase & { conditions: Record<string, unknown> }> = []

  if (params.scope.allowedProjectIds.length > 0) {
    queries.push({
      ...params.baseParams,
      conditions: {
        id: params.scope.allowedProjectIds,
        isArchived: null,
        isPublished: null,
      },
    })
  }

  if (params.scope.allowedOrganisationIds.length > 0) {
    queries.push({
      ...params.baseParams,
      conditions: {
        organisationId: params.scope.allowedOrganisationIds,
        isArchived: null,
        isPublished: null,
      },
    })
  }

  if (params.scope.allowedHubIds.length > 0) {
    queries.push({
      ...params.baseParams,
      conditions: {
        hubId: params.scope.allowedHubIds,
        isArchived: null,
        isPublished: null,
      },
    })
  }

  return queries
}

// ═══════════════════════
// 3. PERMISSIONS + FIELD PRESENTATION
// ═══════════════════════

/**
 * Resolves the current layer editor permission flags from actor state, prism
 * fallback state, cached project/organisation records, and persisted layer data.
 * Used by layer editor routes so UI permission decisions stay in one place.
 */
export function resolveLayerEditorPermissions(params: {
  currentUser: unknown
  layer: LayerGetState
  form: FormDataUpdaterForm<LayerFormPayload>
  prismProjectId?: string | null
  prismOrganisationId?: string | null
  resourceHubId?: string | null
  projectCache: Map<string, Project>
  organisationCache: Map<string, { hubId?: string | null }>
}): LayerEditorPermissions {
  const actor = toLayerAuthActor((params.currentUser ?? {}) as Record<string, unknown>)
  const layerCreateScope = resolveLayerProjectSelectionScope({
    actor,
    resourceHubId: params.resourceHubId ?? null,
  })
  const layerData = params.layer?.data
  const formData = getCurrentLayerFormData(params.form)
  const projectId = (layerData?.projectId ??
    formData.projectId ??
    params.prismProjectId ??
    null) as string | null
  const projectData = projectId ? params.projectCache.get(projectId) : undefined
  const organisationId = (layerData?.organisationId ??
    formData.organisationId ??
    projectData?.organisationId ??
    params.prismOrganisationId ??
    null) as string | null
  const organisationData = organisationId
    ? params.organisationCache.get(organisationId)
    : undefined
  const resolvedHubId = organisationData?.hubId ?? null
  const resolvedResource =
    layerData ??
    (projectId && organisationId
      ? {
          id: '',
          organisationId,
          projectId,
          hubId: resolvedHubId,
        }
      : null)

  if (!resolvedResource) {
    return {
      canEditI18n: layerCreateScope.canCreate,
      canEditFields: layerCreateScope.canCreate,
      canPublish: false,
      canArchive: false,
    }
  }

  return resolveLayerActionPermissions({
    actor,
    resource: {
      id: resolvedResource.id,
      organisationId: resolvedResource.organisationId,
      projectId: resolvedResource.projectId,
      hubId: resolvedHubId,
    },
  })
}

/**
 * Shapes current layer property assignments into card-ready view models.
 * Used by the editor page so property lookup, i18n fallback, scope labeling,
 * icon selection, and sort order live in one reusable helper.
 */
export function toLayerPropertyRows(params: {
  form: FormDataUpdaterForm<LayerFormPayload>
  layer: LayerGetState
  propertyCache: Map<string, Property>
  hubCodeById: (hubId: string) => string | null
  userPreferences: UserPreferences
}): LayerPropertyRow[] {
  const formProperties = (params.form.fields.value().data?.properties ??
    []) as Array<LayerPropertyPartialExtra>
  const rows: LayerPropertyRow[] = []

  for (const [index, property] of formProperties.entries()) {
    if (!property?.propertyId) continue
    const persistedProperty = (params.layer?.data?.properties ?? []).find(
      candidate => candidate.propertyId === property.propertyId,
    )
    const cachedProperty = params.propertyCache.get(property.propertyId)
    const persistedResolvedProperty = persistedProperty?.property as
      | ResolvedLayerProperty
      | undefined
    const resolvedProperty: ResolvedLayerProperty | undefined =
      persistedResolvedProperty ?? cachedProperty

    if (!resolvedProperty) continue

    const normalizedI18n = resolvedProperty.i18n
      ? normalizeI18nLocaleRecord(
          resolvedProperty.i18n as Record<string, Record<string, unknown>>,
        )
      : undefined

    const name = normalizedI18n
      ? getI18n(
          {
            i18n: normalizedI18n as Record<Locale, Record<string, unknown>>,
          },
          'label',
          params.userPreferences,
          resolvedProperty.key,
        )
      : resolvedProperty.key

    const scopeValue =
      resolvedProperty.scope === 'organisation' ||
      resolvedProperty.scope === 'hub' ||
      resolvedProperty.scope === 'project'
        ? resolvedProperty.scope
        : 'project'
    const scopeLabel: 'global' | 'hub' | 'org' | 'project' =
      scopeValue === 'organisation'
        ? 'org'
        : scopeValue === 'project'
          ? 'project'
          : (() => {
              if (resolvedProperty.hubId) {
                const hubCode = params.hubCodeById(resolvedProperty.hubId)
                if (hubCode && hubCode !== 'core') return 'hub'
              }
              return 'global'
            })()
    const scopeTone: 'global' | 'hub' | 'org' | 'project' =
      scopeLabel === 'org'
        ? 'org'
        : scopeLabel === 'hub'
          ? 'hub'
          : scopeLabel === 'global'
            ? 'global'
            : 'project'

    rows.push({
      index,
      propertyId: property.propertyId,
      isVisible: Boolean(property.isVisible),
      isUserContributable: Boolean(property.isUserContributable),
      type: resolvedProperty.type,
      name,
      rank:
        typeof cachedProperty?.rank === 'number' && Number.isFinite(cachedProperty.rank)
          ? cachedProperty.rank
          : typeof persistedResolvedProperty?.rank === 'number' &&
              Number.isFinite(persistedResolvedProperty.rank)
            ? persistedResolvedProperty.rank
            : Number.POSITIVE_INFINITY,
      scopeLabel,
      scopeTone,
      typeIconComponent: resolvedProperty.type === 'classifier' ? Blend : TypeIcon,
      typeIconTitle:
        resolvedProperty.type === 'classifier'
          ? m.admin__forms_common_categorical_field()
          : m.admin__forms_common_free_form_field(),
    })
  }

  return rows.sort((left, right) => {
    if (left.isVisible !== right.isVisible) return left.isVisible ? -1 : 1

    if (left.isVisible && right.isVisible) {
      if (left.rank !== right.rank) return left.rank - right.rank
      return left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
      })
    }

    const specificityRank = (scope: 'global' | 'hub' | 'org' | 'project'): number =>
      scope === 'project' ? 0 : scope === 'org' ? 1 : scope === 'hub' ? 2 : 3

    const leftSpecificity = specificityRank(left.scopeLabel)
    const rightSpecificity = specificityRank(right.scopeLabel)
    if (leftSpecificity !== rightSpecificity) return leftSpecificity - rightSpecificity

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

/**
 * Replaces the layer form property rows with the effective project property set,
 * preserving any user toggles already present for matching property ids.
 * Used by the layer editor when the parent project changes or when reset needs
 * to restore inherited project properties into the form state.
 */
export function mergeProjectPropertiesIntoLayerForm(params: {
  form: FormDataUpdaterForm<LayerFormPayload>
  projectProperties: Property[]
}): void {
  const effectiveLayerProperties = params.projectProperties.filter(property => {
    if (!property?.id || typeof property.id !== 'string') return false
    if (property.scope === 'project') return true
    return typeof (property as Property & { isEnabled?: boolean }).isEnabled ===
      'boolean'
      ? Boolean((property as Property & { isEnabled?: boolean }).isEnabled)
      : Boolean(property.isDefaultEnabled)
  })

  updateFormData(params.form, data => {
    const existingRows: LayerFormPropertyRow[] = Array.isArray(data.properties)
      ? data.properties
      : []
    const existingById = new Map<string, LayerFormPropertyRow>(
      existingRows
        .filter(
          (
            row,
          ): row is LayerFormPropertyRow & {
            propertyId: string
          } => typeof row?.propertyId === 'string' && row.propertyId.length > 0,
        )
        .map(row => [row.propertyId, row] as const),
    )

    data.properties = effectiveLayerProperties
      .filter(property => typeof property?.id === 'string' && property.id.length > 0)
      .map(property => {
        const existing = existingById.get(property.id)
        const defaultEnabled = Boolean(property.isDefaultEnabled)
        return {
          propertyId: property.id,
          isVisible: existing?.isVisible ?? defaultEnabled,
          isUserContributable: existing?.isUserContributable ?? defaultEnabled,
        }
      })

    return data
  })
}

// ═══════════════════════
// 4. BOOLEAN TOGGLE OVERRIDES
// ═══════════════════════

/**
 * Builds an optimistic updater for a single boolean field on layer entity queries.
 * Used after publish/archive mutations to keep entity cache in sync immediately.
 */
export function overrideLayerEntityBoolean(field: LayerBooleanField, value: boolean) {
  return overrideResourceEntityBoolean(field, value)
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
  return overrideResourceListItemBoolean(layerId, field, value)
}

// ═══════════════════════
// 5. SUBMIT PAYLOAD NORMALIZATION
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
// 6. SUBMIT OVERRIDES AND UPDATE TARGETS
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
