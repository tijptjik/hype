import { beforeNavigate } from '$app/navigation'
import { debounce, deepEqual } from '@sillvva/utils'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { handleResourceFormSubmissionResult } from '$lib/client/services/form'
import type {
  RemoteForm,
  RemoteFormInput,
  RemoteFormIssue,
  RemoteQuery,
  RemoteQueryOverride,
} from '@sveltejs/kit'
import type { ConfigureFormResourceResultOptions, SubmitOutcome } from '$lib/types'
import { onMount, tick, untrack } from 'svelte'
import { v7 } from 'uuid'

type Awaitable<T> = T | PromiseLike<T>

const META_HIDDEN_ATTR = 'data-remote-meta-hidden'
const META_KEYS = ['id', 'updatedAt', 'mode', 'isAdminRequest'] as const

export const toRemoteIssueFieldKey = (issue: unknown): string | null => {
  if (!issue || typeof issue !== 'object' || !('message' in issue)) return null
  const message = (issue as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const code = message.split(':')[0]?.trim() ?? ''
  if (!code) return null

  if (!('path' in issue)) return null
  const path = (issue as { path?: unknown }).path
  if (!Array.isArray(path) || path.length === 0) return null

  return `${path.map(String).join('.')}:${code}`
}

export const isPreflightFailureOutcome = (outcome: SubmitOutcome): boolean =>
  !outcome.success &&
  !outcome.result &&
  (outcome.issues?.length ?? 0) > 0 &&
  !outcome.error

export const shouldClearSubmitRequestOnInteraction = (params: {
  isSubmitRequested: boolean
  awaitsPostPreflightInteraction: boolean
}): boolean => params.isSubmitRequested && params.awaitsPostPreflightInteraction

const toRemoteIssuePath = (issue: unknown): Array<string | number> | null => {
  if (!issue || typeof issue !== 'object' || !('path' in issue)) return null
  const path = (issue as { path?: unknown }).path
  if (!Array.isArray(path)) return null
  return path as Array<string | number>
}

const readPathValue = (source: unknown, path: Array<string | number>): unknown => {
  let current: unknown = source
  for (const segment of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

const valuesEqual = (left: unknown, right: unknown): boolean => {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return left === right
  }
}

const isStaleSubmitAttemptIssue = (
  issue: unknown,
  submitAttemptBaseline: unknown,
  submitAttemptIssueKeySet: Set<string>,
  currentValue: unknown,
): boolean => {
  const fieldKey = toRemoteIssueFieldKey(issue)
  const fieldPath = toRemoteIssuePath(issue)
  if (!fieldKey || !fieldPath || !submitAttemptBaseline) return false
  if (!submitAttemptIssueKeySet.has(fieldKey)) return false

  const baselineValue = readPathValue(submitAttemptBaseline, fieldPath)
  const nextValue = readPathValue(currentValue, fieldPath)
  return !valuesEqual(baselineValue, nextValue)
}

// Insert meta hidden inputs into the form
// This is necessary because the form data is not available in the `onsubmit` hook.
const syncMetaHiddenInputs = (
  formEl: HTMLFormElement | undefined,
  meta: unknown,
): void => {
  if (!formEl) return

  for (const existing of Array.from(
    formEl.querySelectorAll(`input[${META_HIDDEN_ATTR}="true"]`),
  )) {
    existing.remove()
  }

  if (!meta || typeof meta !== 'object') return
  const metaRecord = meta as Record<string, unknown>

  for (const key of META_KEYS) {
    const value = metaRecord[key]
    if (value === undefined) continue
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = `meta.${key}`
    input.value = String(value)
    input.setAttribute(META_HIDDEN_ATTR, 'true')
    formEl.appendChild(input)
  }
}

export function use<T>(
  args:
    | (() => T)
    | {
        /** Depedencies to track */
        track: () => T
        /** Effects that run once each during SSR and hydration */
        ssr?: (value: T) => unknown
        /** Effects that run once during mount */
        mount?: (value: T) => unknown
        /** Effects that run on dependency change, before the DOM updates */
        pre?: (current: T, previous: T) => void | (() => void)
        /** Effects that run on dependency change, after the DOM updates */
        effect?: (current: T, previous: T) => void | (() => void)
      },
) {
  if (typeof args === 'function') return $state.snapshot(args())

  const initial = args.track()
  let mounted = false
  let pre_v = initial
  let prev = initial

  args.ssr?.(initial)

  if (args.pre) {
    $effect.pre(() => {
      const current = args.track()
      $state.snapshot(current)
      return untrack(() => {
        if (!mounted) return
        const cleanup = args.pre?.(current, pre_v)
        pre_v = current
        return cleanup
      })
    })
  }

  $effect(() => {
    const current = args.effect ? args.track() : untrack(() => args.track())
    if (args.effect) $state.snapshot(current)
    return untrack(() => {
      if (!mounted) {
        if (args.mount) args.mount(current)
        mounted = true
        return
      }
      const cleanup = args.effect?.(current, prev)
      prev = current
      return cleanup
    })
  })

  return $state.snapshot(initial)
}

export type GenericFormConfig<T = RemoteFormInput> = ReturnType<typeof configureForm<T>>
export type GenericForm<T = RemoteFormInput> = ReturnType<GenericFormConfig<T>>

type FormId<Input> = Input extends { id: infer Id }
  ? Id extends string | number
    ? Id
    : string | number
  : string | number

export interface RemoteFormOptions<Input = RemoteFormInput> {
  form: RemoteForm<Input, unknown>
  schema?: StandardSchemaV1<Input, unknown>
  key?: FormId<Input>
  data?: Input
  initialErrors?: boolean
  navBlockMessage?: string
  onissues?: (ctx: { readonly issues: RemoteFormIssue[] }) => unknown
  onsubmit?: <T>(ctx: {
    readonly dirty: boolean
    readonly form: HTMLFormElement
    readonly data: Input
  }) => Awaitable<T>
  onsubmitupdates?: (ctx: {
    readonly dirty: boolean
    readonly form: HTMLFormElement
    readonly data: Input
  }) => Awaitable<Array<RemoteQuery<unknown> | RemoteQueryOverride> | undefined>
  onresult?: (ctx: {
    readonly success: boolean
    readonly result?: unknown
    readonly issues?: RemoteFormIssue[]
    readonly error?: string
  }) => Awaitable<void>
  resourceResult?: ConfigureFormResourceResultOptions<Input>
  formEl?: HTMLFormElement
}

export function configureForm<Input = RemoteFormInput>(
  getProps: () => RemoteFormOptions<Input>,
) {
  const {
    form: remoteForm,
    schema,
    data: formData,
    key: formKey,
    initialErrors: initialErrorsProp,
    navBlockMessage,
    onsubmit,
    onsubmitupdates,
    onresult,
    onissues,
    resourceResult,
    formEl,
  } = $derived(getProps())

  type FormData = Input extends undefined ? Record<string, never> : Input
  const data = $derived((formData ?? {}) as FormData)
  const dataId = $derived((data as { id?: string | number } | null)?.id)
  const key = $derived(formKey ?? ((dataId ?? v7()) as FormId<Input>))
  const form = $derived(
    schema ? remoteForm.for(key).preflight(schema) : remoteForm.for(key),
  )

  let initial: FormData = $state.raw(
    use({
      track: () => data,
      ssr: form.fields.set,
      pre: form.fields.set,
    }) as FormData,
  )

  let touched = $state.raw(false)
  let submitting = $state.raw(false)
  let submitted = $state.raw(false)
  let dirty = $derived(!deepEqual(initial, $state.snapshot(form.fields.value())))
  let wasSubmitAttempted = $state.raw(false)
  let isSubmitRequested = $state.raw(false)
  let awaitsPostPreflightInteraction = $state.raw(false)
  let submitAttemptBaseline = $state.raw<FormData | null>(null)
  let submitAttemptIssueKeys = $state.raw<string[]>([])

  function clearSubmitAttemptState(): void {
    if (wasSubmitAttempted) wasSubmitAttempted = false
    if (isSubmitRequested) isSubmitRequested = false
    if (awaitsPostPreflightInteraction) awaitsPostPreflightInteraction = false
    if (submitAttemptBaseline !== null) submitAttemptBaseline = null
    if (submitAttemptIssueKeys.length > 0) submitAttemptIssueKeys = []
  }

  function beginSubmitAttempt(): void {
    wasSubmitAttempted = true
    isSubmitRequested = true
    awaitsPostPreflightInteraction = false
    submitAttemptIssueKeys = []
    submitAttemptBaseline = $state.snapshot(form.fields.value()) as FormData
  }

  function settleSubmitAttempt(outcome: SubmitOutcome): void {
    submitAttemptIssueKeys = Array.from(
      new Set(
        (outcome.issues ?? [])
          .map(toRemoteIssueFieldKey)
          .filter((key): key is string => Boolean(key)),
      ),
    )

    const isPreflightFailure = isPreflightFailureOutcome(outcome)

    if (isPreflightFailure) {
      awaitsPostPreflightInteraction = true
    } else {
      isSubmitRequested = false
      awaitsPostPreflightInteraction = false
    }

    if (outcome.success) {
      clearSubmitAttemptState()
    }
  }

  async function dispatchResult(outcome: SubmitOutcome, data: Input): Promise<void> {
    if (resourceResult) {
      const shouldRedirect = Boolean(
        resourceResult.shouldRedirect?.({
          data,
          success: outcome.success,
          issues: outcome.issues,
          error: outcome.error,
          result: outcome.result,
        }),
      )

      await handleResourceFormSubmissionResult({
        success: outcome.success,
        issues: outcome.issues,
        error: outcome.error,
        nameKey: resourceResult.nameKey ?? 'nameShort',
        nameFallbackKey: resourceResult.nameFallbackKey ?? 'code',
        onSuccess: resourceResult.onSuccess,
        refreshResource: () =>
          resourceResult.refreshResource({
            data,
            success: outcome.success,
            issues: outcome.issues,
            error: outcome.error,
            result: outcome.result,
            shouldRedirect,
          }),
        entity: resourceResult.getEntity?.(),
      })

      if (shouldRedirect) {
        await resourceResult.onRedirect?.({ data, success: outcome.success })
      }
    }

    await onresult?.(outcome)
  }

  const attributes = $derived(
    Object.assign(
      form.enhance(async ({ submit, form: formEl, data }) => {
        if (submitting) return

        const typedData = data as Input
        const bf =
          !onsubmit || (await onsubmit({ dirty, form: formEl, data: typedData }))
        if (!bf) {
          return
        }
        // Lock immediately so rapid repeat submits cannot race preflight and send
        // duplicate requests with the same optimistic-concurrency token.
        submitting = true
        beginSubmitAttempt()

        await validate()
        const hasPreflightIssues = (allIssues?.length ?? 0) > 0
        if (hasPreflightIssues) {
          await focusInvalid()
          const outcome: SubmitOutcome = { success: false, issues: allIssues ?? [] }
          settleSubmitAttempt(outcome)
          await dispatchResult(outcome, typedData)
          submitting = false
          return
        }

        const wasDirty = dirty
        let resultDispatched = false
        try {
          dirty = false
          const updates = await onsubmitupdates?.({
            dirty,
            form: formEl,
            data: typedData,
          })
          if (updates && updates.length > 0) {
            await submit().updates(...updates)
          } else {
            await submit()
          }
          submitted = true

          const hasIssues = (allIssues?.length ?? 0) > 0
          const success = !hasIssues
          resultDispatched = true
          const outcome: SubmitOutcome = {
            success,
            result: form.result,
            issues: hasIssues ? allIssues : undefined,
          }
          settleSubmitAttempt(outcome)
          await dispatchResult(outcome, typedData)

          if (!success) {
            dirty = wasDirty
            await focusInvalid()
            if (allIssues) onissues?.({ issues: allIssues })
          } else {
            // Re-baseline dirty tracking against the committed post-submit form state.
            await tick()
            initial = $state.snapshot(form.fields.value()) as FormData
            dirty = false
            lastIssues = undefined
          }
        } catch (error) {
          // TODO Add a error toast
          if (!resultDispatched) {
            const hasIssues = (allIssues?.length ?? 0) > 0
            const outcome: SubmitOutcome = {
              success: false,
              issues: hasIssues ? allIssues : undefined,
              error: hasIssues ? undefined : (error as Error).message,
            }
            settleSubmitAttempt(outcome)
            await dispatchResult(outcome, typedData)
          }
          dirty = wasDirty
        } finally {
          submitting = false
        }
      }),
      {
        onsubmit: () => {
          syncMetaHiddenInputs(
            formEl,
            (form.fields.value() as { meta?: unknown })?.meta,
          )
          return focusInvalid()
        },
        oninput: () => {
          if (lastIssues) debouncedValidate.call()
        },
      },
    ),
  )

  const result = $derived(form.result)
  const issues = $derived(form.fields.issues())
  const allIssues = $derived(form.fields.allIssues())
  const visibleIssues = $derived.by(() => {
    const baseline = submitAttemptBaseline
    const currentValue = form.fields.value()
    const keySet = new Set(submitAttemptIssueKeys)
    return (allIssues ?? []).filter(
      issue => !isStaleSubmitAttemptIssue(issue, baseline, keySet, currentValue),
    )
  })
  const initialErrors = $derived(initialErrorsProp ?? !!dataId)
  let lastIssues = $state.raw<RemoteFormIssue[] | undefined>()

  use({
    track: () => ({ form, data, initialErrors }),
    mount: async current => {
      if (current.initialErrors) await validate().then(focusInvalid)
    },
    effect: current => {
      const nextData = $state.snapshot(current.data) as FormData
      const currentValue = $state.snapshot(current.form.fields.value()) as FormData
      const shouldSyncFields = !deepEqual(currentValue, nextData)

      if (shouldSyncFields) {
        current.form.fields.set(nextData)
      }

      if (!deepEqual(initial, nextData)) {
        initial = nextData
        touched = false
        clearSubmitAttemptState()
      }

      if (current.initialErrors) validate(true).then(focusInvalid)
    },
  })

  const debouncedValidate = debounce(validate, 300)

  async function validate(reset = false) {
    await form.validate({ includeUntouched: true, preflightOnly: true })
    if (allIssues && onissues && !deepEqual(lastIssues, allIssues))
      onissues({ issues: allIssues })
    if (allIssues) lastIssues = allIssues
    else if (reset) lastIssues = undefined
  }

  async function focusInvalid() {
    await tick()

    if (allIssues) lastIssues = allIssues
    else return

    const invalid = formEl?.querySelector(
      ':is(input, select, textarea):not(.hidden, [type=hidden], :disabled)[aria-invalid]',
    ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null | undefined
    invalid?.focus()

    if (
      formEl?.querySelector(':is(input, select, textarea):disabled') &&
      allIssues?.some(issue => issue.message.includes('undefined'))
    ) {
      console.warn(
        'Ensure your form fields are not disabled when the validation is run.',
        'Disabled fields are treated as undefined values, because they are excluded from the form data.',
      )
    }
  }

  onMount(() => {
    const clearPostPreflightInteraction = () => {
      if (
        !shouldClearSubmitRequestOnInteraction({
          isSubmitRequested,
          awaitsPostPreflightInteraction,
        })
      ) {
        return
      }
      isSubmitRequested = false
      awaitsPostPreflightInteraction = false
    }

    const handleFocusIn = () => {
      if (touched) return
      touched = true
      clearPostPreflightInteraction()
    }
    formEl?.addEventListener('focusin', handleFocusIn)
    formEl?.addEventListener('input', clearPostPreflightInteraction)
    return () => {
      formEl?.removeEventListener('focusin', handleFocusIn)
      formEl?.removeEventListener('input', clearPostPreflightInteraction)
    }
  })

  beforeNavigate(ev => {
    if ((dirty || issues) && navBlockMessage && !confirm(navBlockMessage)) ev.cancel()
  })

  return () => ({
    form,
    attributes,
    initial,
    touched,
    dirty,
    submitting,
    submitted,
    wasSubmitAttempted,
    isSubmitRequested,
    awaitsPostPreflightInteraction,
    submitAttemptBaseline,
    submitAttemptIssueKeys,
    result,
    issues,
    allIssues,
    visibleIssues,
    validate,
    debouncedValidate,
    beginSubmitAttempt,
    requestSubmit: (options?: { meta?: Record<string, unknown> }) => {
      if (options?.meta) {
        const current = form.fields.value() as {
          meta?: Record<string, unknown>
        } & Record<string, unknown>
        form.fields.set({
          ...current,
          meta: {
            ...(current.meta ?? {}),
            ...options.meta,
          },
        } as Parameters<typeof form.fields.set>[0])
      }
      beginSubmitAttempt()
      formEl?.requestSubmit()
    },
    settleSubmitAttempt,
    clearSubmitAttemptState,
    reset: () => form.fields.set(initial),
  })
}
