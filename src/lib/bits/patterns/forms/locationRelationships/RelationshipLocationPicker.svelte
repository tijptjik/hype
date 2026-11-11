<script lang="ts">
// BITS
import { TextInput } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/button/index.js'
// ICONS
import CloseIcon from 'virtual:icons/lucide/x'
// API
import { getLocations } from '#lib/api/locationDirectory.remote.js'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'

let {
  label,
  selected = [],
  onChange,
  organisationId = null,
  queryScope = '',
  multiple = false,
  exclude = [],
  accepts = () => true,
  disabled = false,
}: {
  label: string
  selected?: { id: string; label: string }[]
  onChange: (items: { id: string; label: string }[]) => void
  organisationId?: string | null
  queryScope?: string
  multiple?: boolean
  exclude?: string[]
  accepts?: (kind: LocationKind) => boolean
  disabled?: boolean
} = $props()
const uid = $props.id()
let search = $state('')
const request = $derived(
  search.trim().length >= 2
    ? getLocations({
        q: search.trim(),
        organisationId: organisationId ?? undefined,
        scope: queryScope,
      })
    : null,
)
</script>

<div class="min-w-0 space-y-3">
  <TextInput
    variant="resource"
    id={uid}
    name=""
    {label}
    value={search}
    placeholder="Search Locations by name"
    {disabled}
    onValueChange={value => (search = value)}
  />
  {#each selected as item (item.id)}
    <div
      class="bg-muted/40 flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2"
    >
      <a
        class="min-w-0 text-sm font-medium break-words whitespace-normal hover:underline"
        href={`/admin/locations/${encodeURIComponent(item.id)}`}
        >{item.label}</a
      >
      <Button
        text={`Remove ${item.label}`}
        iconComponent={CloseIcon}
        modifier="square"
        hideLabel
        hideLabelInstantly
        size="sm"
        style="ghost"
        {disabled}
        onClick={() => onChange(selected.filter(value => value.id !== item.id))}
      />
    </div>
  {/each}
  {#if request}
    {#await request}
      <p role="status" class="text-muted-foreground text-sm">Searching Locations…</p>
    {:then result}
      {@const matches = result.data.filter(
        item =>
          !exclude.includes(item.id) &&
          !selected.some(value => value.id === item.id) &&
          accepts(item.kind),
      )}
      <fieldset
        class="max-h-64 space-y-1 overflow-y-auto"
        aria-label={`${label} results`}
      >
        {#each matches as item (item.id)}
          {@const title =
            item.facts?.names.en ||
            Object.values(item.facts?.names ?? {}).find(Boolean) ||
            item.id}
          <button
            type="button"
            class="hover:bg-muted focus-visible:ring-primary grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-lg p-3 text-left focus-visible:ring-2"
            {disabled}
            onclick={() => {
              onChange([...(multiple ? selected : []), { id: item.id, label: title }])
              search = ''
            }}
          >
            <span class="text-sm font-medium break-words whitespace-normal"
              >{title}</span
            >
            <span class="text-muted-foreground text-xs"
              >{item.kind.replaceAll('_', ' ')}</span
            >
          </button>
        {:else}
          <p class="text-muted-foreground text-sm">
            No matching Locations. Try another name.
          </p>
        {/each}
      </fieldset>
    {:catch}
      <p role="alert" class="text-destructive text-sm">
        Could not search Locations. Try again.
      </p>
    {/await}
  {/if}
</div>
