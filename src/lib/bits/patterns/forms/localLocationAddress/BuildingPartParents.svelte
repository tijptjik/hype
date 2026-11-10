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
}: {
  projectId: string
  address?: FeatureAddress
  buildingId?: string
  parentPartId?: string
  disabled?: boolean
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

<div class="space-y-3" data-building-part-parents>
  <label class="block space-y-2 text-sm">
    <span>{m.location_part_building()}</span>
    <input
      class="border-border bg-background w-full rounded border p-2"
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
      {:catch}
        <span role="alert">{m.feature_location_failed()}</span>
      {/await}
    {/if}
  </label>
  {#if address?.coordinates}
    {#if !createBuilding}
      <button
        type="button"
        class="rounded border px-3 py-2 text-sm"
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
</div>
