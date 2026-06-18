<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import {
  clearResolutionSearch,
  resetImportUserResolution,
  selectImportUserForResolution,
  updateResolutionUserSearchResults,
} from '$lib/client/services/import/users'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportMappingRow from '../ImportMappingRow.svelte'
import ResolvedTargetButton from './ResolvedTargetButton.svelte'
import UserIdentity from './UserIdentity.svelte'
import UserSearchBox from './UserSearchBox.svelte'
import XCircle from 'virtual:icons/lucide/circle-x'
// TYPES
import type { UserValidationResult } from '$lib/client/services/import/types'

type Props = {
  importCtx: ImportCtx
  invalidValue: string
}

let { importCtx, invalidValue }: Props = $props()

const resolution = $derived(importCtx.getUserResolution().resolutions.get(invalidValue))
const resolvedUser = $derived(resolution?.userData as UserValidationResult | undefined)
const searchResults = $derived(
  importCtx.getResolutionSearchResults().get(invalidValue) || [],
)
const searchValue = $derived(
  importCtx.getResolutionSearchQueries().get(invalidValue) || '',
)

async function handleSearchInput(value: string): Promise<void> {
  await updateResolutionUserSearchResults(importCtx, invalidValue, value)
}

function handleUserSelect(user: UserValidationResult): void {
  selectImportUserForResolution(importCtx, invalidValue, user)
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if ((event.key === 'ArrowDown' || event.key === 'Tab') && searchResults.length > 0) {
    event.preventDefault()
    const firstResult = document.querySelector(
      `[data-invalid-value="${invalidValue}"][data-result-index="0"]`,
    ) as HTMLElement
    firstResult?.focus()
    return
  }

  if (event.key === 'Escape') {
    clearResolutionSearch(importCtx, invalidValue)
  }
}

function handleResultKeydown(event: KeyboardEvent, user: UserValidationResult): void {
  const target = event.target as HTMLElement
  const currentIndex = Number.parseInt(
    target.getAttribute('data-result-index') || '0',
    10,
  )

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleUserSelect(user)
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'Tab') {
    event.preventDefault()
    const nextIndex = Math.min(currentIndex + 1, searchResults.length - 1)
    const nextResult = document.querySelector(
      `[data-invalid-value="${invalidValue}"][data-result-index="${nextIndex}"]`,
    ) as HTMLElement
    nextResult?.focus()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (currentIndex === 0) {
      const searchInput = target
        .closest('.relative')
        ?.querySelector('input') as HTMLElement
      searchInput?.focus()
      return
    }

    const prevIndex = currentIndex - 1
    const prevResult = document.querySelector(
      `[data-invalid-value="${invalidValue}"][data-result-index="${prevIndex}"]`,
    ) as HTMLElement
    prevResult?.focus()
    return
  }

  if (event.key === 'Escape') {
    const searchInput = target
      .closest('.relative')
      ?.querySelector('input') as HTMLElement
    searchInput?.focus()
    clearResolutionSearch(importCtx, invalidValue)
  }
}

function handleResolutionReset(): void {
  resetImportUserResolution(importCtx, invalidValue)

  setTimeout(() => {
    const searchInput = document.querySelector(
      `input[data-search-for="${invalidValue}"]`,
    ) as HTMLInputElement
    searchInput?.focus()
  }, 100)
}
</script>

<ImportMappingRow actionLabel={m.feature_import__users_assign_action()}>
  {#snippet source()}
    <div class="min-w-0 space-y-1.5">
      <h4 class="text-xs font-bold uppercase tracking-wide text-error">
        {m.feature_import__users_invalid_value_label()}
      </h4>
      <div class="flex items-center gap-2">
        <Icon src={XCircle} class="h-4 w-4 shrink-0 text-error" />
        <span class="truncate font-mono text-sm" title={invalidValue}>
          {invalidValue}
        </span>
      </div>
    </div>
  {/snippet}

  {#snippet target()}
    {#if resolution}
      <ResolvedTargetButton
        onReset={handleResolutionReset}
        title={m.feature_import__users_change_selection_title()}
        changeLabel={m.feature_import__users_click_to_change()}
      >
        <UserIdentity
          user={resolvedUser}
          size="sm"
          tone="success"
          emailClass="text-success/70"
        />
      </ResolvedTargetButton>
    {:else}
      <div class="w-full">
        <UserSearchBox
          id={`feature-import-user-resolution-${invalidValue}`}
          value={searchValue}
          results={searchResults}
          ariaLabel={m.feature_import__users_replacement_search_label()}
          placeholder={m.feature_import__users_replacement_search_placeholder()}
          size="sm"
          dropdown="floating"
          searchFor={invalidValue}
          onInput={handleSearchInput}
          onSelect={handleUserSelect}
          onInputKeydown={handleSearchKeydown}
          onResultKeydown={handleResultKeydown}
        />
      </div>
    {/if}
  {/snippet}
</ImportMappingRow>
