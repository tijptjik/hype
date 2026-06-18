<script lang="ts">
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportRow from '../ImportRow.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import XCircle from 'virtual:icons/lucide/circle-x'
// TYPES
import type { LayerValidationResult } from '$lib/client/services/import/types'

type Props = {
  results: LayerValidationResult[]
}

let { results }: Props = $props()
</script>

<div class="space-y-2">
  {#each results as result}
    <ImportRow contentClass="p-4 px-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          {#if result.isValid}
            <Icon src={CheckCircle} class="h-5 w-5 text-success" />
          {:else}
            <Icon src={XCircle} class="h-5 w-5 text-error" />
          {/if}
          <div>
            <div class="font-medium">{result.value}</div>
            {#if result.error}
              <div class="text-sm text-error">{result.error}</div>
            {/if}
          </div>
        </div>
        <div class={`badge ${result.isValid ? 'badge-success' : 'badge-error'}`}>
          {result.isValid ? 'Valid' : 'Invalid'}
        </div>
      </div>
    </ImportRow>
  {/each}
</div>
