<script lang="ts">
import RangeSlider from 'svelte-range-slider-pips'
import RotateCcwIcon from 'virtual:icons/lucide/rotate-ccw'

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

<div class={rangeClass}>
  {#if isEditing}
    <button
      type="button"
      class="bits-feature-field__range-unset"
      disabled={!hasValue}
      aria-disabled={!hasValue}
      aria-label="Reset range value"
      onclick={handleUnset}
    >
      <RotateCcwIcon />
    </button>
  {/if}

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
</div>
