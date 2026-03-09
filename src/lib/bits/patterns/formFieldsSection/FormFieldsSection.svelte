<script lang="ts">
import * as FormFieldsSectionPrimitive from './components'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
import type { FormFieldsSectionProps } from './formFieldsSection.types'

let {
  items,
  title,
  description,
  issues = [],
  actions,
  issueItemIds,
  isEditing = true,
  canEdit = isEditing,
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

let isCollapsedAll = $state(false)
let collapseAllVersion = $state(0)
let layoutFlipLocked = $state(false)
let introItemId = $state<string | null>(null)
let isIntroActive = $state(false)
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
  return () => {
    if (flipResumeTimer) clearTimeout(flipResumeTimer)
  }
})
</script>

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
    {/snippet}
  </SectionHeader>

  <FormFieldsSectionPrimitive.Wrapper
    {items}
    {issueItemIds}
    {isEditing}
    {canEdit}
    collapsedAll={isCollapsedAll}
    {collapseAllVersion}
    {flipDisabled}
    {introItemId}
    onIntroEnd={handleIntroEnd}
    {onCardCollapseToggle}
    {isItemVisible}
    {card}
    {onAdd}
  />
</section>
