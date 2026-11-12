<script lang="ts">
import CreateLocalLocation from '../featureLocation/CreateLocalLocation.svelte'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
// I18N
import { m } from '#lib/i18n.js'
// API
import { findBuildingPartParents } from '#lib/api/buildingPart.remote.js'
let {
  projectId,
  address,
  buildingId = $bindable(''),
  parentPartId = $bindable(''),
  disabled = false,
  compact = false,
}: {
  projectId: string
  address?: FeatureAddress
  buildingId?: string
  parentPartId?: string
  disabled?: boolean
  compact?: boolean
} = $props()
let buildingSearch = $state('')
let createBuilding = $state(false)
let createdBuilding = $state<{ id: string; name: string } | null>(null)
let partSearch = $state('')
const buildings = $derived(
  buildingSearch.trim()
    ? findBuildingPartParents({ projectId, kind: 'building', q: buildingSearch.trim() })
    : null,
)
const parts = $derived(
  buildingId && partSearch.trim()
    ? findBuildingPartParents({
        projectId,
        kind: 'building_part',
        buildingId,
        q: partSearch.trim(),
      })
    : null,
)
</script>

<div
  class={compact
    ? 'flex w-full min-w-0 flex-col items-center gap-4 text-left'
    : 'space-y-3'}
  data-building-part-parents
>
  <div
    class={compact
      ? 'block w-full max-w-xs space-y-2 text-sm'
      : 'block space-y-2 text-sm'}
  >
    <span class={compact ? 'sr-only' : ''}>{m.location_part_building()}</span>
    <input
      class={compact
        ? 'border-primary/25 bg-background focus-visible:outline-primary w-full rounded-full border px-4 py-2.5 text-sm focus-visible:outline-2'
        : 'border-border bg-background w-full rounded border p-2'}
      aria-label={m.location_part_building()}
      placeholder={compact ? m.location_part_building() : undefined}
      type="search"
      bind:value={buildingSearch}
      {disabled}
      oninput={() => {
        buildingId = ''
        parentPartId = ''
      }}
    >
    {#if buildings}
      {#await buildings}
        <span role="status">…</span>
      {:then result}
        {#if compact}
          <fieldset
            class="flex max-h-40 flex-col gap-1 overflow-y-auto"
            aria-label={m.location_part_building()}
          >
            {#each [
              ...(createdBuilding &&
              !result.data.some(row => row.id === createdBuilding?.id)
                ? [
                    {
                      id: createdBuilding.id,
                      facts: { names: { en: createdBuilding.name } },
                    },
                  ]
                : []),
              ...result.data,
            ] as row (row.id)}
              <button
                type="button"
                aria-pressed={buildingId === row.id}
                {disabled}
                class="border-primary/20 hover:bg-primary/10 focus-visible:outline-primary aria-pressed:bg-primary/10 rounded-lg border px-3 py-2 text-left text-sm break-words whitespace-normal focus-visible:outline-2 aria-pressed:font-semibold"
                onclick={() => {
                  buildingId = row.id
                  parentPartId = ''
                }}
              >
                {Object.values(row.facts?.names ?? {}).find(Boolean) ?? row.id}
              </button>
            {/each}
          </fieldset>
        {:else}
          <select
            class="border-border bg-background w-full rounded border p-2"
            aria-label={m.location_part_building()}
            bind:value={buildingId}
            {disabled}
            required
            onchange={() => (parentPartId = '')}
          >
            <option value="">—</option>
            {#if createdBuilding &&
              !result.data.some(row => row.id === createdBuilding?.id)}
              <option value={createdBuilding.id}>{createdBuilding.name}</option>
            {/if}
            {#each result.data as row (row.id)}
              <option value={row.id}>
                {Object.values(row.facts?.names ?? {}).find(Boolean) ?? row.id}
              </option>
            {/each}
          </select>
        {/if}
      {:catch}
        <span role="alert">{m.feature_location_failed()}</span>
      {/await}
    {/if}
  </div>
  {#if address?.coordinates}
    {#if !createBuilding}
      <button
        type="button"
        class={compact
          ? 'bg-primary text-primary-content hover:bg-primary/90 focus-visible:outline-primary rounded-full px-5 py-2.5 text-sm font-medium focus-visible:outline-2'
          : 'rounded border px-3 py-2 text-sm'}
        {disabled}
        onclick={() => (createBuilding = true)}
      >
        Create a local building
      </button>
    {/if}
    {#if createBuilding}
      <CreateLocalLocation
        open={true}
        hideTrigger={true}
        initialKind="building"
        initialName={buildingSearch}
        initialAddress={address}
        coordinates={address.coordinates}
        {projectId}
        {disabled}
        onCancel={() => (createBuilding = false)}
        onCreated={result => {
          buildingId = result.locationId
          parentPartId = ''
          createdBuilding = {
            id: result.locationId,
            name: Object.values(result.facts.names).find(Boolean) ?? result.locationId,
          }
          buildingSearch = createdBuilding.name
          createBuilding = false
        }}
      />
    {/if}
  {/if}
  {#snippet parentField()}
    <label class="block space-y-2 text-sm">
      <span>{m.location_part_parent()}</span>
      <input
        class="border-border bg-background w-full rounded border p-2"
        type="search"
        bind:value={partSearch}
        disabled={disabled || !buildingId}
        oninput={() => (parentPartId = '')}
      >
      {#if parts}
        {#await parts}
          <span role="status">…</span>
        {:then result}
          <select
            class="border-border bg-background w-full rounded border p-2"
            aria-label={m.location_part_parent()}
            bind:value={parentPartId}
            {disabled}
          >
            <option value="">—</option>
            {#each result.data as row (row.id)}
              <option value={row.id}>
                {Object.values(row.facts?.names ?? {}).find(Boolean) ?? row.id}
              </option>
            {/each}
          </select>
        {:catch}
          <span role="alert">{m.feature_location_failed()}</span>
        {/await}
      {/if}
    </label>
  {/snippet}
  {#if compact}
    {#if buildingId}
      <details class="w-full max-w-xs text-sm">
        <summary
          class="text-muted-foreground hover:text-primary cursor-pointer py-2 text-center"
        >
          {m.location_part_parent()}
        </summary>
        {@render parentField()}
      </details>
    {/if}
  {:else}
    {@render parentField()}
  {/if}
</div>
