import { toast } from 'svelte-sonner'
import { untrack } from 'svelte'
import { getLocale, toLocaleKey, translateI18nFields } from '$lib/i18n'
import { m } from '$lib/i18n'
import type { Component } from 'svelte'
import type { FormFacetNavAction } from '$lib/bits/patterns/forms/formFacetNav'
import type { FirstClassResource } from '$lib/enums'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'
import type {
  AddUserRoleSelectionParams,
  FormHeaderController,
  FormTrimmedTextControlBlurParams,
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
  HeaderCtrlState,
  HeaderTransitionSnapshot,
  HeaderFacetItem,
  ResolveOptimisticHeaderStatusParams,
} from '$lib/types'
import type { User } from '$lib/db/zod/schema/user.types'
import type {
  OrganisationGetState,
  OrganisationRoleUser,
} from '$lib/db/zod/schema/organisation.types'

// +++ TOC
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. MUTATION
// - revalidateAfterSubmitAttempt
// - handleResourceBooleanStateToggle
// - updateFormData
// - handleTrimmedTextControlBlur
//
// 1. NAVIGATION
// - toSubmittedCode
// - shouldRedirectToSubmittedCode
// - navigateToSubmittedCode
// - createCodeRefResourceResult
// - getAdjacentFacet
// - createFacetNavActionBuilder
//
// 2. RESOURCE EDITOR FACTORIES
// - createResourceFormConfig
// - createResourceEditorPage
// - focusFacetFromHash
//
// 3. SUBMIT PAYLOAD NORMALIZATION
// - prepareSubmitPayloadMeta
// - resolveChangedRelation
// - applyChangedRelationField
// - guardRefDesync
//
// 4. SUBMISSION RESULT HANDLERS
// - handleSubmissionResult
// - handleResourceFormSubmissionResult
//
// 5. HEADER FORM ACTIONS
// - wireHeaderFormActionHandlers
// - toHeaderFormActionStatusSignature
// - syncHeaderFormActionStatus
//
// 6. OPTIMISTIC HEADER UPDATE
// - captureHeaderTransitionSnapshot
// - resolveOptimisticHeaderFacets
// - resolveOptimisticHeaderStatus
//
// 7. ISSUE MESSAGES
// - toIssueMessage
// - toUniqueIssueMessages
// - isFormLevelIssue
// - toFormLevelIssueMessages
// - toIssueChipParts
//
// 8. ISSUE FACETS
// - toIssuePathSegments
// - toIssueFieldNameCandidates
// - collectFacetFieldNames
// - toFacetFromIssuePath
// - resolveFacetIssueSummary
// - withFacetIssueIndicators
// - resolveFacetTabsWithIssues
//
// 9. I18N HELPERS
// - getGenAiState
// - toggleGenAiField
// - toGenField
// - translateLocaleIntoEmptyFields
// - resetLocaleFields
//
// 10. USER ROLES
// - getRoleFieldNameByUserId
// - resolveDisplayUserRoles
// - guardUserRolesDesync
// - getUserRoleHiddenInputAttrs
// - addUserRoleSelection
// - removeUserRoleSelection
// - updateUserRoleSelection
// ---
/********************
 *  0. MUTATION
 ************/
// +++ Mutation
/**
 * Triggers form validation only after the user has already attempted a submit.
 * Used by programmatic form changes so editors avoid noisy validation before first submit.
 *
 * @param params Submit-attempt flag and validation callback.
 * @returns `true` when validation was triggered.
 */
export function revalidateAfterSubmitAttempt(params: {
  wasSubmitAttempted: boolean
  validate: () => Promise<unknown>
}): boolean {
  if (!params.wasSubmitAttempted) return false
  void params.validate()
  return true
}

/**
 * Executes the common editor boolean-toggle flow: set busy, mutate, apply
 * optimistic overrides, refresh source state, and show success/error feedback.
 * Used by resource pages to keep publish/archive handlers orchestration-only.
 *
 * @param params Current entity state, mutation hooks, and optimistic handlers.
 */
export async function handleResourceBooleanStateToggle<TState>(params: {
  current: { id: string; [key: string]: unknown } | null | undefined
  field: string
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: (payload: { id: string; state: boolean }) => Promise<unknown>
  applyOptimistic: (nextState: boolean) => void
  refresh: () => Promise<TState>
  commit: (next: TState) => void
  onError?: () => void
}): Promise<void> {
  const current = params.current
  if (!current) return

  const nextState = !current[params.field]
  try {
    params.setBusy(true)
    await params.mutate({ id: current.id, state: nextState })
    params.applyOptimistic(nextState)
    params.commit(await params.refresh())
    toast.success(nextState ? params.successWhenTrue : params.successWhenFalse)
  } catch {
    params.onError?.()
  } finally {
    params.setBusy(false)
  }
}

/**
 * Applies an updater to cloned form `data` while preserving the outer form state shape.
 * Used by client-side editor helpers so nested data updates stay immutable and predictable.
 *
 * @param form Mutable form state.
 * @param updater Mutation callback applied to a cloned `data` object.
 */
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

function isTrimCapableTextControl(
  value: EventTarget | null,
): value is HTMLInputElement | HTMLTextAreaElement {
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement
}

export function handleTrimmedTextControlBlur({
  event,
  value,
  setValue,
  onValueChange,
  afterSync,
}: FormTrimmedTextControlBlurParams): void {
  const trimmedValue = value.trim()
  if (trimmedValue === value) return

  setValue(trimmedValue)

  if (isTrimCapableTextControl(event.currentTarget)) {
    event.currentTarget.value = trimmedValue
  }

  afterSync?.()
  onValueChange?.(trimmedValue)
}

// ---
/********************
 *  1. NAVIGATION
 ************/
// +++ Navigation
/**
 * Extracts a submitted `data.code` value from a resource form payload.
 * Used by redirect helpers so code-based admin editors can detect ref changes
 * without depending on resource-specific form shapes.
 *
 * @param data Submitted payload or result data.
 * @returns The trimmed submitted code, or an empty string when unavailable.
 */
const toSubmittedCode = (data: unknown): string => {
  const code = (data as { data?: { code?: unknown } })?.data?.code
  return typeof code === 'string' ? code.trim() : ''
}

/**
 * Determines whether a successful submit should redirect to a newly submitted code ref.
 * Used by code-based admin editors so renaming a resource code updates the route.
 *
 * @param params Redirect decision inputs.
 * @returns `true` when the submitted code differs from the current route ref.
 */
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

/**
 * Navigates an admin editor to the submitted code-based resource ref.
 * Kept local so form helpers do not eagerly pull in the navigation graph.
 *
 * @param params Navigation inputs for the submitted resource.
 */
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

/**
 * Builds standard code-ref success and redirect handlers for resource forms.
 * Used by admin editors that key their routes by resource code instead of id.
 *
 * @param params Shared admin and header context for a code-ref editor.
 * @returns Standard post-submit handlers for success and redirect behavior.
 */
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

/**
 * Resolves the previous or next facet from the current visible facet order.
 * Used by admin editors so section header nav follows the active tab set.
 *
 * @param params Current facet, direction, and ordered facet list.
 * @returns The adjacent facet, or `null` when none exists.
 */
function getAdjacentFacet<TFacet extends string>({
  facet,
  direction,
  facetOrder,
}: {
  facet: TFacet
  direction: 'previous' | 'next'
  facetOrder: readonly TFacet[]
}): TFacet | null {
  const currentIndex = facetOrder.indexOf(facet)
  if (currentIndex === -1) return null

  const adjacentIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1
  return facetOrder[adjacentIndex] ?? null
}

/**
 * Creates a reusable section-header facet nav action builder for admin editors.
 * Used by resource pages to centralize previous/next facet behavior while keeping
 * page-local control over enabled tabs, labels, and resource navigation.
 *
 * @param params Getter callbacks for facet order, active facet, labels, and navigation.
 * @returns A builder for previous/next `FormFacetNavAction` objects.
 */
export function createFacetNavActionBuilder<TFacet extends string>({
  getFacetOrder,
  getFacetLabel,
  getActiveFacet,
  navigateToFacet,
}: {
  getFacetOrder: () => readonly TFacet[]
  getFacetLabel: (facet: TFacet) => string
  getActiveFacet: () => TFacet
  navigateToFacet: (facet: TFacet) => void
}): (facet: TFacet, direction: 'previous' | 'next') => FormFacetNavAction | null {
  return (facet, direction) => {
    const adjacentFacet = getAdjacentFacet({
      facet,
      direction,
      facetOrder: getFacetOrder(),
    })
    if (!adjacentFacet) return null

    return {
      text: m.admin__forms_common_set({ label: getFacetLabel(adjacentFacet) }),
      onClick: () => {
        if (adjacentFacet === getActiveFacet()) return
        navigateToFacet(adjacentFacet)
      },
    }
  }
}

// ---
/********************
 *  2. RESOURCE EDITOR FACTORIES
 ************/
// +++ Resource Editor Factories
/**
 * Produces the shared `configureForm(...)` config shape for resource editors.
 * Used to centralize form wiring, submit update hooks, and post-submit refresh behavior.
 *
 * @param params Shared form configuration inputs for one editor.
 * @returns The normalized `configureForm(...)` config object.
 */
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
  }) => Promise<Array<RemoteQuery<unknown> | RemoteQueryOverride> | undefined>
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
  }) => Promise<Array<RemoteQuery<unknown> | RemoteQueryOverride> | undefined>
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

/**
 * Creates shared page-controller helpers for resource editor routes.
 * Used to synchronize route loading, header state, and shared header actions.
 *
 * @param params Shared header metadata for a resource editor page.
 * @returns Route, header, and action synchronization helpers.
 */
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
 * Focuses the active facet section when the current URL hash matches that facet.
 *
 * @param container Root form element containing `data-facet-id` sections.
 * @param facet Active facet identifier.
 * @returns Nothing.
 */
export function focusFacetFromHash(
  container: HTMLElement | null | undefined,
  facet: FacetType | false,
): void {
  if (typeof window === 'undefined' || !container || !facet) return

  const activeHash = window.location.hash.slice(1)
  if (activeHash !== facet) return

  const selectorFacet = typeof CSS !== 'undefined' ? CSS.escape(facet) : facet
  const target = container.querySelector<HTMLElement>(
    `[data-facet-id="${selectorFacet}"]`,
  )

  if (!target) return

  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', behavior: 'auto' })

    const hadTabIndex = target.hasAttribute('tabindex')
    if (!hadTabIndex) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    if (!hadTabIndex) target.removeAttribute('tabindex')
  })
}

// ---
/********************
 *  3. SUBMIT PAYLOAD NORMALIZATION
 ************/
// +++ Submit Payload Normalization
/**
 * Ensure submit payload includes `meta` and `data`, infer/normalize `meta.mode`,
 * and populate `meta.id` for update submissions when omitted.
 *
 * @param payload Mutable submit draft from the editor.
 * @param params Mode defaults and id-resolution helpers.
 * @returns The same payload with normalized `meta` and `data`.
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
 *
 * @param params Relation comparison inputs.
 * @returns The effective relation value and whether it materially changed.
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
 *
 * @param params Target payload field plus relation comparison inputs.
 * @returns The effective relation resolution that was applied.
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

/**
 * Verifies that both live and committed entity state still match the active route ref.
 * Used by code-based editors to block submit/toggle actions while route/entity state drifts.
 *
 * @param organisationState Current live entity state.
 * @param committedOrganisationState Last committed entity state.
 * @param ref Active route ref.
 * @returns `true` when both entity snapshots still align with the route.
 */
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

// ---
/********************
 *  4. SUBMISSION RESULT HANDLERS
 ************/
// +++ Submission Result Handlers
/**
 * Runs the canonical success/error/invalid/fallback submission-result branching.
 * Used by callers that need custom side effects without re-implementing result precedence.
 *
 * @param params Submission outcome and branch handlers.
 */
async function handleSubmissionResult({
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

/**
 * Handles a resource form submission result with standard toast and refresh behavior.
 * Used by shared form factories so editor pages get consistent success/error UX.
 *
 * @param params Submission outcome, toast content, and refresh hooks.
 */
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
  // Normalize unknown result payloads once so downstream parsing stays defensive.
  const asTrimmedString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : ''
  const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
  // Split machine-style `CODE: detail` errors into toast title and description parts.
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
  // Prefer the active locale name first so success toasts match the current editor context.
  const getSubmittedNameAtLocale = (localeKey: string, field: string): string => {
    const i18nByLocale = asRecord(submittedData?.i18n)
    const localeValues = asRecord(i18nByLocale?.[localeKey])
    return asTrimmedString(localeValues?.[field])
  }
  const getSubmittedName = (field: string): string =>
    getSubmittedNameAtLocale(toLocaleKey(getLocale()), field) ||
    asTrimmedString(submittedData?.[field]) ||
    asTrimmedString(submittedRoot?.[field])

  await handleSubmissionResult({
    success,
    issues,
    error,
    onSuccess: async () => {
      const name = getSubmittedName(nameKey)
      toast.success(`${successPrefix}${name ? ` ${name}` : ''}`)
      await refreshResource()
      await onSuccess?.()
    },
    onError: async issueError => {
      toast.error(issueError)
    },
    onInvalid: async currentIssues => {
      if (firstIssueMessage) {
        const { code, detail } = toIssueParts(firstIssueMessage)
        toast.error(code, { description: detail })
        return
      }
      if ((currentIssues?.length ?? 0) > 0) {
        toast.error(invalidMessage)
      }
    },
    onFallback: async () => {
      toast.error(fallbackErrorMessage)
    },
  })
}

// ---
/********************
 *  5. HEADER FORM ACTIONS
 ************/
// +++ Header Form Actions
/**
 * Pushes the current page's form action handlers into the shared header controller.
 * Used by resource page helpers to keep header action wiring centralized.
 *
 * @param params Header controller and the current action handlers.
 */
function wireHeaderFormActionHandlers({
  headerCtrl,
  handlers,
}: WireHeaderFormActionHandlersParams): void {
  headerCtrl.setFormActions(handlers)
}

/**
 * Serializes header form-action state into a stable signature string.
 * Used to suppress redundant header controller updates during reactive churn.
 *
 * @param status Current header action status.
 * @returns A stable signature suitable for change detection.
 */
function toHeaderFormActionStatusSignature(status: HeaderFormActionStatus): string {
  return `${status.dirty}|${status.isSubmitting}|${status.hasIssues}|${status.isPublished}|${status.isDeleted}|${status.canEdit}|${status.disableEdit}|${status.canPublish}|${status.showDeleteAction}|${status.showPublishAction}`
}

/**
 * Updates header action status only when the effective state actually changed.
 * Used by editor pages to avoid unnecessary header controller writes.
 *
 * @param params Header controller, next status, and last known signature.
 * @returns The current signature after syncing.
 */
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

// ---
/********************
 *  6. OPTIMISTIC HEADER UPDATE
 ************/
// +++ Optimistic Header Update
/**
 * Capture the currently displayed header affordances so routes can preserve them
 * during optimistic entity-to-entity navigation.
 *
 * @param headerCtrl Header controller state source.
 * @returns A snapshot of the currently rendered header state.
 */
export function captureHeaderTransitionSnapshot(headerCtrl: {
  state: Pick<HeaderCtrlState, 'formActions' | 'meta'>
}): HeaderTransitionSnapshot {
  const current = untrack(() => headerCtrl.state.formActions)
  const facets = [...untrack(() => headerCtrl.state.meta.facets)]

  return {
    canEdit: Boolean(current?.canEdit ?? true),
    canPublish: Boolean(current?.canPublish ?? true),
    showDeleteAction: Boolean(current?.showDeleteAction ?? true),
    showPublishAction: Boolean(current?.showPublishAction ?? true),
    isPublished: Boolean(current?.isPublished ?? false),
    isDeleted: Boolean(current?.isDeleted ?? false),
    facets,
  }
}

/**
 * Resolve which facet tabs should be displayed while a destination entity is
 * still settling.
 *
 * @param isSettled Whether the destination entity has finished loading.
 * @param resolvedFacets The resolved facet set for the current route.
 * @param snapshot The previous header transition snapshot.
 * @returns The facets that should be rendered during the current transition.
 */
export function resolveOptimisticHeaderFacets(
  isSettled: boolean,
  resolvedFacets:
    | Map<
        FacetType,
        string | { label: string; icon?: Component | null; hasIssues?: boolean }
      >
    | HeaderFacetItem[],
  snapshot: HeaderTransitionSnapshot,
):
  | Map<
      FacetType,
      string | { label: string; icon?: Component | null; hasIssues?: boolean }
    >
  | HeaderFacetItem[] {
  if (isSettled) return resolvedFacets
  if (snapshot.facets.length === 0) return resolvedFacets
  return snapshot.facets
}

/**
 * Resolve header form-action visibility/status while preserving the previous
 * page's affordances until the destination entity is truly settled.
 *
 * @param params Current page state and previous header snapshot.
 * @returns The action status that should be pushed into the shared header.
 */
export function resolveOptimisticHeaderStatus({
  isSettled,
  isImageFacetActive = false,
  isNewRef = false,
  dirty,
  isSubmitting,
  hasIssues,
  isPublished,
  isDeleted,
  canEdit,
  canPublish,
  showDeleteAction,
  showPublishAction,
  snapshot,
}: ResolveOptimisticHeaderStatusParams): HeaderFormActionStatus {
  return {
    // Image mode is intentionally non-form-driven, so form-specific signals are muted.
    dirty: isImageFacetActive ? false : dirty,
    isSubmitting: isImageFacetActive ? false : isSubmitting,
    hasIssues: isImageFacetActive ? false : hasIssues,
    isPublished: isSettled ? isPublished : snapshot.isPublished,
    isDeleted: isSettled ? isDeleted : snapshot.isDeleted,
    canEdit: isSettled ? canEdit : snapshot.canEdit,
    disableEdit: isImageFacetActive,
    canPublish: isSettled ? (isNewRef ? false : canPublish) : snapshot.canPublish,
    showDeleteAction: isSettled ? showDeleteAction : snapshot.showDeleteAction,
    showPublishAction: isSettled
      ? isNewRef
        ? false
        : showPublishAction
      : snapshot.showPublishAction,
  }
}

// ---
/********************
 *  7. ISSUE MESSAGES
 ************/
// +++ Issue Messages
/**
 * Extracts a string message from an arbitrary validation issue payload.
 * Used by issue helpers so routes and components can work against unknown issue shapes.
 *
 * @param issue Unknown validation issue payload.
 * @returns The string message when present, otherwise `null`.
 */
export function toIssueMessage(issue: unknown): string | null {
  if (!issue || typeof issue !== 'object' || !('message' in issue)) return null
  const message = (issue as { message?: unknown }).message
  return typeof message === 'string' ? message : null
}

/**
 * Normalizes an arbitrary issue array into a stable, deduplicated list of messages.
 * Used by editor pages to derive compact issue summaries without repeating
 * message extraction logic.
 *
 * @param issues Unknown issue list.
 * @returns A deduplicated list of string messages.
 */
export function toUniqueIssueMessages(issues: unknown[] | undefined | null): string[] {
  if (!Array.isArray(issues)) return []
  const messages = issues
    .map(toIssueMessage)
    .filter((message): message is string => Boolean(message))

  return Array.from(new Set(messages))
}

/**
 * Classifies whether an issue should be surfaced at the form level.
 * Used by editor pages to keep section headers focused on true root-level blocking issues.
 * Field-scoped and relation-scoped validation should render on their own sections instead.
 *
 * @param issue Unknown validation issue payload.
 * @returns `true` when the issue is not scoped to a nested field path.
 */
export function isFormLevelIssue(issue: unknown): boolean {
  if (!issue || typeof issue !== 'object' || !('path' in issue)) return true
  const path = (issue as { path?: unknown }).path
  return !Array.isArray(path) || path.length === 0
}

/**
 * Filters visible issues down to form-level messages and deduplicates them.
 * Used by editor shells so route files can derive top-level form issues with one call.
 *
 * @param issues Unknown issue list.
 * @returns Deduplicated top-level issue messages.
 */
export function toFormLevelIssueMessages(
  issues: unknown[] | undefined | null,
): string[] {
  if (!Array.isArray(issues)) return []
  return toUniqueIssueMessages(issues.filter(isFormLevelIssue))
}

/**
 * Splits a toast/issue string into code/detail parts for chip presentation.
 * Used by section issue chips so error codes and descriptions can render separately.
 *
 * @param message Issue message in `CODE: detail` format.
 * @returns Parsed code/detail parts with safe fallbacks.
 */
export function toIssueChipParts(message: string): { code: string; detail: string } {
  const parts = message.split(':')
  if (parts.length < 2) return { code: 'INVALID', detail: message }
  const code = parts[0]?.trim() || 'INVALID'
  const detail = parts.slice(1).join(':').trim() || message
  return { code, detail }
}

// ---
/********************
 *  8. ISSUE FACETS
 ************/
// +++ Issue Facets
/**
 * Converts an issue path into normalized string segments.
 * Used by facet issue mapping helpers to compare issue locations against form controls.
 *
 * @param issue Unknown validation issue payload.
 * @returns The issue path as string segments.
 */
const toIssuePathSegments = (issue: unknown): string[] => {
  if (!issue || typeof issue !== 'object' || !('path' in issue)) return []
  const path = (issue as { path?: unknown }).path
  if (!Array.isArray(path)) return []
  return path.map(segment => String(segment))
}

/**
 * Produces candidate field-name representations for an issue path.
 * Used to match issue paths against DOM control names in facet sections.
 *
 * @param issue Unknown validation issue payload.
 * @returns Possible field-name encodings for the same path.
 */
const toIssueFieldNameCandidates = (issue: unknown): string[] => {
  const segments = toIssuePathSegments(issue)
  if (segments.length === 0) return []

  const dot = segments.join('.')
  // Mirror browser form-name syntax so array paths can match DOM control names.
  const bracket = segments.reduce((acc, segment, index) => {
    if (index === 0) return segment
    return /^\d+$/u.test(segment) ? `${acc}[${segment}]` : `${acc}.${segment}`
  }, '')

  return Array.from(new Set([dot, bracket]))
}

/**
 * Collects all control names mounted within each facet section of a form.
 * Used to map validation issues back to the facet that owns the affected fields.
 *
 * @param formEl Editor form element.
 * @param supportedFacets Facets currently rendered by the editor.
 * @returns A map of facet ids to field-name sets.
 */
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

/**
 * Resolves the owning facet for a single validation issue.
 * Used by facet issue summaries so hidden facets can still be highlighted or activated.
 *
 * @param issue Unknown validation issue payload.
 * @param supportedFacets Facets currently rendered by the editor.
 * @param facetFieldNames Field names collected from each facet section.
 * @returns The facet that should own the issue.
 */
const toFacetFromIssuePath = (
  issue: unknown,
  supportedFacets: Set<FacetType>,
  facetFieldNames: Map<FacetType, Set<string>>,
): FacetType => {
  const segments = toIssuePathSegments(issue)
  if (
    supportedFacets.has('fields') &&
    segments[0] === 'data' &&
    segments[1] === 'properties'
  ) {
    // Property paths do not map cleanly to DOM names, so force them onto the fields facet.
    return 'fields'
  }

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

/**
 * Summarizes which facets contain validation issues and which one should be focused first.
 * Used by editor pages to drive facet badges and submit-time facet switching.
 *
 * @param params Issues, supported facets, and the optional form element.
 * @returns The first facet with issues plus the full issue-bearing facet set.
 */
function resolveFacetIssueSummary(params: {
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

/**
 * Applies `hasIssues` flags to a facet-tab map.
 * Used by editor headers so facet tabs can render issue styling consistently.
 *
 * @param facets Base facet-tab map.
 * @param facetsWithIssues Facets that currently contain validation issues.
 * @returns A facet-tab map with `hasIssues` decorations applied.
 */
function withFacetIssueIndicators(
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

/**
 * Resolves both facet issue summary and facet-tab issue indicators in one step.
 * Used by editor pages to keep header-tab issue wiring orchestration-only.
 *
 * @param params Issues, facets, and the optional form element.
 * @returns The issue summary plus issue-decorated facet tabs.
 */
export function resolveFacetTabsWithIssues(params: {
  issues: unknown[] | null | undefined
  facets: Map<FacetType, { label: string; icon?: Component | null }>
  formEl?: HTMLFormElement
}): {
  facetIssueSummary: ReturnType<typeof resolveFacetIssueSummary>
  facetTabsWithIssues: ReturnType<typeof withFacetIssueIndicators>
} {
  const facetIssueSummary = resolveFacetIssueSummary({
    issues: params.issues,
    facets: params.facets,
    formEl: params.formEl,
  })

  return {
    facetIssueSummary,
    facetTabsWithIssues: withFacetIssueIndicators(
      params.facets,
      facetIssueSummary.facetsWithIssues,
    ),
  }
}

// ---
/********************
 *  9. I18N HELPERS
 ************/
// +++ I18n Helpers

/**
 * Resolves the current generator-toggle state for one i18n field and locale.
 * Used by i18n field components to render generator affordances consistently.
 *
 * @param form Gen-AI aware form state.
 * @param locale The locale being inspected.
 * @param field The translatable field to resolve.
 * @returns Whether the field is currently marked as generated.
 */
export function getGenAiState(
  form: GenAiStateResolverForm,
  locale: Locale | LocaleKey,
  field: GenAiField,
): boolean {
  const localeKey = toLocaleKey(locale)
  const localeData = form.fields.value().data?.i18n?.[localeKey]
  if (!localeData) return false
  if (field === 'title') return Boolean(localeData.titleGen)
  if (field === 'name') return Boolean(localeData.nameGen)
  if (field === 'nameShort') return Boolean(localeData.nameShortGen)
  return Boolean(localeData.descriptionGen)
}

/**
 * Toggles the generator-state boolean for one i18n field and locale.
 * Used by descriptor/credit fields to keep generator flags in sync with UI toggles.
 *
 * @param form Mutable form state.
 * @param locale The locale being updated.
 * @param field The translatable field whose generator flag should flip.
 */
export function toggleGenAiField<
  T extends {
    i18n?: Record<
      string,
      {
        titleGen?: FormBooleanValue
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
      }
    >
  },
>(form: FormDataUpdaterForm<T>, locale: Locale | LocaleKey, field: GenAiField): void {
  updateFormData(form, data => {
    const localeKey = toLocaleKey(locale)
    if (!data.i18n?.[localeKey]) return data
    const fieldName = `${field}Gen` as
      | 'titleGen'
      | 'nameGen'
      | 'nameShortGen'
      | 'descriptionGen'
    const nextValue = !data.i18n[localeKey][fieldName]
    data.i18n[localeKey][fieldName] = nextValue
    return data
  })
}

/**
 * Default set of translatable fields for machine-translation helpers.
 * Kept centralized so editors can opt into the common subset by default.
 */
const DEFAULT_TRANSLATABLE_FIELDS: I18nTranslatableField[] = [
  'name',
  'nameShort',
  'description',
]

/**
 * Maps a translatable field name to its corresponding `...Gen` flag.
 *
 * @param field Translatable field name.
 * @returns The associated generator flag key.
 */
const toGenField = (field: I18nTranslatableField): `${I18nTranslatableField}Gen` =>
  `${field}Gen`

/**
 * Machine-translates empty fields from a source locale into a target locale.
 * Used by editor pages to seed untranslated locale content without overwriting manual text.
 *
 * @param params Translation source, target, fields, and form state.
 * @returns `true` when at least one field was translated and applied.
 */
export async function translateLocaleIntoEmptyFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
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
  const targetLocaleKey = toLocaleKey(targetLocale)
  const targetLocaleData = currentFormData.i18n?.[targetLocaleKey]
  if (!targetLocaleData) return false

  // Only send blank targets so machine translation never overwrites user-authored content.
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
    const targetLocaleData = data.i18n?.[targetLocaleKey]
    if (!targetLocaleData) return data

    // Mark translated fields as generated so later UI can distinguish seeded content.
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

/**
 * Clears the selected locale fields and their generator flags.
 * Used by locale reset actions to restore a clean untranslated state.
 *
 * @param params Reset target locale, field list, and form state.
 */
export function resetLocaleFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: FormBooleanValue
        nameShortGen?: FormBooleanValue
        descriptionGen?: FormBooleanValue
      }
    >
  },
>({
  form,
  targetLocale,
  fields = DEFAULT_TRANSLATABLE_FIELDS,
}: ResetLocaleFieldsParams<TFormData>): void {
  updateFormData(form, data => {
    const targetLocaleKey = toLocaleKey(targetLocale)
    const targetLocaleData = data.i18n?.[targetLocaleKey]
    if (!targetLocaleData) return data

    for (const field of fields) {
      targetLocaleData[field] = ''
      targetLocaleData[toGenField(field)] = false
    }
    return data
  })
}

// ---
/********************
 *  10. USER ROLES
 ************/
// +++ User Roles
/**
 * Resolves the current role-field input name for each selected user id.
 * Used by role editors that need hidden inputs aligned with dynamic user-role rows.
 *
 * @param form Role-field resolver form state.
 * @returns A map of user id to current role-field input name.
 */
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

/**
 * Overlays current form role values onto persisted role rows by user id.
 * Used by role UIs so display rows reflect in-progress edits without losing base metadata.
 *
 * @param params Persisted roles plus current in-form role values.
 * @returns Base role rows with current role selections overlaid.
 */
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

/**
 * Reconciles persisted organisation role rows with current form role selections.
 * Used when selected users or unsaved role edits drift from the original entity payload.
 *
 * @param params Persisted roles, in-form roles, and optional selected-user metadata.
 * @returns Role rows normalized to the current form selection set.
 */
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
    // Synthesize a minimal user shell so optimistic rows remain renderable before a refetch.
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

/**
 * Produces hidden user-id input attrs for the current user-role rows.
 * Used by editors that render custom user-role UIs outside the direct form field tree.
 *
 * @param form Role-field resolver form state.
 * @param userRoles Current user-role rows.
 * @returns Hidden-input attrs for each row with a bound `userId` field.
 */
export function getUserRoleHiddenInputAttrs(
  form: UserRoleFieldNameResolverForm,
  userRoles: Array<{ userId: string }>,
): UserRoleHiddenInputAttrs[] {
  const roleFields = form.fields.data?.userRoles ?? []
  return userRoles
    .map((userRole, index) => roleFields[index]?.userId?.as('hidden', userRole.userId))
    .filter((attrs): attrs is UserRoleHiddenInputAttrs => Boolean(attrs))
}

/**
 * Adds a selected user role to both form state and optimistic entity state.
 * Used by resource editors with managed user-role assignment UIs.
 *
 * @param params Form state, optimistic entity state, and the selected user.
 * @returns The next optimistic entity state.
 */
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

/**
 * Removes a selected user role from both form state and optimistic entity state.
 * Used by resource editors with removable user-role assignment rows.
 *
 * @param params Form state, optimistic entity state, and the removed user id.
 * @returns The next optimistic entity state.
 */
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

/**
 * Updates one selected user role in both form state and optimistic entity state.
 * Used by resource editors when a role dropdown changes for an existing row.
 *
 * @param params Form state, optimistic entity state, target user id, and next role.
 * @returns The next optimistic entity state.
 */
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
// ---
