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
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportRow from '../ImportRow.svelte'
import UserSearchBox from './UserSearchBox.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
// TYPES
import type { UserValidationResult } from '$lib/client/services/import/types'

type Props = {
  importCtx: ImportCtx
}

let { importCtx }: Props = $props()

const userValidation = $derived(importCtx.getUserValidation())

async function handleSearchInput(value: string): Promise<void> {
  await updateUserSearchResults(importCtx, value)
}

function handleUserSelect(user: UserValidationResult): void {
  selectFallbackUser(importCtx, user)
}
</script>

<div class="space-y-4">
  <ImportRow class="border-warning bg-warning/10" contentClass="p-4">
    <h4 class="font-medium text-warning">
      {m.feature_import__users_no_column_title()}
    </h4>
    <p class="text-sm text-base-content/70">
      {m.feature_import__users_no_column_description()}
    </p>
  </ImportRow>

  {#if userValidation.fallbackUserId}
    <ImportRow class="border-success bg-success/10" contentClass="p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Icon src={CheckCircle} class="h-5 w-5 text-success" />
          <div>
            <div class="font-medium">{m.feature_import__users_selected_title()}</div>
            <div class="text-sm text-base-content/70">
              {m.feature_import__users_selected_id({
                id: userValidation.fallbackUserId,
              })}
            </div>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onclick={() => clearFallbackUser(importCtx)}
        >
          {m.feature_import__users_change_user()}
        </button>
      </div>
    </ImportRow>
  {:else}
    <UserSearchBox
      id="feature-import-user-search"
      value={importCtx.getUserSearchQuery()}
      results={importCtx.getUserSearchResults()}
      label={m.feature_import__users_search_label()}
      ariaLabel={m.feature_import__users_search_label()}
      placeholder={m.feature_import__users_search_placeholder()}
      onInput={handleSearchInput}
      onSelect={handleUserSelect}
    />
  {/if}
</div>
