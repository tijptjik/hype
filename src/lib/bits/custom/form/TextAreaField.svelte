<script lang="ts">
import * as InputPrimitive from './src/input/components'
import Label from './src/label/Label.svelte'
import type { TextAreaProps } from './textAreaField.types'

let {
  id,
  name,
  label,
  value = $bindable(''),
  isEditing = true,
  placeholder,
  required = false,
  disabled = false,
  readonly = false,
  issues,
  locale = 'core',
  isTranslated = false,
  isGenAI = false,
  rows = 5,
  textareaAttrs = {},
  class: className = '',
  controlClass = '',
  onValueChange,
  onToggleGenAI,
}: TextAreaProps = $props()

const wrapperClass = $derived(
  [
    'bits-form__field',
    isEditing && issues ? 'bits-form__field--error' : '',
    disabled ? 'bits-form__field--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const controlWrapClass = $derived(
  [
    'bits-form__control-wrap bits-form__control-wrap--textarea',
    isEditing ? 'bits-form__control-wrap--editing' : '',
    controlClass,
  ]
    .filter(Boolean)
    .join(' '),
)

const resolvedTextareaAttrs = $derived(
  isEditing ? textareaAttrs : { ...textareaAttrs, tabindex: -1 },
)
const resolvedPlaceholder = $derived(isEditing ? placeholder : placeholder || ' ')
const resolvedDisabled = $derived(isEditing ? disabled : false)
const resolvedReadonly = $derived(isEditing ? readonly : true)
const isGenAiDisabled = $derived(!isEditing || disabled)
const showGenAiToggle = $derived(
  locale !== 'core' && (typeof onToggleGenAI === 'function' || isGenAI),
)

function handleValueChange(nextValue: string): void {
  if (!isEditing) return
  onValueChange?.(nextValue)
  if (showGenAiToggle && isGenAI) onToggleGenAI?.()
}
</script>

<label class={wrapperClass} for={id}>
  <Label
    for={id}
    text={label}
    {required}
    {isEditing}
    issues={isEditing ? issues : undefined}
  />

  <div class={controlWrapClass}>
    <InputPrimitive.TextArea
      attrs={resolvedTextareaAttrs}
      {id}
      {name}
      bind:value
      placeholder={resolvedPlaceholder}
      {locale}
      {isTranslated}
      disabled={resolvedDisabled}
      readonly={resolvedReadonly}
      {rows}
      onValueChange={handleValueChange}
    />

    {#if showGenAiToggle}
      <div class="bits-form__gen-ai-wrap">
        <InputPrimitive.GenAI
          {isGenAI}
          disabled={isGenAiDisabled}
          onToggle={onToggleGenAI}
        />
      </div>
    {/if}
  </div>
</label>
