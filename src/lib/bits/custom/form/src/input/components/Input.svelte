<script lang="ts">
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
</script>

<input
  {...attrs}
  {id}
  {disabled}
  {readonly}
  data-testid={id}
  type={resolvedType}
  name={name ?? id}
  bind:value
  placeholder={resolvedPlaceholder}
  class={inputClass}
  oninput={handleInput}
>
