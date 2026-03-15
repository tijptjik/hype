<script lang="ts">
import { handleTrimmedTextControlBlur } from '$lib/client/services/form'
import { m } from '$lib/i18n'
import type { FormTextAreaPrimitiveProps } from './types'

let {
  id,
  name,
  value = $bindable(''),
  placeholder,
  locale = 'core',
  isTranslated = false,
  disabled = false,
  readonly = false,
  rows = 5,
  class: className = '',
  attrs = {},
  onValueChange,
}: FormTextAreaPrimitiveProps = $props()
let textareaElement: HTMLTextAreaElement | null = $state(null)
const resolvedPlaceholder = $derived(placeholder ?? m.suave_livid_wombat_zoom())
const resolvedId = $derived((id ?? (attrs?.id as string | undefined)) || undefined)
const resolvedName = $derived(
  (name ?? (attrs?.name as string | undefined) ?? resolvedId) || undefined,
)

const textareaClass = $derived(
  [
    'bits-form__control bits-form__control--textarea',
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
  const target = event.currentTarget as HTMLTextAreaElement
  value = target.value
  adjustHeight()
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
    afterSync: adjustHeight,
  })
}

function adjustHeight(): void {
  if (!textareaElement) return

  textareaElement.style.height = 'auto'

  const maxHeight = 512
  const nextHeight = Math.min(textareaElement.scrollHeight, maxHeight)

  textareaElement.style.height = `${nextHeight}px`
  textareaElement.style.overflowY =
    textareaElement.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

$effect(() => {
  value
  adjustHeight()
})
</script>

<textarea
  bind:this={textareaElement}
  {...attrs}
  id={resolvedId}
  {disabled}
  {readonly}
  data-testid={resolvedId}
  name={resolvedName}
  bind:value
  {rows}
  placeholder={resolvedPlaceholder}
  class={textareaClass}
  oninput={handleInput}
  onblur={handleBlur}
  onkeydown={handleKeydown}
></textarea>
