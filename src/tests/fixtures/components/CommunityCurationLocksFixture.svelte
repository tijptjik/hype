<script lang="ts">
// COMPONENTS
import CommunityCurationLocks from '#lib/bits/patterns/forms/localLocationAddress/CommunityCurationLocks.svelte'
// TYPES
import type { CurationOpenFields } from '#lib/locations/curationLocks.js'
let revision = $state<string | null>(null)
let fields = $state<CurationOpenFields>({})
let saves = $state(0)
let stale = $state(false)
let administrator = $state(true)
</script>
<div class="bg-panel text-foreground m-4 rounded-xl border p-4">
  <div class="flex items-center gap-3" data-location-record-toolbar>
    <h1 class="text-lg font-semibold">AROME · Central</h1>
    {#if administrator}
      <CommunityCurationLocks
        openFields={fields}
        load={async () => ({
          revision,
          openFields: $state.snapshot(fields),
          available: true,
        })}
        save={async (expected, next) => {
          if (stale || expected !== revision) throw new Error('Conflict')
          fields = next
          revision = String(++saves)
        }}
      />
    {/if}
  </div>
  <label class="mt-4 flex gap-2"
    ><input type="checkbox" bind:checked={stale}>Simulate concurrent change</label
  >
  <label class="mt-4 flex gap-2"
    ><input type="checkbox" bind:checked={administrator}>SuperAdmin</label
  >
  <output data-lock-state class="sr-only"
    >{JSON.stringify({ fields, revision, saves })}</output
  >
</div>
