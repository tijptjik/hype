<script lang="ts">
import { handleTrimmedTextControlBlur } from '$lib/client/services/form'
import { m } from '$lib/i18n'
import type { FormInputPrimitiveProps } from './types'

let {
  id,
  name,
  type = 'text',
  value = $bindable(''),
  placeholder,
  locale = 'core',
  isTranslated = false,
  disabled = false,
  readonly = false,
  class: className = '',
  attrs = {},
  onValueChange,
}: FormInputPrimitiveProps = $props()

const resolvedPlaceholder = $derived(
  placeholder ??
    (type === 'text' ? m.suave_livid_wombat_zoom() : m.muddy_each_herring_boil()),
)
const resolvedType = $derived((attrs?.type as string | undefined) ?? type)
const resolvedId = $derived((id ?? (attrs?.id as string | undefined)) || undefined)
const resolvedName = $derived(
  (name ?? (attrs?.name as string | undefined) ?? resolvedId) || undefined,
)

const inputClass = $derived(
  [
    'bits-form__control bits-form__control--input',
    value === '' ? 'bits-form__control--placeholder' : 'bits-form__control--filled',
    isTranslated && locale !== 'core' ? 'bits-form__control--translated' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

function handleInput(event: Event): void {
  const forwardedHandler = attrs?.oninput
  if (typeof forwardedHandler === 'function') {
    forwardedHandler(event)
  }
  const target = event.currentTarget as HTMLInputElement
  value = target.value
  onValueChange?.(value)
}

function handleKeydown(event: KeyboardEvent): void {
  const forwardedHandler = attrs?.onkeydown
  if (typeof forwardedHandler === 'function') {
    forwardedHandler(event)
  }
}

function handleBlur(event: FocusEvent): void {
  const forwardedHandler = attrs?.onblur
  if (typeof forwardedHandler === 'function') {
    forwardedHandler(event)
  }

  handleTrimmedTextControlBlur({
    event,
    value,
    setValue: nextValue => {
      value = nextValue
    },
    onValueChange,
  })
}
</script>

<input
  {...attrs}
  id={resolvedId}
  {disabled}
  {readonly}
  data-testid={resolvedId}
  type={resolvedType}
  name={resolvedName}
  bind:value
  placeholder={resolvedPlaceholder}
  class={inputClass}
  oninput={handleInput}
  onblur={handleBlur}
  onkeydown={handleKeydown}
>
