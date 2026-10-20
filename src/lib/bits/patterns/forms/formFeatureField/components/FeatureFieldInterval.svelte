<script lang="ts">
// COMPONENTS
import PropertyRangeControl from './PropertyRangeControl.svelte'
// CONTRACT
import {
  normalizeRangeValue,
  RangeValueSchema,
  rangeDomain,
  rangeText,
  type RangeDefinition,
} from '#lib/properties/range.js'
let {
  definition,
  value = '',
  isEditing = true,
  onChange,
}: {
  definition: RangeDefinition
  value?: string | null
  isEditing?: boolean
  onChange: (value: string) => void
} = $props()
const decoded = $derived.by(() => {
  try {
    const normalized = normalizeRangeValue(definition, value)
    return {
      available: true,
      value: normalized ? RangeValueSchema.parse(JSON.parse(normalized)) : null,
    }
  } catch {
    return { available: false, value: null }
  }
})
const bounds = $derived(rangeDomain(definition))
const values = $derived<[number, number]>(
  decoded.value ? [decoded.value.start, decoded.value.end] : [bounds.min, bounds.max],
)
</script>

<div class="min-w-0 flex-1 space-y-2">
  {#if !decoded.available}
    <p role="status">
      This value requires a newer editor. The stored value is preserved.
    </p>
  {:else if !isEditing}
    <output class="flex min-h-12 items-center text-base"
      >{rangeText(definition, value) || '—'}</output
    >
  {:else}
    <PropertyRangeControl
      {definition}
      {values}
      hasValue={Boolean(decoded.value)}
      onReset={() => onChange('')}
      onChange={range =>
        onChange(JSON.stringify({ version: 1, start: range[0], end: range[1] }))}
    />
  {/if}
</div>
