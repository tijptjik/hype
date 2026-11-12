<script lang="ts">
// API
import {
  findIdentityCatalogue,
  getIdentityCatalogue,
} from '#lib/api/identityCatalogue.remote.js'
// TYPES
import type { IdentityCatalogueRecord } from '#lib/locations/identityCatalogue.js'
let {
  kind,
  value,
  onChange,
  disabled = false,
  organisationId,
  excludeDescendantsOf,
}: {
  kind: 'brand' | 'group'
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  organisationId?: string | null
  excludeDescendantsOf?: string
} = $props()
let search = $state(''),
  results = $state<IdentityCatalogueRecord[]>([]),
  failed = $state(false)
let selected = $state<IdentityCatalogueRecord | null>(null)
const label = $derived(kind === 'brand' ? 'Brand' : 'Group')
$effect(() => {
  const query = search,
    type = kind,
    excludedGroup = excludeDescendantsOf
  let cancelled = false
  const timer = setTimeout(() => {
    void findIdentityCatalogue({
      kind: type,
      search: query,
      excludeDescendantsOf: excludedGroup,
    })
      .then(rows => {
        if (!cancelled) results = rows
      })
      .catch(() => {
        if (!cancelled) failed = true
      })
  }, 150)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
})
$effect(() => {
  const id = value
  let cancelled = false
  selected = null
  if (id)
    void getIdentityCatalogue({ id })
      .then(row => {
        if (!cancelled) selected = row
      })
      .catch(() => {
        if (!cancelled) failed = true
      })
  return () => {
    cancelled = true
  }
})
</script>
<section class="grid min-w-0 gap-2" aria-label={`${label} catalogue`}>
  <label class="grid gap-1 text-sm"
    >{label}<input
      bind:value={search}
      {disabled}
      placeholder={`Search ${kind}s`}
      class="min-w-0 rounded-md border p-2"
    ></label
  >
  {#if selected}
    <a
      class="text-sm underline"
      href={`/admin/catalogue?id=${selected.id}${organisationId ? `&organisation=${organisationId}` : ''}`}
      >{selected.i18n.en.name}</a
    >
  {/if}
  {#if !disabled}
    <select
      aria-label={`Select ${kind}`}
      value={value ?? ''}
      class="min-w-0 rounded-md border p-2 text-sm"
      onchange={event => onChange(event.currentTarget.value || null)}
    >
      <option value="">No {kind} link</option>
      {#if selected && !results.some(row => row.id === selected?.id)}
        <option value={selected.id}>
          {selected.i18n.en.name}
          · {selected.code ?? selected.id}
        </option>
      {/if}
      {#each results as record (record.id)}
        <option value={record.id}>
          {record.i18n.en.name}
          · {record.code ?? record.id}
        </option>
      {/each}
    </select>
    {#if value}
      <button
        type="button"
        class="text-left text-xs underline"
        onclick={() => onChange(value)}
      >
        Use latest catalogue version
      </button>
    {/if}
    <a
      class="text-xs underline"
      href={`/admin/catalogue${organisationId ? `?organisation=${organisationId}` : ''}`}
      >Manage brands and groups</a
    >
  {/if}
  {#if failed}
    <p role="alert" class="text-sm">Catalogue unavailable</p>
  {/if}
</section>
