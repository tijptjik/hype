<script lang="ts">
// TYPES
import type { SpatialRealm } from '../../../../src/lib/fieldResearch/recorder'
let {
  value,
  onchange,
  disabled = false,
}: {
  value: SpatialRealm
  onchange: (realm: SpatialRealm) => void
  disabled?: boolean
} = $props()
</script>

<fieldset class="grid gap-2" {disabled}>
  <legend class="mb-2 text-sm font-medium text-slate-300">Spatial realm</legend>
  <div class="grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-900 p-1">
    {#each ['interior', 'exterior'] as realm (realm)}
      <button
        type="button"
        aria-pressed={value === realm}
        class={[
          'min-h-12 rounded-lg font-semibold capitalize',
          value === realm ? 'bg-slate-200 text-slate-950' : 'text-slate-300',
        ]}
        onclick={() => onchange(realm as SpatialRealm)}
      >
        {realm}
      </button>
    {/each}
  </div>
</fieldset>
