<script lang="ts">
import * as InputPrimitive from './src/input/components'
import Label from './src/label/Label.svelte'
import FieldError from './src/label/components/Error.svelte'
import type { TextInputProps } from './textInputField.types'

let {
  id,
  name,
  label,
  labelIcon: LabelIcon,
  labelRight,
  trailing,
  value = $bindable(''),
  isEditing = true,
  variant = 'default',
  placeholder,
  prefix,
  fitValue = false,
  fitMinWidth = '4rem',
  required = false,
  disabled = false,
  readonly = false,
  issues,
  errorId,
  locale = 'core',
  isTranslated = false,
  isGenAI = false,
  inputType = 'text',
  trimOnBlur = true,
  inputAttrs = {},
  class: className = '',
  controlClass = '',
  inputClass = '',
  onValueChange,
  onToggleGenAI,
}: TextInputProps = $props()

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

// Match the resource editor's inline fields without changing standalone input defaults.
const resourceAppearance = $derived(
  variant !== 'resource'
    ? ''
    : [
        'bg-transparent! rounded-md!',
        !isEditing
          ? 'border-transparent! shadow-none! ring-0!'
          : issues?.length
            ? 'border-error! ring-error/20!'
            : 'border-border/30! hover:border-border/60! focus-within:border-primary/70!',
      ].join(' '),
)

const controlWrapClass = $derived(
  [
    'bits-form__control-wrap',
    isEditing ? 'bits-form__control-wrap--editing' : '',
    prefix || fitValue || trailing ? 'flex! flex-row! items-center! gap-2' : '',
    resourceAppearance,
    controlClass,
  ]
    .filter(Boolean)
    .join(' '),
)

const resolvedInputAttrs = $derived({
  ...(fitValue ? { size: 1 } : {}),
  ...inputAttrs,
  ...(!isEditing ? { tabindex: -1 } : {}),
})
const resolvedPlaceholder = $derived(disabled ? '-' : placeholder)
const resolvedDisabled = $derived(disabled)
const resolvedReadonly = $derived(disabled ? false : isEditing ? readonly : true)
const isGenAiDisabled = $derived(!isEditing || disabled)
const showGenAiToggle = $derived(
  locale !== 'core' && (typeof onToggleGenAI === 'function' || isGenAI),
)

function handleValueChange(nextValue: string): void {
  if (!isEditing) return
  onValueChange?.(nextValue)
  // The owning form clears generation metadata when recording authored text.
}
</script>

{#snippet inputControl()}
  <InputPrimitive.Input
    attrs={resolvedInputAttrs}
    {id}
    {name}
    class={`${inputClass} ${trailing ? 'min-w-0 flex-1' : ''} ${fitValue ? 'col-start-1 row-start-1 w-full! min-w-0!' : ''}`}
    type={inputType}
    {trimOnBlur}
    bind:value
    placeholder={resolvedPlaceholder}
    {locale}
    {isTranslated}
    disabled={resolvedDisabled}
    readonly={resolvedReadonly}
    onValueChange={handleValueChange}
  />
{/snippet}

<div class={wrapperClass}>
  {#if LabelIcon || labelRight}
    <div class="flex min-w-0 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        {#if LabelIcon}
          <LabelIcon class="text-muted-foreground size-4 shrink-0" />
        {/if}
        <Label for={id} text={label} {required} {isEditing} />
      </div>
      {@render labelRight?.()}
    </div>
  {:else}
    <Label for={id} text={label} {required} {isEditing} />
  {/if}

  <div class={controlWrapClass}>
    {#if prefix}
      <span
        aria-hidden="true"
        class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs select-none"
        >{prefix}</span
      >
    {/if}
    {#if fitValue}
      <div
        class="grid max-w-full grid-cols-[minmax(0,1fr)]"
        style:min-width={fitMinWidth}
      >
        <span
          aria-hidden="true"
          class="col-start-1 row-start-1 whitespace-pre px-3 text-sm {inputClass} invisible"
          >{value || resolvedPlaceholder?.split(/,|、|，/)[0] || '88'} </span
        >
        {@render inputControl()}
      </div>
    {:else}
      {@render inputControl()}
    {/if}

    {#if trailing}
      <div class="flex shrink-0 items-center">{@render trailing()}</div>
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
  {#if isEditing && issues?.length && errorId}
    <div id={errorId} role="alert"><FieldError {issues} class="px-4" /></div>
  {:else}
    <FieldError issues={isEditing ? issues : undefined} class="px-4" />
  {/if}
</div>
