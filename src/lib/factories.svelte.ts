import { beforeNavigate } from '$app/navigation'
import { debounce, deepEqual } from '@sillvva/utils'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { handleResourceFormSubmissionResult } from '$lib/client/services/form'
import { m } from '$lib/i18n'
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

const hasDefinedValue = (value: unknown): boolean => {
  if (value == null) return false
  if (Array.isArray(value)) return value.some(hasDefinedValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasDefinedValue)
  }
  return true
}

const isServerIssue = (issue: RemoteFormIssue): boolean =>
  (issue as RemoteFormIssue & { server?: unknown }).server === true

const mergeWithDescriptors = <T extends object, U extends object>(
  base: T,
  extra: U,
): T & U => {
  const merged = {} as T & U
  for (const source of [base, extra]) {
    for (const key of Reflect.ownKeys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (!descriptor) continue
      Object.defineProperty(merged, key, descriptor)
    }
  }
  return merged
}

const toSubmitWriteToken = (
  result: unknown,
): { id?: string; updatedAt?: string } | null => {
  if (!result || typeof result !== 'object') return null
  const data = (result as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null

  const id = (data as { id?: unknown }).id
  const modifiedAt = (data as { modifiedAt?: unknown }).modifiedAt
  const updatedAt = (data as { updatedAt?: unknown }).updatedAt

  const resolvedId = typeof id === 'string' && id.trim().length > 0 ? id : undefined
  const resolvedUpdatedAt =
    typeof modifiedAt === 'string' && modifiedAt.trim().length > 0
      ? modifiedAt
      : typeof updatedAt === 'string' && updatedAt.trim().length > 0
        ? updatedAt
        : undefined

  if (!resolvedId && !resolvedUpdatedAt) return null
  return {
    ...(resolvedId ? { id: resolvedId } : {}),
    ...(resolvedUpdatedAt ? { updatedAt: resolvedUpdatedAt } : {}),
  }
}

const syncMetaWriteTokenFromResult = <TFormValue extends Record<string, unknown>>(
  form: { fields: { value: () => TFormValue; set: (value: TFormValue) => void } },
  result: unknown,
): void => {
  const token = toSubmitWriteToken(result)
  if (!token) return

  const current = form.fields.value()
  const currentMeta = (current as { meta?: Record<string, unknown> }).meta ?? {}
  form.fields.set({
    ...current,
    meta: {
      ...currentMeta,
      ...(token.id ? { id: token.id } : {}),
      ...(token.updatedAt ? { updatedAt: token.updatedAt } : {}),
    },
  } as TFormValue)
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
    }) as FormData,
  )

  let touched = $state.raw(false)
  let submitting = $state.raw(false)
  let submitted = $state.raw(false)
  let dirty = $derived(!deepEqual(initial, $state.snapshot(form.fields.value())))
  let wasSubmitAttempted = $state.raw(false)
  let isSubmitRequested = $state.raw(false)

  function clearSubmitAttemptState(): void {
    if (wasSubmitAttempted) wasSubmitAttempted = false
    if (isSubmitRequested) isSubmitRequested = false
  }

  function beginSubmitAttempt(): void {
    wasSubmitAttempted = true
    isSubmitRequested = true
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
        submittedValues:
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : undefined,
        successPrefix:
          ((
            data as {
              meta?: { mode?: unknown }
            } | null
          )?.meta?.mode ?? undefined) === 'create'
            ? m.gaudy_heavy_puma_adore()
            : m.tidy_game_jellyfish_pop(),
      })

      if (shouldRedirect) {
        await resourceResult.onRedirect?.({ data, success: outcome.success })
      }
    }

    await onresult?.(outcome)
  }

  const attributes = $derived.by(() => {
    const enhanced = form.enhance(async ({ submit, form: formEl, data }) => {
      if (submitting) return

      const typedData = data as Input
      const bf = !onsubmit || (await onsubmit({ dirty, form: formEl, data: typedData }))
      if (!bf) return
      // Lock immediately so rapid repeat submits cannot race preflight and send
      // duplicate requests with the same optimistic-concurrency token.
      submitting = true
      beginSubmitAttempt()

      const preflightIssues = await validate()
      const hasPreflightIssues = preflightIssues.length > 0
      if (hasPreflightIssues) {
        await focusInvalid(preflightIssues)
        const outcome: SubmitOutcome = { success: false, issues: preflightIssues }
        isSubmitRequested = false
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

        const submitIssues = form.fields.allIssues() ?? []
        const hasIssues = submitIssues.length > 0
        const success = !hasIssues
        if (success) {
          syncMetaWriteTokenFromResult(
            form as unknown as {
              fields: {
                value: () => Record<string, unknown>
                set: (value: Record<string, unknown>) => void
              }
            },
            form.result,
          )
        }
        resultDispatched = true
        const outcome: SubmitOutcome = {
          success,
          result: form.result,
          issues: hasIssues ? submitIssues : undefined,
        }
        if (success) clearSubmitAttemptState()
        else isSubmitRequested = false
        await dispatchResult(outcome, typedData)

        if (!success) {
          dirty = wasDirty
          await focusInvalid(submitIssues)
          onissues?.({ issues: submitIssues })
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
          const submitIssues = form.fields.allIssues() ?? []
          const hasIssues = submitIssues.length > 0
          const outcome: SubmitOutcome = {
            success: false,
            issues: hasIssues ? submitIssues : undefined,
            error: hasIssues ? undefined : (error as Error).message,
          }
          isSubmitRequested = false
          await dispatchResult(outcome, typedData)
        }
        dirty = wasDirty
      } finally {
        submitting = false
      }
    })

    const enhancedRecord = enhanced as Record<string | symbol, unknown>
    const enhancedOnSubmit =
      typeof enhancedRecord.onsubmit === 'function'
        ? (enhancedRecord.onsubmit as (event: SubmitEvent) => unknown)
        : undefined
    const enhancedOnInput =
      typeof enhancedRecord.oninput === 'function'
        ? (enhancedRecord.oninput as (event: Event) => unknown)
        : undefined
    const enhancedOnChange =
      typeof enhancedRecord.onchange === 'function'
        ? (enhancedRecord.onchange as (event: Event) => unknown)
        : undefined

    return mergeWithDescriptors(enhanced, {
      onsubmit: (event: SubmitEvent) => {
        const currentMeta = (form.fields.value() as { meta?: unknown } | null)?.meta
        syncMetaHiddenInputs(formEl, currentMeta)
        enhancedOnSubmit?.(event)
      },
      oninput: (event: Event) => {
        enhancedOnInput?.(event)
        if (wasSubmitAttempted) runDebouncedValidate()
      },
      onchange: (event: Event) => {
        enhancedOnChange?.(event)
        if (wasSubmitAttempted) runDebouncedValidate()
      },
    })
  })

  const result = $derived(form.result)
  const issues = $derived(form.fields.issues())
  const allIssues = $derived(form.fields.allIssues())
  const initialErrors = $derived(initialErrorsProp ?? !!dataId)
  let lastIssues = $state.raw<RemoteFormIssue[] | undefined>()

  use({
    track: () => ({ form, data, initialErrors }),
    mount: async current => {
      if (current.initialErrors) await validate().then(focusInvalid)
    },
    effect: current => {
      const nextData = $state.snapshot(current.data) as FormData
      const didSourceDataChange = !deepEqual(initial, nextData)
      const currentValue = $state.snapshot(current.form.fields.value()) as FormData
      const shouldSyncByValueDiff = !deepEqual(currentValue, nextData)
      const shouldHydrateUninitializedFields =
        shouldSyncByValueDiff &&
        !hasDefinedValue(currentValue) &&
        hasDefinedValue(nextData)
      const shouldPreservePostSubmitLocalEdits =
        wasSubmitAttempted && !isSubmitRequested && !submitting && dirty

      // Only hydrate fields from upstream data when the source snapshot changed.
      // This prevents invalid submissions from being overwritten by the last
      // committed entity values on reactive reruns.
      if (didSourceDataChange || shouldHydrateUninitializedFields) {
        if (shouldPreservePostSubmitLocalEdits) return
        current.form.fields.set(nextData)
        initial = nextData
        touched = false
        clearSubmitAttemptState()
      }

      if (current.initialErrors) validate().then(focusInvalid)
    },
  })

  const debouncedValidate = debounce(() => validate({ preflightOnly: false }), 300)

  function runDebouncedValidate(): void {
    if (typeof debouncedValidate === 'function') {
      debouncedValidate()
      return
    }
    const maybeWithCall = debouncedValidate as { call?: () => unknown }
    maybeWithCall.call?.()
  }

  async function validate(
    options: { preflightOnly?: boolean } = { preflightOnly: true },
  ): Promise<RemoteFormIssue[]> {
    const preflightOnly = options.preflightOnly ?? true
    await form.validate({ includeUntouched: true, preflightOnly })
    const nextIssues = form.fields.allIssues() ?? []
    const preflightIssues = preflightOnly
      ? nextIssues.filter(issue => !isServerIssue(issue))
      : nextIssues
    if (onissues && !deepEqual(lastIssues ?? [], nextIssues)) {
      onissues({ issues: nextIssues })
    }
    if (nextIssues.length > 0) lastIssues = nextIssues
    else lastIssues = undefined
    if (!preflightOnly) return nextIssues
    return preflightIssues
  }

  async function focusInvalid(currentIssues?: RemoteFormIssue[]) {
    await tick()

    const nextIssues = currentIssues ?? form.fields.allIssues() ?? []
    if (nextIssues.length > 0) lastIssues = nextIssues
    else return

    const invalid = formEl?.querySelector(
      ':is(input, select, textarea):not(.hidden, [type=hidden], :disabled)[aria-invalid]',
    ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null | undefined
    invalid?.focus()

    if (
      formEl?.querySelector(':is(input, select, textarea):disabled') &&
      nextIssues.some(issue => issue.message.includes('undefined'))
    ) {
      console.warn(
        'Ensure your form fields are not disabled when the validation is run.',
        'Disabled fields are treated as undefined values, because they are excluded from the form data.',
      )
    }
  }

  onMount(() => {
    const handleFocusIn = () => {
      if (touched) return
      touched = true
    }
    formEl?.addEventListener('focusin', handleFocusIn)
    return () => {
      formEl?.removeEventListener('focusin', handleFocusIn)
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
    result,
    issues,
    allIssues,
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
            ...options.meta,
            ...(current.meta ?? {}),
          },
        } as Parameters<typeof form.fields.set>[0])
      }
      syncMetaHiddenInputs(formEl, (form.fields.value() as { meta?: unknown })?.meta)
      beginSubmitAttempt()
      formEl?.requestSubmit()
    },
    clearSubmitAttemptState,
    reset: () => form.fields.set(initial),
  })
}
