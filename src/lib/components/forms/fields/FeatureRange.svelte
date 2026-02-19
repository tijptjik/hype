<script lang="ts">
// TYPES
import type { Property } from '$lib/types'

type Props = {
  property: Property
  value: number | string
  onChange: (value: string) => void
}

let { property, value, onChange }: Props = $props()

// STATE : DERIVED
let numericValue = $derived(
  typeof value === 'string' ? parseFloat(value) || 0 : value || 0,
)
let min = $derived(property?.min || 0)
let max = $derived(property?.max || 100)
</script>

<div class="w-full">
  <input
    type="range"
    class="range range-primary w-full"
    {min}
    {max}
    step="1"
    value={numericValue}
    onchange={(e) => {
      const target = e.target as HTMLInputElement;
      onChange(target.value);
    }}
  >
  <div class="flex w-full justify-between px-2 text-xs">
    <span>{min}</span>
    <span>❘</span>
    <span>|</span>
    <span>❘</span>
    <span>{max}</span>
  </div>
</div>
