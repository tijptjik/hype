<script lang="ts">
import * as InputPrimitive from './src/input/components'
import Label from './src/label/Label.svelte'
import type { TextAreaProps } from './textArea.types'

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

const displayClass = $derived(
  [
    'bits-form__control bits-form__control--textarea bits-form__control--display',
    'bits-form__control--textarea-readonly',
    value === '' ? 'bits-form__control--placeholder' : 'bits-form__control--filled',
    isTranslated && locale !== 'core' ? 'bits-form__control--translated' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

const displayValue = $derived(value?.trim() || placeholder || ' ')
const isGenAiDisabled = $derived(!isEditing || disabled)
</script>

<label class={wrapperClass} for={id}>
  <Label for={id} text={label} {required} issues={isEditing ? issues : undefined} />

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
        {onValueChange}
      />
    {:else}
      <div class={displayClass}>{displayValue}</div>
    {/if}

    {#if isTranslated && (locale !== 'core' || isGenAI)}
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
