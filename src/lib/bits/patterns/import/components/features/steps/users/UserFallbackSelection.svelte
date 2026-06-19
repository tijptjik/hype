<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import {
  clearFallbackUser,
  selectFallbackUser,
  updateUserSearchResults,
} from '$lib/client/services/import/users'
// COMPONENTS
import ImportMappingRow from '../../../shared/ImportMappingRow.svelte'
import ResolvedTargetButton from '../../../shared/ResolvedTargetButton.svelte'
import UserIdentity from './UserIdentity.svelte'
import UserSearchBox from './UserSearchBox.svelte'
// TYPES
import type { UserValidationResult } from '$lib/client/services/import/types'

type Props = {
  importCtx: ImportCtx
}

let { importCtx }: Props = $props()

const userValidation = $derived(importCtx.getUserValidation())
const fallbackUser = $derived(
  userValidation.fallbackUserData ??
    importCtx
      .getUserSearchResults()
      .find(user => user.id === userValidation.fallbackUserId),
)

async function handleSearchInput(value: string): Promise<void> {
  await updateUserSearchResults(importCtx, value)
}

function handleUserSelect(user: UserValidationResult): void {
  selectFallbackUser(importCtx, user)
}
</script>

<div class="mx-auto w-full max-w-5xl">
  <ImportMappingRow actionLabel={m.feature_import__users_assign_action()}>
    {#snippet source()}
      <div class="min-w-0 space-y-1.5">
        <h4 class="text-xs font-bold uppercase tracking-wide text-base-content/55">
          {m.feature_import__users_no_column_title()}
        </h4>
        <div class="truncate text-sm font-semibold text-base-content">
          {m.feature_import__users_all_features_label()}
        </div>
        <p class="text-xs leading-relaxed text-base-content/60">
          {m.feature_import__users_no_column_description()}
        </p>
      </div>
    {/snippet}

    {#snippet target()}
      {#if userValidation.fallbackUserId}
        <ResolvedTargetButton
          onReset={() => clearFallbackUser(importCtx)}
          title={m.feature_import__users_change_selection_title()}
          changeLabel={m.feature_import__users_click_to_change()}
        >
          {#if fallbackUser}
            <UserIdentity
              user={fallbackUser}
              size="sm"
              tone="success"
              emailClass="text-success/70"
            />
          {:else}
            <div class="min-w-0">
              <div class="text-sm font-semibold text-success">
                {m.feature_import__users_selected_title()}
              </div>
              <div class="truncate text-xs text-success/70">
                {m.feature_import__users_selected_id({
                  id: userValidation.fallbackUserId,
                })}
              </div>
            </div>
          {/if}
        </ResolvedTargetButton>
      {:else}
        <div class="w-full">
          <UserSearchBox
            id="feature-import-user-search"
            value={importCtx.getUserSearchQuery()}
            results={importCtx.getUserSearchResults()}
            ariaLabel={m.feature_import__users_search_label()}
            placeholder={m.feature_import__users_search_placeholder()}
            size="sm"
            dropdown="floating"
            searchFor={m.feature_import__users_all_features_label()}
            onInput={handleSearchInput}
            onSelect={handleUserSelect}
          />
        </div>
      {/if}
    {/snippet}
  </ImportMappingRow>
</div>
