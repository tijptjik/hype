<script lang="ts">
import { untrack } from 'svelte'
import * as FormFieldsSectionPrimitive from './components'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
import type {
  FormFieldsSectionLoadingItem,
  FormFieldsSectionProps,
} from './formFieldsSection.types'

let {
  items,
  isLoading = false,
  loadingItems: providedLoadingItems = [],
  title,
  description,
  issues = [],
  actions,
  issueItemIds,
  isEditing = true,
  canEdit = isEditing,
  disableEmptyAdd = false,
  removeMode = false,
  onRemoveModeChange,
  layoutMutationVersion = 0,
  card,
  onVisibilityToggle,
  isVisibilityOn = true,
  visibilityOnLabel = 'Hide Unused',
  visibilityOffLabel = 'Show Unused',
  isItemVisible,
  forceFlipDisabled = false,
  class: className = '',
}: FormFieldsSectionProps = $props()

const rootClass = $derived(['bits-project-fields', className].filter(Boolean).join(' '))
const hasIssues = $derived(issues.length > 0)
const hasItems = $derived(items.length > 0)
const showEmptyState = $derived(!hasItems && !isLoading)
const showHeaderActions = $derived(hasItems && !isLoading)

let isCollapsedAll = $state(false)
let collapseAllVersion = $state(0)
let layoutFlipLocked = $state(false)
let introItemId = $state<string | null>(null)
let isIntroActive = $state(false)
let loadingItems = $state<FormFieldsSectionLoadingItem[]>(providedLoadingItems)
let flipResumeTimer: ReturnType<typeof setTimeout> | undefined
let lastLayoutMutationVersion = layoutMutationVersion
let previousItemIds: string[] = []
const flipDisabled = $derived(layoutFlipLocked || isIntroActive || forceFlipDisabled)

const triggerFlipLock = (): void => {
  layoutFlipLocked = true
  if (flipResumeTimer) clearTimeout(flipResumeTimer)
  flipResumeTimer = setTimeout(() => {
    layoutFlipLocked = false
  }, 260)
}

const onCollapsableToggle = (nextCollapsed: boolean): void => {
  triggerFlipLock()
  isCollapsedAll = nextCollapsed
  collapseAllVersion += 1
}

const onCardCollapseToggle = (): void => {
  triggerFlipLock()
}

const onCardCollapseChange = (
  propertyId: string,
  collapsed: boolean,
  presentation: 'full' | 'header',
): void => {
  const nextItems =
    loadingItems.length > 0
      ? [...loadingItems]
      : items.map(item => ({
          id: item.id,
          presentation: card?.resolveCardPresentation?.(item) ?? 'full',
          isCollapsed: false,
        }))
  const nextIndex = nextItems.findIndex(item => item.id === propertyId)
  if (nextIndex >= 0) {
    nextItems[nextIndex] = { id: propertyId, presentation, isCollapsed: collapsed }
    loadingItems = nextItems
  }
}

const onAdd = (event: Event): void => {
  triggerFlipLock()
  actions.add(event)
}

const handleIntroEnd = (propertyId: string): void => {
  if (propertyId !== introItemId) return
  introItemId = null
  isIntroActive = false
}

$effect(() => {
  if (layoutMutationVersion === lastLayoutMutationVersion) return
  lastLayoutMutationVersion = layoutMutationVersion
  triggerFlipLock()
})

$effect(() => {
  const currentItemIds = items.map(item => item.id)
  if (previousItemIds.length > 0 && currentItemIds.length > previousItemIds.length) {
    const previousSet = new Set(previousItemIds)
    const addedItemId = currentItemIds.find(id => !previousSet.has(id)) ?? null
    if (addedItemId) {
      introItemId = addedItemId
      isIntroActive = true
    }
  }
  previousItemIds = currentItemIds
})

$effect(() => {
  if (providedLoadingItems.length > 0) {
    loadingItems = providedLoadingItems
    return
  }
  if (items.length === 0) return
  const previousLoadingItems = untrack(() => loadingItems)
  const nextLoadingItems = items.map(item => {
    const existing = previousLoadingItems.find(
      loadingItem => loadingItem.id === item.id,
    )
    return {
      id: item.id,
      presentation: card?.resolveCardPresentation?.(item) ?? 'full',
      isCollapsed: existing?.isCollapsed ?? false,
    }
  })
  const didChange =
    nextLoadingItems.length !== previousLoadingItems.length ||
    nextLoadingItems.some((item, index) => {
      const previous = previousLoadingItems[index]
      return (
        previous?.id !== item.id ||
        previous?.presentation !== item.presentation ||
        previous?.isCollapsed !== item.isCollapsed
      )
    })
  if (!didChange) return
  loadingItems = nextLoadingItems
})

$effect(() => {
  return () => {
    if (flipResumeTimer) clearTimeout(flipResumeTimer)
  }
})
</script>

{#if showEmptyState}
  <FormFieldsSectionPrimitive.Wrapper
    {items}
    {isLoading}
    {loadingItems}
    {issueItemIds}
    {isEditing}
    {canEdit}
    {disableEmptyAdd}
    collapsedAll={isCollapsedAll}
    {collapseAllVersion}
    {flipDisabled}
    {introItemId}
    onIntroEnd={handleIntroEnd}
    {onCardCollapseToggle}
    onCollapseChange={onCardCollapseChange}
    {isItemVisible}
    {card}
    {onAdd}
  />
{:else}
  <section class={rootClass}>
    <SectionHeader
      {title}
      description={description ?? ''}
      onCollapsableToggle={hasItems ? onCollapsableToggle : undefined}
      isCollapsableCollapsed={isCollapsedAll}
      {onVisibilityToggle}
      {isVisibilityOn}
      {visibilityOnLabel}
      {visibilityOffLabel}
    >
      {#if hasIssues}
        {#snippet center()}
          <SectionHeaderPrimitive.Issues {issues} />
        {/snippet}
      {/if}
      {#snippet right()}
        {#if showHeaderActions}
          <div class="bits-form__section-header-actions">
            <FormFieldsSectionPrimitive.Actions
              actions={{
                ...actions,
                add: onAdd,
              }}
              {isEditing}
              {removeMode}
              {onRemoveModeChange}
              itemCount={items.length}
            />
          </div>
        {/if}
      {/snippet}
    </SectionHeader>

    <FormFieldsSectionPrimitive.Wrapper
      {items}
      {isLoading}
      {loadingItems}
      {issueItemIds}
      {isEditing}
      {canEdit}
      {disableEmptyAdd}
      collapsedAll={isCollapsedAll}
      {collapseAllVersion}
      {flipDisabled}
      {introItemId}
      onIntroEnd={handleIntroEnd}
      {onCardCollapseToggle}
      onCollapseChange={onCardCollapseChange}
      {isItemVisible}
      {card}
      {onAdd}
    />
  </section>
{/if}
