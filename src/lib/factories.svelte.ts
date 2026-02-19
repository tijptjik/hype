import { beforeNavigate } from '$app/navigation'
import { debounce, deepEqual } from '@sillvva/utils'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  RemoteForm,
  RemoteFormInput,
  RemoteFormIssue,
  RemoteQuery,
  RemoteQueryOverride,
} from '@sveltejs/kit'
import { onMount, tick, untrack } from 'svelte'
import { v7 } from 'uuid'

type Awaitable<T> = T | PromiseLike<T>

const META_HIDDEN_ATTR = 'data-remote-meta-hidden'
const META_KEYS = ['id', 'updatedAt', 'mode', 'isAdminRequest'] as const

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

export type GenericFormConfig<T extends RemoteFormInput = RemoteFormInput> = ReturnType<
  typeof configureForm<T>
>
export type GenericForm<T extends RemoteFormInput = RemoteFormInput> = ReturnType<
  GenericFormConfig<T>
>

type FormId<Input> = Input extends { id: infer Id }
  ? Id extends string | number
    ? Id
    : string | number
  : string | number

export interface RemoteFormOptions<Input extends RemoteFormInput = RemoteFormInput> {
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
  }) => Awaitable<Array<RemoteQuery<any> | RemoteQueryOverride> | undefined>
  onresult?: (ctx: {
    readonly success: boolean
    readonly result?: RemoteForm<Input, unknown>['result']
    readonly issues?: RemoteFormIssue[]
    readonly error?: string
  }) => Awaitable<void>
  formEl?: HTMLFormElement
}

export function configureForm<Input extends RemoteFormInput = RemoteFormInput>(
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
    formEl,
  } = $derived(getProps())

  type FormData = Input extends undefined ? Record<string, never> : Input
  const data = $derived((formData ?? {}) as FormData)
  const key = $derived(formKey ?? ((data.id ?? v7()) as FormId<Input>))
  const form = $derived(
    schema ? remoteForm.for(key).preflight(schema) : remoteForm.for(key),
  )

  let initial = $state.raw(
    use({
      track: () => data,
      ssr: form.fields.set,
      pre: form.fields.set,
    }),
  )

  let touched = $state.raw(false)
  let submitting = $state.raw(false)
  let submitted = $state.raw(false)
  let dirty = $derived(!deepEqual(initial, $state.snapshot(form.fields.value())))

  const attributes = $derived(
    Object.assign(
      form.enhance(async ({ submit, form: formEl, data }) => {
        if (submitting) return

        const bf = !onsubmit || (await onsubmit({ dirty, form: formEl, data }))
        if (!bf) {
          return
        }

        await validate()
        const hasPreflightIssues = (allIssues?.length ?? 0) > 0
        if (hasPreflightIssues) {
          await focusInvalid()
          await onresult?.({ success: false, issues: allIssues ?? [] })
          onissues?.({ issues: allIssues ?? [] })
          return
        }

        submitting = true

        const wasDirty = dirty
        let resultDispatched = false
        try {
          dirty = false
          const updates = await onsubmitupdates?.({ dirty, form: formEl, data })
          if (updates && updates.length > 0) {
            await submit().updates(...updates)
          } else {
            await submit()
          }
          submitted = true

          const hasIssues = (allIssues?.length ?? 0) > 0
          const success = !hasIssues
          resultDispatched = true
          await onresult?.({
            success,
            result: form.result,
            issues: hasIssues ? allIssues : undefined,
          })

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
            await onresult?.({
              success: false,
              issues: hasIssues ? allIssues : undefined,
              error: hasIssues ? undefined : (error as Error).message,
            })
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
  const initialErrors = $derived(initialErrorsProp ?? !!data?.id)
  let lastIssues = $state.raw<RemoteFormIssue[] | undefined>()

  use({
    track: () => form,
    mount: async () => {
      if (initialErrors) await validate().then(focusInvalid)
    },
    effect: () => {
      form.fields.set(data)
      initial = $state.snapshot(data)
      touched = false
      if (initialErrors) validate(true).then(focusInvalid)
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
    result,
    issues,
    allIssues,
    validate,
    debouncedValidate,
    reset: () => form.fields.set(initial),
  })
}
