<script
  lang="ts"
  generics="TItem extends import('../formParentSection.types').ParentSectionItemBase"
>
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
import { Card, Search, SectionHeader } from '$lib/bits/custom'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'

// PATTERNS
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'

// SERVICES
import { getImageSrc, getImageSrcOrHashicon } from '$lib/client/services/image'

// I18N
import { m } from '$lib/i18n'

// ICONS
import ReplaceIcon from 'virtual:icons/lucide/replace'
import XIcon from 'virtual:icons/lucide/x'

// TYPES
import type { FormParentResourceSectionProps } from './formParentResourceSection.types'

let {
  title,
  subtitle,
  issues = [],
  subHeader,
  parent,
  hiddenInputAttrs = null,
  isEditing = true,
  isSubmitting = false,
  isSubmitRequested = false,
  startInAddingMode = false,
  searchScopeKey = '',
  closeOnParentChange = false,
  onBeginReplaceParent,
  onCancelReplaceParent,
  onRemoveParent,
  onSearch,
  onReplaceParent,
  class: className = '',
}: FormParentResourceSectionProps<TItem> = $props()

let isAdding = $state(false)
let wasSubmitRequested = $state(false)
let hasAutoOpenedAdding = $state(false)
let searchResetKey = $state(0)
let isResultsVisible = $state(false)
let hasPendingRemoval = $state(false)
let shouldFocusSearchOnOpen = $state(false)
let previousParentId = $state('')

const showModeUi = $derived(isEditing && !isSubmitting)
const currentParentId = $derived(parent?.id ?? '')
const isSearchActive = $derived(
  showModeUi && (isAdding || currentParentId.length === 0),
)
const headerClass = $derived(
  [
    'bits-form__parent-resource-header',
    subHeader ? 'bits-form__parent-resource-header--custom-subheader' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

function toggleAdding(): void {
  if (hasPendingRemoval) {
    onCancelReplaceParent?.()
    hasPendingRemoval = false
    shouldFocusSearchOnOpen = false
    isAdding = false
    return
  }

  if (!currentParentId) {
    isAdding = false
    shouldFocusSearchOnOpen = false
    return
  }

  if (!isAdding) {
    onBeginReplaceParent?.()
    hasPendingRemoval = true
    shouldFocusSearchOnOpen = true
    isAdding = true
    return
  }

  isAdding = false
  shouldFocusSearchOnOpen = false
  searchResetKey += 1
}

function handleRemoveParent(): void {
  onRemoveParent?.()
  hasPendingRemoval = false
  shouldFocusSearchOnOpen = true
  isAdding = true
}

function handleReplaceParent(item: TItem): void {
  void onReplaceParent(item)
  hasPendingRemoval = false
  shouldFocusSearchOnOpen = false
  isAdding = false
}

function handleResultsVisibilityChange(nextValue: boolean): void {
  if (isResultsVisible === nextValue) return
  isResultsVisible = nextValue
}

$effect(() => {
  if (!isAdding) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (showModeUi) return
  isAdding = false
  hasPendingRemoval = false
  shouldFocusSearchOnOpen = false
})

$effect(() => {
  if (isSubmitRequested && !wasSubmitRequested) {
    isAdding = false
    hasPendingRemoval = false
    shouldFocusSearchOnOpen = false
  }
  wasSubmitRequested = isSubmitRequested
})

$effect(() => {
  if (!showModeUi) return
  if (!isSubmitRequested) return
  if (issues.length === 0) return
  isAdding = true
})

$effect(() => {
  if (hasAutoOpenedAdding) return
  if (!startInAddingMode) return
  if (!showModeUi) return
  if (currentParentId.length > 0) return
  isAdding = true
  hasAutoOpenedAdding = true
})

$effect(() => {
  if (!isSearchActive) {
    shouldFocusSearchOnOpen = false
  }
})

$effect(() => {
  if (!closeOnParentChange) return

  const nextParentId = currentParentId
  if (
    hasPendingRemoval &&
    nextParentId.length > 0 &&
    nextParentId !== previousParentId
  ) {
    hasPendingRemoval = false
    shouldFocusSearchOnOpen = false
    isAdding = false
  }
  previousParentId = nextParentId
})

$effect(() => {
  if (hasPendingRemoval) return
  if (currentParentId.length === 0) return
  isAdding = false
})
</script>

<section
  class={`bits-form__section bits-form__parent-resource ${isSearchActive ? 'bits-form__parent-resource--search-open' : ''} ${className}`}
>
  {#if subHeader}
    <div class={headerClass}>
      {@render subHeader({
        title,
        subtitle,
        issues,
        isEditing,
        isSearchActive,
        isSubmitting,
        isResultsVisible,
        onToggleAdding: toggleAdding,
      })}
    </div>
  {:else}
    <SectionHeader {title} description={subtitle} class={headerClass}>
      {#snippet center()}
        <SectionHeaderPrimitive.Issues {issues} />
      {/snippet}
      {#snippet right()}
        {#if isEditing}
          <div
            class="bits-form__parent-resource-header-actions flex flex-row items-center justify-end gap-0"
          >
            <Button
              text={isSearchActive ? m.cancel() : m.replace()}
              style="ghost"
              color="light"
              size="sm"
              iconComponent={isSearchActive ? XIcon : ReplaceIcon}
              onClick={toggleAdding}
              disabled={isSubmitting || (isSearchActive && !isResultsVisible)}
              class="bits-form__parent-resource-replace-btn whitespace-nowrap h-10"
            />
          </div>
        {/if}
      {/snippet}
    </SectionHeader>
  {/if}

  {#if isSearchActive}
    {#key searchResetKey}
      <div class="bits-form__parent-resource-search">
        <Search
          placeholder={m.forms__search_placeholder()}
          focusOnMount={shouldFocusSearchOnOpen}
          mountTransitionDuration={showModeUi ? 80 : 0}
          prefetchOnMount={true}
          prefetchKey={searchScopeKey}
          onInput={onSearch as any}
          onResultsVisibilityChange={handleResultsVisibilityChange}
          excludeIds={currentParentId ? [currentParentId] : []}
          getItemId={(item: TItem) => item.id}
          onSelect={handleReplaceParent as any}
          resultMap={{
            image: (item: TItem) =>
              getImageSrc(item.image, {
                transformation: 'c_fill,h_96,w_96',
              }),
            title: (item: TItem) => item.i18n?.en?.name || item.code,
            descriminator: (item: TItem) => item.code ?? null,
          }}
        />
      </div>
    {/key}
  {/if}

  <div class="bits-form__parent-resource-list">
    <ResourceCard.Root class={!parent ? 'bits-form__parent-resource-item--empty' : ''}>
      <ResourceCard.Media
        size="xl"
        image={parent
          ? getImageSrcOrHashicon(parent.image, parent.id, {
              transformation: 'c_fill,h_256,w_256',
              hashiconSize: 256,
            })
          : null}
        alt={parent?.i18n?.en?.name || parent?.code || `No ${title}`}
      />
      <ResourceCard.Body
        code={parent?.code}
        name={parent?.i18n?.en?.name || parent?.code || `No ${title}`}
      />
      {#if hasPendingRemoval && parent}
        <Card.Actions padding="sm" class="bits-form__parent-resource-card-actions">
          <Button
            text={m.filters__clear()}
            style="ghost"
            color="light"
            size="md"
            modifier="circle"
            iconComponent={XIcon}
            onClick={handleRemoveParent}
            disabled={isSubmitting}
            class="bits-form__parent-resource-card-remove-btn"
          />
        </Card.Actions>
      {/if}
    </ResourceCard.Root>
  </div>

  {#if hiddenInputAttrs}
    <div class="hidden" aria-hidden="true"><input {...hiddenInputAttrs}></div>
  {/if}
</section>
