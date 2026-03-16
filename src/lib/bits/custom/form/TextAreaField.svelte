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

const displayValue = $derived(value ?? '')
const displayPlaceholder = $derived(placeholder || ' ')
const isGenAiDisabled = $derived(!isEditing || disabled)
const showGenAiToggle = $derived(
  locale !== 'core' && (typeof onToggleGenAI === 'function' || isGenAI),
)

function handleValueChange(nextValue: string): void {
  onValueChange?.(nextValue)
  if (showGenAiToggle && isGenAI) onToggleGenAI?.()
}

const readonlyTextareaAttrs = $derived({ ...textareaAttrs, tabindex: -1 })
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
    {#if isEditing}
      <InputPrimitive.TextArea
        attrs={textareaAttrs}
        {id}
        {name}
        bind:value
        {placeholder}
        {locale}
        {isTranslated}
        {disabled}
        {readonly}
        {rows}
        onValueChange={handleValueChange}
      />
    {:else}
      <InputPrimitive.TextArea
        attrs={readonlyTextareaAttrs}
        {id}
        {name}
        value={displayValue}
        placeholder={displayPlaceholder}
        {locale}
        {isTranslated}
        disabled={false}
        readonly={true}
        {rows}
      />
    {/if}

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
