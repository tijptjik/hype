<script lang="ts">
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import ImportRow from '../../../shared/ImportRow.svelte'
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
import XCircle from 'virtual:icons/proicons/cancel-circle'
// TYPES
import type { LayerValidationResult } from '#lib/client/services/import/types.js'

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
            <Icon src={CheckCircle} class="text-success h-5 w-5" />
          {:else}
            <Icon src={XCircle} class="text-error h-5 w-5" />
          {/if}
          <div>
            <div class="font-medium">{result.value}</div>
            {#if result.error}
              <div class="text-error text-sm">{result.error}</div>
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
