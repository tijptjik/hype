<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import ImportRow from '../../../shared/ImportRow.svelte'
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
import XCircle from 'virtual:icons/proicons/cancel-circle'
// TYPES
import type { UserValidationResult } from '#lib/client/services/import/types.js'

type Props = {
  results: UserValidationResult[]
}

let { results }: Props = $props()
</script>

<div class="pt space-y-2">
  {#each results as result}
    <ImportRow contentClass="p-3">
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
          {result.isValid
            ? m.feature_import__users_valid()
            : m.feature_import__users_invalid()}
        </div>
      </div>
    </ImportRow>
  {/each}
</div>
