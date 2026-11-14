<script lang="ts">
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import Select from '#lib/bits/core/select/Select.svelte'
import LocationSearchRadius from '../../forms/featureLocation/LocationSearchRadius.svelte'
import FilterIcon from 'virtual:icons/proicons/filter'
let {
  query,
  source,
  radius,
  fields,
  busy,
  disabled,
  count,
  onquery,
  onsource,
  onradius,
}: {
  query: string
  source: string
  radius: number
  fields: { id: string; label: string }[]
  busy: boolean
  disabled: boolean
  count: number | null
  onquery: (value: string) => void
  onsource: (value: string) => void
  onradius: (value: number) => void
} = $props()
</script>
<fieldset
  {disabled}
  class="flex h-16 w-full min-w-0 items-center gap-3 px-4"
  aria-label="Location matching filters"
>
  <span class="text-muted-foreground flex h-10 shrink-0 items-center gap-2 text-sm"
    ><FilterIcon class="size-4" />Match by</span
  >
  <div class="w-[clamp(9.5rem,16cqw,12rem)] shrink-0">
    <Select
      {disabled}
      placeholder="Search source"
      triggerClass="h-10!"
      triggerAttrs={{ 'aria-label': 'Search source' }}
      value={source}
      items={[
        { value: 'brand', label: 'Brand' },
        { value: 'name', label: 'Feature name' },
        ...fields.map(f => ({ value: `field:${f.id}`, label: f.label })),
      ]}
      onValueChange={onsource}
    />
  </div>
  <label class="w-[clamp(9rem,18cqw,14rem)] shrink-0"
    ><span class="sr-only">Search locations</span>
    <input
      aria-label="Search locations"
      type="search"
      value={query}
      oninput={event => onquery(event.currentTarget.value)}
      placeholder="Search upstream locations"
      class="border-border bg-panel text-foreground h-10 w-full rounded-md border px-3"
    ></label
  >
  <span class="text-muted-foreground ml-auto text-xs tabular-nums" role="status"
    >{busy ? 'Searching…' : `${count ?? 0} matches`}</span
  >
  <Button
    text="Reset filters"
    size="sm"
    disabled={disabled || (source === 'brand' && radius === 50)}
    onClick={() => {
      onsource('brand')
      onradius(50)
    }}
  />
  <LocationSearchRadius
    compact
    {disabled}
    onchange={() => onradius(radius)}
    bind:value={radius}
  />
</fieldset>
