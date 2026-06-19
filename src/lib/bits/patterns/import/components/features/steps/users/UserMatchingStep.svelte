<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ImportAnalysisStatus from '../../../shared/ImportAnalysisStatus.svelte'
import UserFallbackSelection from './UserFallbackSelection.svelte'
import UserResolutionPanel from './UserResolutionPanel.svelte'
import UserValidationResults from './UserValidationResults.svelte'

type Props = {
  importCtx: ImportCtx
}

let { importCtx }: Props = $props()

const userValidation = $derived(importCtx.getUserValidation())
</script>

{#if userValidation.isValidating}
  <ImportAnalysisStatus label={m.feature_import__users_analysing()} />
{/if}

{#if userValidation.showUserSelection}
  <div class="flex h-full min-h-80 items-center">
    <UserFallbackSelection {importCtx} />
  </div>
{/if}

{#if userValidation.results.length > 0 && !userValidation.showUserSelection}
  <div class="space-y-4 pt-4">
    <h4 class="font-medium">{m.feature_import__users_validation_results_title()}</h4>

    {#if userValidation.showUserResolution}
      <UserResolutionPanel {importCtx} />
    {:else}
      <UserValidationResults results={userValidation.results} />
    {/if}
  </div>
{/if}
