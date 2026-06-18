<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import UserFallbackSelection from './UserFallbackSelection.svelte'
import UserResolutionPanel from './UserResolutionPanel.svelte'
import UserValidationProgress from './UserValidationProgress.svelte'
import UserValidationResults from './UserValidationResults.svelte'

type Props = {
  importCtx: ImportCtx
}

let { importCtx }: Props = $props()

const userValidation = $derived(importCtx.getUserValidation())
</script>

{#if userValidation.isValidating}
  <UserValidationProgress
    progress={userValidation.progress}
    total={userValidation.total}
  />
{/if}

{#if userValidation.showUserSelection}
  <UserFallbackSelection {importCtx} />
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
