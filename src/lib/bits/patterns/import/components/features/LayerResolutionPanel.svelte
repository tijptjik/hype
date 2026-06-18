<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// COMPONENTS
import LayerResolutionRow from './LayerResolutionRow.svelte'

type Props = {
  importCtx: ImportCtx
  onCreateLayer: (invalidValue: string) => void
}

let { importCtx, onCreateLayer }: Props = $props()

const layerResolution = $derived(importCtx.getLayerResolution())
</script>

<div class="space-y-4">
  {#each layerResolution.invalidValues as invalidValue}
    <LayerResolutionRow {importCtx} {invalidValue} {onCreateLayer} />
  {/each}
</div>
