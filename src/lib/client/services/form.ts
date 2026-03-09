import { toast } from 'svelte-sonner'
import { getLocale, toLocaleKey, translateI18nFields } from '$lib/i18n'
import { m } from '$lib/i18n'
import type { Component } from 'svelte'
import type { FirstClassResource } from '$lib/enums'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'
import type {
  AddUserRoleSelectionParams,
  FormHeaderController,
  GenAiField,
  GenAiStateResolverForm,
  HeaderFormActionStatus,
  FormDataUpdaterForm,
  FormSubmissionResultHandlerParams,
  I18nTranslatableField,
  RemoveUserRoleSelectionParams,
  ResetLocaleFieldsParams,
  ResolveDisplayUserRolesParams,
  ResourceFormSubmissionResultParams,
  SyncHeaderFormActionStatusParams,
  TranslateLocaleIntoEmptyFieldsParams,
  UserRoleHiddenInputAttrs,
  UpdateUserRoleSelectionParams,
  UserRoleFieldNameResolverForm,
  WireHeaderFormActionHandlersParams,
  ResourceEditorHeaderController,
  Locale,
  FacetType,
  FormBooleanValue,
  ResolveChangedRelationParams,
  ChangedRelationResolution,
  ApplyChangedRelationFieldParams,
  ResourceSubmitDraft,
  ResourceSubmitMode,
} from '$lib/types'
import type { User } from '$lib/db/zod/schema/user.types'
import type {
  OrganisationGetState,
  OrganisationRoleUser,
} from '$lib/db/zod/schema/organisation.types'

const toSubmittedCode = (data: unknown): string => {
  const code = (data as { data?: { code?: unknown } })?.data?.code
  return typeof code === 'string' ? code.trim() : ''
}

// Keep redirect helpers local to form services so tests/routes that only need
// form helpers do not eagerly import the full navigation module graph.
const shouldRedirectToSubmittedCode = ({
  adminCtx,
  data,
  success,
  isRefCode = true,
}: {
  adminCtx: Pick<AdminCtx, 'activeResourceRef'>
  data: unknown
  success: boolean
  isRefCode?: boolean
}): boolean => {
  if (!success || !isRefCode) return false
  const submittedCode = toSubmittedCode(data)
  const currentRef = adminCtx.activeResourceRef
  return (
    submittedCode.length > 0 &&
    typeof currentRef === 'string' &&
    submittedCode !== currentRef
  )
}

const navigateToSubmittedCode = ({
  adminCtx,
  resourceType,
  data,
}: {
  adminCtx: AdminCtx
  resourceType: FirstClassResource
  data: unknown
}): void => {
  const submittedCode = toSubmittedCode(data)
  if (!submittedCode) return
  void import('$lib/navigation/admin').then(({ navigateOnAdmin }) => {
    navigateOnAdmin(
      adminCtx,
      resourceType,
      submittedCode,
      adminCtx.activeFacet || undefined,
    )
  })
}

export function createCodeRefResourceResult({
  adminCtx,
  headerCtrl,
  resourceType,
  isRefCode = true,
}: {
  adminCtx: AdminCtx
  headerCtrl: FormHeaderController
  resourceType: FirstClassResource
  isRefCode?: boolean
}): {
  onSuccess: () => void
  shouldRedirect: (ctx: { data: unknown; success: boolean }) => boolean
  onRedirect: (ctx: { data: unknown }) => void
} {
  return {
    onSuccess: () => headerCtrl.setEditing(false),
    shouldRedirect: ({ data, success }) =>
      shouldRedirectToSubmittedCode({ adminCtx, data, success, isRefCode }),
    onRedirect: ({ data }) => navigateToSubmittedCode({ adminCtx, resourceType, data }),
  }
}

export function createResourceFormConfig<Input>({
  formEl,
  key,
  schema,
  data,
  submitUpdates,
  adminCtx,
  headerCtrl,
  resourceType,
  getEntity,
  refreshResource,
}: {
  formEl: HTMLFormElement | undefined
  key: string | number
  schema: StandardSchemaV1<Input, unknown>
  data: Input
  submitUpdates: (ctx: {
    data: Input
  }) => Promise<Array<RemoteQuery<any> | RemoteQueryOverride> | undefined>
  adminCtx: AdminCtx
  headerCtrl: FormHeaderController
  resourceType: FirstClassResource
  getEntity: () => { data?: Record<string, unknown> | null } | null | undefined
  refreshResource: (ctx: {
    data: Input
    shouldRedirect: boolean
    success: boolean
    issues?: unknown[]
    error?: string
    result?: unknown
  }) => Promise<void>
}): {
  formEl: HTMLFormElement | undefined
  key: string | number
  schema: StandardSchemaV1<Input, unknown>
  data: Input
  onsubmitupdates: (ctx: {
    data: Input
  }) => Promise<Array<RemoteQuery<any> | RemoteQueryOverride> | undefined>
  resourceResult: {
    onSuccess: () => void
    shouldRedirect: (ctx: { data: unknown; success: boolean }) => boolean
    onRedirect: (ctx: { data: unknown }) => void
    getEntity: () => { data?: Record<string, unknown> | null } | null | undefined
    refreshResource: (ctx: {
      data: Input
      shouldRedirect: boolean
      success: boolean
      issues?: unknown[]
      error?: string
      result?: unknown
    }) => Promise<void>
  }
} {
  return {
    formEl,
    key,
    schema,
    data,
    onsubmitupdates: submitUpdates,
    resourceResult: {
      ...createCodeRefResourceResult({
        adminCtx,
        headerCtrl,
        resourceType,
      }),
      getEntity,
      refreshResource,
    },
  }
}

export function createResourceEditorPage({
  headerCtrl,
  icon,
  facetTabs,
}: {
  headerCtrl: ResourceEditorHeaderController
  icon: unknown
  facetTabs: ReadonlyMap<FacetType, string | { label: string; icon?: Component | null }>
}): {
  syncRouteAndLoad: <T>(params: {
    ref: string
    resetFormActionsSignature: () => void
    setFacetForRef: (ref: string) => void
    load: (ref: string) => Promise<T>
    commit: (value: T) => void
  }) => () => void
  syncHeader: (params: {
    ref: string
    title: string
    lastHeaderKey: string
    setLastHeaderKey: (next: string) => void
  }) => void
  wireHeaderHandlers: (handlers: WireHeaderFormActionHandlersParams['handlers']) => void
  syncHeaderStatus: (params: SyncHeaderFormActionStatusParams) => string
  clearHeaderActions: () => void
} {
  return {
    syncRouteAndLoad: <T>({
      ref,
      resetFormActionsSignature,
      setFacetForRef,
      load,
      commit,
    }: {
      ref: string
      resetFormActionsSignature: () => void
      setFacetForRef: (ref: string) => void
      load: (ref: string) => Promise<T>
      commit: (value: T) => void
    }) => {
      let cancelled = false
      resetFormActionsSignature()
      setFacetForRef(ref)
      void load(ref).then(result => {
        if (cancelled) return
        commit(result)
      })
      return () => {
        cancelled = true
      }
    },
    syncHeader: ({ ref, title, lastHeaderKey, setLastHeaderKey }) => {
      const headerKey = `${ref}:${title}`
      if (headerKey === lastHeaderKey) return
      setLastHeaderKey(headerKey)
      headerCtrl.setHeaderForEntity(title, icon, facetTabs)
    },
    wireHeaderHandlers: handlers => {
      wireHeaderFormActionHandlers({ headerCtrl, handlers })
    },
    syncHeaderStatus: params => syncHeaderFormActionStatus(params),
    clearHeaderActions: () => {
      headerCtrl.clearFormActions()
    },
  }
}

/**
 * Ensure submit payload includes `meta` and `data`, infer/normalize `meta.mode`,
 * and populate `meta.id` for update submissions when omitted.
 */
export function prepareSubmitPayloadMeta<TData extends Record<string, unknown>>(
  payload: ResourceSubmitDraft<TData>,
  params: {
    defaultMode: ResourceSubmitMode
    resolveUpdateId?: () => string | null | undefined
  },
): ResourceSubmitDraft<TData> & {
  meta: { id?: unknown; mode: ResourceSubmitMode }
  data: TData
} {
  if (!payload.meta) payload.meta = {}
  if (!payload.data) payload.data = {} as TData

  const currentMode = payload.meta.mode
  const inferredMode: ResourceSubmitMode =
    currentMode === 'create' || currentMode === 'replace' || currentMode === 'update'
      ? currentMode
      : params.defaultMode
  payload.meta.mode = inferredMode

  if (inferredMode === 'create') {
    delete payload.meta.id
    delete (payload.meta as { updatedAt?: unknown }).updatedAt
  }

  if (inferredMode === 'update') {
    const submittedId =
      typeof payload.meta.id === 'string' ? payload.meta.id.trim() : ''
    if (!submittedId) {
      payload.meta.id = params.resolveUpdateId?.() ?? ''
    }
  }

  return payload as ResourceSubmitDraft<TData> & {
    meta: { id?: unknown; mode: ResourceSubmitMode }
    data: TData
  }
}

/**
 * Resolve relation field effective value and whether it changed versus baseline.
 */
export function resolveChangedRelation<TEffective>({
  submittedValue,
  currentValue,
  baselineValue,
  toEffective,
  toComparableEffective,
  toComparableBaseline,
  toSignature,
}: ResolveChangedRelationParams<TEffective>): ChangedRelationResolution<TEffective> {
  const effective = toEffective({ submittedValue, currentValue })
  const changed =
    toSignature(toComparableEffective(effective)) !==
    toSignature(toComparableBaseline(baselineValue))

  return {
    effective,
    changed,
  }
}

/**
 * Keep relation keys in submit payload only when they materially changed.
 */
export function applyChangedRelationField<
  TData extends Record<string, unknown>,
  TKey extends keyof TData,
  TEffective,
>({
  data,
  key,
  ...params
}: ApplyChangedRelationFieldParams<
  TData,
  TKey,
  TEffective
>): ChangedRelationResolution<TEffective> {
  const result = resolveChangedRelation(params)
  if (result.changed) {
    data[key] = result.effective as TData[TKey]
  } else {
    delete data[key]
  }
  return result
}

export function guardRefDesync(
  organisationState: OrganisationGetState,
  committedOrganisationState: OrganisationGetState,
  ref: string,
): boolean {
  const entityCode = organisationState?.data?.code
  const committedCode = committedOrganisationState?.data?.code
  return (
    typeof entityCode === 'string' &&
    typeof committedCode === 'string' &&
    entityCode === ref &&
    committedCode === ref
  )
}

export async function handleSubmissionResult({
  success,
  issues,
  error,
  onSuccess,
  onError,
  onInvalid,
  onFallback,
}: FormSubmissionResultHandlerParams): Promise<void> {
  if (success) {
    await onSuccess()
    return
  }

  if (error) {
    await onError(error)
    return
  }

  if ((issues?.length ?? 0) > 0) {
    await onInvalid(issues ?? [])
    return
  }

  await onFallback()
}

export async function handleResourceFormSubmissionResult({
  success,
  issues,
  error,
  nameKey,
  onSuccess,
  refreshResource,
  submittedValues,
  invalidMessage = m.forms__invalid(),
  fallbackErrorMessage = m.long_crazy_peacock_care(),
  successPrefix = m.tidy_game_jellyfish_pop(),
}: ResourceFormSubmissionResultParams): Promise<void> {
  const asTrimmedString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : ''
  const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
  const toIssueParts = (message: string): { code: string; detail: string } => {
    const [rawCode, ...rest] = message.split(':')
    const code = (rawCode ?? '').trim()
    const detail = rest.join(':').trim()
    if (!code) return { code: invalidMessage, detail: message }
    if (!detail) return { code, detail: invalidMessage }
    return { code, detail }
  }
  const firstIssueMessage = (issues ?? [])
    .map(issue =>
      issue && typeof issue === 'object' && 'message' in issue
        ? asTrimmedString((issue as { message?: unknown }).message)
        : '',
    )
    .find(Boolean)

  const submittedRoot = asRecord(submittedValues)
  const submittedData = asRecord(submittedRoot?.data)
  const getSubmittedNameAtLocale = (localeKey: string, field: string): string => {
    const i18nByLocale = asRecord(submittedData?.i18n)
    const localeValues = asRecord(i18nByLocale?.[localeKey])
    return asTrimmedString(localeValues?.[field])
  }
  const getSubmittedName = (field: string): string =>
    getSubmittedNameAtLocale(toLocaleKey(getLocale()), field) ||
    asTrimmedString(submittedData?.[field]) ||
    asTrimmedString(submittedRoot?.[field])

  if (success) {
    const name = getSubmittedName(nameKey)
    toast.success(`${successPrefix}${name ? ` ${name}` : ''}`)
    await refreshResource()
    await onSuccess?.()
    return
  }

  if (error) {
    toast.error(error)
    return
  }

  if ((issues?.length ?? 0) > 0) {
    if (firstIssueMessage) {
      const { code, detail } = toIssueParts(firstIssueMessage)
      toast.error(code, { description: detail })
      return
    }
    toast.error(invalidMessage)
    return
  }

  toast.error(fallbackErrorMessage)
}

export function wireHeaderFormActionHandlers({
  headerCtrl,
  handlers,
}: WireHeaderFormActionHandlersParams): void {
  headerCtrl.setFormActions(handlers)
}

export function toHeaderFormActionStatusSignature(
  status: HeaderFormActionStatus,
): string {
  return `${status.dirty}|${status.isSubmitting}|${status.hasIssues}|${status.isPublished}|${status.isDeleted}|${status.canEdit}|${status.canPublish}|${status.showDeleteAction}|${status.showPublishAction}`
}

export function syncHeaderFormActionStatus({
  headerCtrl,
  status,
  lastSignature,
}: SyncHeaderFormActionStatusParams): string {
  const signature = toHeaderFormActionStatusSignature(status)
  if (signature === lastSignature) return lastSignature
  headerCtrl.setFormActions(status)
  return signature
}

export function getNameForToast(
  entity: { data?: Record<string, unknown> | null } | null | undefined,
  key: string = 'shortName',
): string {
  const asTrimmedString = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  const data =
    entity && typeof entity === 'object'
      ? ((entity as { data?: Record<string, unknown> | null }).data ?? undefined)
      : undefined
  if (!data) return ''

  const locale = getLocale()
  const i18n =
    data && typeof data === 'object'
      ? ((data as Record<string, unknown>).i18n as
          | Record<string, Record<string, unknown>>
          | undefined)
      : undefined

  const byLocale = asTrimmedString(i18n?.[locale]?.[key])
  if (byLocale) return byLocale

  const byRoot = asTrimmedString((data as Record<string, unknown>)[key])
  if (byRoot) return byRoot

  return asTrimmedString((data as Record<string, unknown>).code)
}

export function toIssueMessage(issue: unknown): string | null {
  if (!issue || typeof issue !== 'object' || !('message' in issue)) return null
  const message = (issue as { message?: unknown }).message
  return typeof message === 'string' ? message : null
}

export function getIssueMessagesForPath(
  issues: unknown[] | undefined,
  path: Array<string | number>,
): string[] | undefined {
  if (!Array.isArray(issues) || path.length === 0) return undefined
  const messages = issues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const issuePath = (issue as { path?: unknown }).path
      if (!Array.isArray(issuePath) || issuePath.length !== path.length) return false
      return path.every((segment, index) => issuePath[index] === segment)
    })
    .map(toIssueMessage)
    .filter((message): message is string => Boolean(message))

  return messages.length > 0 ? messages : undefined
}

export function isFormLevelIssue(issue: unknown): boolean {
  if (!issue || typeof issue !== 'object' || !('path' in issue)) return true
  const path = (issue as { path?: unknown }).path
  // Issues with related models are treated as form-level issues.
  if (!Array.isArray(path) || path.length === 0) return true
  return path[0] === 'data' && (path[1] === 'userRoles' || path[1] === 'organisationId')
}

const toIssuePathSegments = (issue: unknown): string[] => {
  if (!issue || typeof issue !== 'object' || !('path' in issue)) return []
  const path = (issue as { path?: unknown }).path
  if (!Array.isArray(path)) return []
  return path.map(segment => String(segment))
}

const toIssueFieldNameCandidates = (issue: unknown): string[] => {
  const segments = toIssuePathSegments(issue)
  if (segments.length === 0) return []

  const dot = segments.join('.')
  const bracket = segments.reduce((acc, segment, index) => {
    if (index === 0) return segment
    return /^\d+$/u.test(segment) ? `${acc}[${segment}]` : `${acc}.${segment}`
  }, '')

  return Array.from(new Set([dot, bracket]))
}

const collectFacetFieldNames = (
  formEl: HTMLFormElement,
  supportedFacets: Set<FacetType>,
): Map<FacetType, Set<string>> => {
  const namesByFacet = new Map<FacetType, Set<string>>()
  const facetSections = formEl.querySelectorAll<HTMLElement>('[data-facet-id]')

  for (const section of Array.from(facetSections)) {
    const rawFacet = section.dataset.facetId
    if (!rawFacet || !supportedFacets.has(rawFacet as FacetType)) continue
    const facet = rawFacet as FacetType
    const names = namesByFacet.get(facet) ?? new Set<string>()
    const controls = section.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input[name], select[name], textarea[name]')
    for (const control of Array.from(controls)) {
      if (!control.name) continue
      names.add(control.name)
    }
    namesByFacet.set(facet, names)
  }

  return namesByFacet
}

const toFacetFromIssuePath = (
  issue: unknown,
  supportedFacets: Set<FacetType>,
  facetFieldNames: Map<FacetType, Set<string>>,
): FacetType => {
  const candidates = toIssueFieldNameCandidates(issue)
  if (candidates.length > 0) {
    for (const [facet, names] of Array.from(facetFieldNames.entries())) {
      if (!supportedFacets.has(facet)) continue
      const hasMatch = candidates.some(candidate =>
        Array.from(names).some(
          name =>
            name === candidate ||
            name.startsWith(`${candidate}.`) ||
            name.startsWith(`${candidate}[`),
        ),
      )
      if (hasMatch) return facet
    }
  }

  return supportedFacets.has('core')
    ? 'core'
    : (Array.from(supportedFacets)[0] ?? 'core')
}

export function resolveFacetIssueSummary(params: {
  issues: unknown[] | null | undefined
  facets: Map<FacetType, unknown>
  formEl?: HTMLFormElement
}): {
  firstFacetWithIssues: FacetType | null
  facetsWithIssues: Set<FacetType>
} {
  const supportedFacets = new Set(Array.from(params.facets.keys()))
  const facetFieldNames =
    params.formEl != null
      ? collectFacetFieldNames(params.formEl, supportedFacets)
      : new Map<FacetType, Set<string>>()
  const facetsWithIssues = new Set<FacetType>()
  let firstFacetWithIssues: FacetType | null = null

  for (const issue of params.issues ?? []) {
    const facet = toFacetFromIssuePath(issue, supportedFacets, facetFieldNames)
    if (!supportedFacets.has(facet)) continue
    if (!firstFacetWithIssues) firstFacetWithIssues = facet
    facetsWithIssues.add(facet)
  }

  return { firstFacetWithIssues, facetsWithIssues }
}

export function withFacetIssueIndicators(
  facets: Map<FacetType, { label: string; icon?: Component | null }>,
  facetsWithIssues: Set<FacetType>,
): Map<FacetType, { label: string; icon?: Component | null; hasIssues?: boolean }> {
  return new Map(
    Array.from(facets.entries()).map(([facet, config]) => [
      facet,
      {
        ...config,
        hasIssues: facetsWithIssues.has(facet),
      },
    ]),
  )
}

export function toIssueChipParts(message: string): { code: string; detail: string } {
  const parts = message.split(':')
  if (parts.length < 2) return { code: 'INVALID', detail: message }
  const code = parts[0]?.trim() || 'INVALID'
  const detail = parts.slice(1).join(':').trim() || message
  return { code, detail }
}

export function getRoleFieldNameByUserId(
  form: UserRoleFieldNameResolverForm,
): Record<string, string> {
  const userRoles = form.fields.value().data?.userRoles ?? []
  const roleFields = form.fields.data?.userRoles ?? []

  return Object.fromEntries(
    userRoles.map((userRole, index) => [
      userRole.userId,
      roleFields[index]?.role?.as('select').name ?? '',
    ]),
  )
}

export function revalidateAfterSubmitAttempt(params: {
  wasSubmitAttempted: boolean
  validate: () => Promise<unknown>
}): boolean {
  if (!params.wasSubmitAttempted) return false
  void params.validate()
  return true
}

export function getUserRoleHiddenInputAttrs(
  form: UserRoleFieldNameResolverForm,
  userRoles: Array<{ userId: string }>,
): UserRoleHiddenInputAttrs[] {
  const roleFields = form.fields.data?.userRoles ?? []
  return userRoles
    .map((userRole, index) => roleFields[index]?.userId?.as('hidden', userRole.userId))
    .filter((attrs): attrs is UserRoleHiddenInputAttrs => Boolean(attrs))
}

/* ----------------- */
// GEN-AI HELPERS
/* -------- */

export function getGenAiState(
  form: GenAiStateResolverForm,
  locale: Locale,
  field: GenAiField,
): boolean {
  const formLocale = toLocaleKey(locale)
  const localeData = form.fields.value().data?.i18n?.[formLocale]
  if (!localeData) return false
  if (field === 'name') return Boolean(localeData.nameGen)
  if (field === 'nameShort') return Boolean(localeData.nameShortGen)
  if (field === 'description') return Boolean(localeData.descriptionGen)
  if (field === 'license') return Boolean(localeData.licenseGen)
  return Boolean(localeData.attributionGen)
}

export function toggleGenAiField<
  T extends {
    i18n?: Record<
      string,
      {
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
        licenseGen?: FormBooleanValue
        attributionGen?: FormBooleanValue
      }
    >
  },
>(form: FormDataUpdaterForm<T>, locale: Locale, field: GenAiField): void {
  updateFormData(form, data => {
    const formLocaleKey = toLocaleKey(locale)
    if (!data.i18n?.[formLocaleKey]) return data
    const fieldName = `${field}Gen` as
      | 'nameGen'
      | 'nameShortGen'
      | 'descriptionGen'
      | 'licenseGen'
      | 'attributionGen'
    const nextValue = !data.i18n[formLocaleKey][fieldName]
    data.i18n[formLocaleKey][fieldName] = nextValue
    return data
  })
}

/* ----------------- */
// I18N HELPERS
/* -------- */

const DEFAULT_TRANSLATABLE_FIELDS: I18nTranslatableField[] = [
  'name',
  'nameShort',
  'description',
]

const toGenField = (field: I18nTranslatableField): `${I18nTranslatableField}Gen` =>
  `${field}Gen`

export async function translateLocaleIntoEmptyFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        license?: string
        attribution?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
        licenseGen?: FormBooleanValue
        attributionGen?: FormBooleanValue
      }
    >
  },
>({
  form,
  sourceLocale,
  targetLocale,
  fields = DEFAULT_TRANSLATABLE_FIELDS,
}: TranslateLocaleIntoEmptyFieldsParams<TFormData>): Promise<boolean> {
  const currentFormData = form.fields.value().data
  if (!currentFormData?.i18n) return false

  const localeKeyMap: Record<Locale, string> = {
    en: 'en',
    'zh-hans': 'zhHans',
    'zh-hant': 'zhHant',
  }
  const targetFormLocale = toLocaleKey(targetLocale)
  const targetLocaleData = currentFormData.i18n?.[targetFormLocale]
  if (!targetLocaleData) return false

  const fieldsToTranslate = fields.filter(field => {
    const currentValue = targetLocaleData[field]
    return !(typeof currentValue === 'string' && currentValue.trim().length > 0)
  })
  if (fieldsToTranslate.length === 0) return false

  const i18n = {
    en: Object.fromEntries(
      fieldsToTranslate.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap.en]?.[field] ?? '',
      ]),
    ),
    'zh-hans': Object.fromEntries(
      fieldsToTranslate.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap['zh-hans']]?.[field] ?? '',
      ]),
    ),
    'zh-hant': Object.fromEntries(
      fieldsToTranslate.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap['zh-hant']]?.[field] ?? '',
      ]),
    ),
  }

  const translated = await translateI18nFields({
    source: sourceLocale,
    target: targetLocale,
    fields: fieldsToTranslate,
    i18n,
  })

  updateFormData(form, data => {
    const targetLocaleData = data.i18n?.[targetFormLocale]
    if (!targetLocaleData) return data

    for (const field of fieldsToTranslate) {
      const currentValue = targetLocaleData[field]
      if (typeof currentValue === 'string' && currentValue.trim().length > 0) continue
      const nextValue = translated[field] ?? ''
      targetLocaleData[field] = nextValue
      if (nextValue.trim().length > 0) {
        targetLocaleData[toGenField(field)] = true
      }
    }
    return data
  })

  return true
}

export function resetLocaleFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        license?: string
        attribution?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
        licenseGen?: FormBooleanValue
        attributionGen?: FormBooleanValue
      }
    >
  },
>({
  form,
  targetLocale,
  fields = DEFAULT_TRANSLATABLE_FIELDS,
}: ResetLocaleFieldsParams<TFormData>): void {
  updateFormData(form, data => {
    const targetFormLocale = toLocaleKey(targetLocale)
    const targetLocaleData = data.i18n?.[targetFormLocale]
    if (!targetLocaleData) return data

    for (const field of fields) {
      targetLocaleData[field] = ''
      targetLocaleData[toGenField(field)] = false
    }
    return data
  })
}

export function updateFormData<T>(
  form: FormDataUpdaterForm<T>,
  updater: (data: T) => T,
): void {
  const current = form.fields.value()
  if (!current.data) return
  let clonedData: T
  try {
    clonedData = structuredClone(current.data)
  } catch {
    // Svelte proxy-backed objects may fail structuredClone.
    clonedData = JSON.parse(JSON.stringify(current.data)) as T
  }
  form.fields.set({
    ...current,
    data: updater(clonedData),
  })
}

export function resolveDisplayUserRoles<
  TUserRole extends { userId: string; role: string },
>({ baseRoles, formUserRoles }: ResolveDisplayUserRolesParams<TUserRole>): TUserRole[] {
  const roleByUserId = new Map(
    formUserRoles.map(userRole => [userRole.userId, userRole.role] as const),
  )

  return baseRoles.map(userRole => ({
    ...userRole,
    role: (roleByUserId.get(userRole.userId) ?? userRole.role) as TUserRole['role'],
  }))
}

export function guardUserRolesDesync({
  baseRoles,
  formUserRoles,
  organisationId,
  usersById,
}: {
  baseRoles: OrganisationRoleUser[]
  formUserRoles: Array<{ userId: string; role: string }>
  organisationId?: string | null
  usersById?: Record<string, User>
}): OrganisationRoleUser[] {
  const baseRoleByUserId = new Map(
    baseRoles.map(userRole => [userRole.userId, userRole]),
  )

  return formUserRoles.flatMap(formUserRole => {
    const baseRole = baseRoleByUserId.get(formUserRole.userId)
    if (baseRole) {
      return [
        {
          ...baseRole,
          role: formUserRole.role as OrganisationRoleUser['role'],
        },
      ]
    }

    const selectedUser = usersById?.[formUserRole.userId]
    const fallbackUser: User = {
      id: formUserRole.userId,
      name: formUserRole.userId,
      username: formUserRole.userId,
      email: '',
      image: null,
      attribution: '',
      locale: 'en',
      preferences: {
        fallbackLocales: ['en'],
        allowMachineTranslation: false,
        preferFallbackInCurrentLocale: false,
        isTranslateButtonVisible: true,
        admin: {},
      },
      experimental: null,
      isAnonymous: false,
      contributedFeatures: {},
      contributedImages: {},
      reportedMissingCount: 0,
      newPhotoCount: 0,
      newFeatureCount: 0,
      roles: [],
      createdAt: new Date(0),
      modifiedAt: new Date(0),
    }
    const resolvedUser = selectedUser ?? fallbackUser

    return [
      {
        organisationId: organisationId ?? '',
        userId: formUserRole.userId,
        role: formUserRole.role as OrganisationRoleUser['role'],
        user: {
          id: resolvedUser.id,
          name: resolvedUser.name,
          image: resolvedUser.image,
          attribution: resolvedUser.attribution,
        },
      } as OrganisationRoleUser,
    ]
  })
}

/* ----------------- */
// ENTITY HELPERS
/* -------- */

export function toggleEntityDataBoolean<
  TEntity extends { data?: Record<string, unknown> | null } | null,
>(entity: TEntity, key: string, nextChecked: boolean | null): TEntity {
  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      [key]: Boolean(nextChecked),
    },
  } as TEntity
}

export function addUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  user,
  defaultRole,
  foreignKey,
}: AddUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    const existing = data.userRoles ?? []
    if (existing.some(userRole => userRole.userId === user.id)) return data
    data.userRoles = [...existing, { userId: user.id, role: defaultRole }]
    return data
  })

  if (!entity?.data) return entity
  const entityData = entity.data
  const existingEntityRoles =
    (entityData.userRoles as Array<Record<string, unknown>>) ?? []
  if (existingEntityRoles.some(userRole => userRole.userId === user.id)) return entity

  return {
    ...entity,
    data: {
      ...entityData,
      userRoles: [
        ...existingEntityRoles,
        {
          [foreignKey]: entityData.id,
          userId: user.id,
          role: defaultRole,
          user: {
            id: user.id,
            name: user.name,
            image: user.image,
            attribution: user.attribution,
          },
        },
      ],
    },
  } as TEntity
}

export function removeUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  userId,
}: RemoveUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    data.userRoles = (data.userRoles ?? []).filter(
      userRole => userRole.userId !== userId,
    )
    return data
  })

  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      userRoles: (
        (entity.data.userRoles as Array<Record<string, unknown>>) ?? []
      ).filter(userRole => userRole.userId !== userId),
    },
  } as TEntity
}

export function updateUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  userId,
  role,
}: UpdateUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    data.userRoles = (data.userRoles ?? []).map(userRole =>
      userRole.userId === userId ? { ...userRole, role } : userRole,
    )
    return data
  })

  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      userRoles: ((entity.data.userRoles as Array<Record<string, unknown>>) ?? []).map(
        userRole => (userRole.userId === userId ? { ...userRole, role } : userRole),
      ),
    },
  } as TEntity
}
