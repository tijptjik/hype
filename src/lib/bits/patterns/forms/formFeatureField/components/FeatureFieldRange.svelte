<script lang="ts">
import RangeSlider from 'svelte-range-slider-pips'
import RotateCcwIcon from 'virtual:icons/proicons/arrow-counterclockwise'

type Props = {
  value?: string | null
  min?: number | null
  max?: number | null
  isEditing?: boolean
  onChange: (value: string) => void
}

let { value = '', min = 0, max = 100, isEditing = true, onChange }: Props = $props()

const resolvedMin = $derived(min ?? 0)
const resolvedMax = $derived(max ?? 100)
const hasValue = $derived(
  typeof value === 'string' ? value.trim().length > 0 : value != null,
)
const resolvedValue = $derived(hasValue ? Number(value ?? resolvedMin) : resolvedMin)
const fillPercent = $derived(
  resolvedMax > resolvedMin
    ? Math.max(
        0,
        Math.min(
          100,
          ((resolvedValue - resolvedMin) / (resolvedMax - resolvedMin)) * 100,
        ),
      )
    : 100,
)
const rangeClass = $derived(
  ['bits-feature-field__range', !hasValue ? 'bits-feature-field__range--unset' : '']
    .filter(Boolean)
    .join(' '),
)
let values = $state<[number]>([0])

$effect(() => {
  values = [resolvedValue]
})

function handleUnset(): void {
  values = [resolvedMin]
  onChange('')
}
</script>

<!-- Reserve the same height for both modes; override library pip margins so flex layout cannot collapse the track. -->
<div
  class={[
    rangeClass,
    'h-12 [&_.rangeSlider]:shrink-0 [&_.rangeSlider]:mt-[0.45rem]! [&_.rangeSlider]:mb-[1.15rem]!',
    isEditing ? 'pt-2!' : 'pt-0! pl-0!',
  ]
    .filter(Boolean)
    .join(' ')}
>
  {#if !isEditing}
    <!-- biome-ignore lint/a11y/useSemanticElements: Native meter hides the custom fill-end label; expose equivalent meter semantics here. -->
    <div
      class="bg-primary/10 relative flex h-12 items-center overflow-hidden rounded-md"
      role="meter"
      aria-label="Value within range"
      aria-valuemin={resolvedMin}
      aria-valuemax={resolvedMax}
      aria-valuenow={resolvedValue}
    >
      <div
        class="bg-primary/25 absolute inset-y-0 left-0"
        style:width={`${fillPercent}%`}
      ></div>
      <output
        class="text-foreground relative flex h-full min-w-fit items-center justify-end px-3 text-base font-medium"
        style:width={`${fillPercent}%`}
        >{hasValue ? resolvedValue : '—'}</output
      >
    </div>
  {/if}
  {#if isEditing}
    <button
      type="button"
      class="bits-feature-field__range-unset top-[1.125rem]!"
      disabled={!hasValue}
      aria-disabled={!hasValue}
      aria-label="Reset range value"
      onclick={handleUnset}
    >
      <RotateCcwIcon />
    </button>
  {/if}

  {#if isEditing}
    <RangeSlider
      min={resolvedMin}
      max={resolvedMax}
      step={1}
      bind:values
      disabled={!isEditing}
      pips
      first="label"
      last="label"
      rest="pip"
      pipstep={Math.max(1, Math.ceil((resolvedMax - resolvedMin) / 4))}
      on:change={() => onChange(String(values[0] ?? resolvedMin))}
    />
  {/if}
</div>
