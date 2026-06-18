<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// COMPONENTS
import UserResolutionRow from './UserResolutionRow.svelte'

type Props = {
  importCtx: ImportCtx
}

let { importCtx }: Props = $props()

const userResolution = $derived(importCtx.getUserResolution())
</script>

<div class="space-y-4">
  {#each userResolution.invalidValues as invalidValue}
    <UserResolutionRow {importCtx} {invalidValue} />
  {/each}
</div>
