<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import Plus from 'virtual:icons/proicons/add'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
// COMPONENTS
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
import { Button } from '#lib/bits/core/index.js'
import Header from '#lib/bits/custom/header/Header.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions'
import { fitSectionHeader } from '#lib/bits/custom/form/fitSectionHeader.js'
import { responsiveSectionHeaderClasses } from '#lib/bits/custom/form/responsiveSectionHeader.styles.js'
// STYLES
import {
  getHeaderActionClasses,
  HEADER_NEW_BUTTON_CLASSES,
  HEADER_BUTTON_LABEL_CLASSES,
} from '#lib/bits/patterns/layout/header/components/headerPrimitives.styles.js'
import * as FormFieldsSectionPrimitive from './components'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import type {
  FormFieldsSectionLoadingItem,
  FormFieldsSectionProps,
} from './formFieldsSection.types'
import type {
  LocaleChange,
  LocaleSelection,
} from '#lib/bits/custom/localeControls/localeControls.types.js'

let {
  items,
  icon,
  keepHeader = false,
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
  multilingual = $bindable(false),
  localeSelection = $bindable<LocaleSelection | null>(null),
  class: className = '',
}: FormFieldsSectionProps = $props()

const rootClass = $derived(
  ['w-full flex flex-col', className].filter(Boolean).join(' '),
)
const hasIssues = $derived(issues.length > 0)

let isCollapsedAll = $state(false)
// Language order and visibility are shared by the owning form without removing content.
let collapseAllVersion = $state(0)
let layoutFlipLocked = $state(false)
let introItemId = $state<string | null>(null)
let isIntroActive = $state(false)
let loadingItems = $state<FormFieldsSectionLoadingItem[]>([])
let flipResumeTimer: ReturnType<typeof setTimeout> | undefined
let lastLayoutMutationVersion = $state(0)
let previousItemIds: string[] = []

const hasItems = $derived(items.length > 0)
const hasOptimisticItems = $derived(hasItems || loadingItems.length > 0)
const showEmptyState = $derived(!hasOptimisticItems && !isLoading)
const showHeaderActions = $derived(hasOptimisticItems && !isLoading)
const flipDisabled = $derived(layoutFlipLocked || isIntroActive || forceFlipDisabled)
const availableLocales = $derived(
  normalizeContentLocales([
    ...(card?.locales ?? []),
    ...items.flatMap(property => [
      ...Object.keys(property.i18n ?? {}),
      ...(property.values ?? []).flatMap(value => Object.keys(value.i18n ?? {})),
    ]),
  ]),
)
const locales = $derived(
  normalizeContentLocales([
    ...(localeSelection?.selectedLocales ?? availableLocales),
    ...availableLocales,
  ]),
)
const visibleLocales = $derived(localeSelection?.visibleLocales ?? locales)
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const sectionCard = $derived(
  card ? { ...card, multilingual, locales, visibleLocales } : undefined,
)

/** Apply one language-selection intent to every field in this section.
 * @param change Ordered languages and their visible subset.
 * @returns Nothing; stored translations remain intact.
 */
function changeLocales(change: LocaleChange): void {
  triggerFlipLock()
  localeSelection = {
    selectedLocales: change.selectedLocales,
    visibleLocales: change.visibleLocales,
  }
}

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
  loadingItems = (
    loadingItems.length > 0
      ? loadingItems
      : items.map(item => ({
          id: item.id,
          presentation: card?.resolveCardPresentation?.(item) ?? 'full',
          isCollapsed: false,
        }))
  ).map(item => ({
    ...item,
    isCollapsed: nextCollapsed,
  }))
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
  if (items.length === 0) {
    if (!isLoading && loadingItems.length > 0) {
      loadingItems = []
    }
    return
  }
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

{#if showEmptyState && !keepHeader}
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
    card={sectionCard}
    {onAdd}
  />
{:else}
  <section class={`${rootClass} flex min-h-0 flex-1 flex-col`}>
    <!-- Keep section controls available within the owning facet scrollport. -->
    <div class={responsiveSectionHeaderClasses} use:fitSectionHeader>
      <SectionHeader
        {icon}
        {title}
        showControlLabels={true}
        description={description ?? ''}
        onCollapsableToggle={hasOptimisticItems ? onCollapsableToggle : undefined}
        isCollapsableCollapsed={isCollapsedAll}
        {onVisibilityToggle}
        {isVisibilityOn}
        {visibilityOnLabel}
        {visibilityOffLabel}
      >
        {#snippet left()}
          <div class="flex min-w-0 items-center gap-4">
            <Header
              text={title}
              {icon}
              description={description ?? ''}
              size="sm"
              class="bits-form__section-header-heading w-auto! min-w-0"
            />
            <EditModeReveal visible={isEditing && canEdit && !isLoading} reserveSpace>
              <Button
                text="New"
                iconComponent={Plus}
                color="neutral"
                style="ghost"
                labelClasses={`${HEADER_BUTTON_LABEL_CLASSES} [[data-fit]:not([data-fit="0"])_&]:hidden!`}
                class={getHeaderActionClasses(`${HEADER_NEW_BUTTON_CLASSES} shrink-0`)}
                disabled={removeMode || (disableEmptyAdd && !hasOptimisticItems)}
                onClick={onAdd}
              />
            </EditModeReveal>
          </div>
        {/snippet}
        {#if hasIssues}
          {#snippet center()}
            <SectionHeaderPrimitive.Issues {issues} />
          {/snippet}
        {/if}
        {#snippet right()}
          {#if showHeaderActions}
            {#if card}
              <LocaleToolbar
                horizontal
                options={localeOptions}
                allowAdd={isEditing && canEdit}
                selectedLocales={locales}
                {visibleLocales}
                expanded={multilingual}
                class="min-w-0 grow basis-1/2 sm:grow-0 sm:basis-auto"
                onExpandedChange={expanded => {
                  triggerFlipLock()
                  multilingual = expanded
                }}
                onChange={changeLocales}
              />
            {/if}
          {/if}
        {/snippet}
        {#snippet afterControls()}
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
    </div>

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
      card={sectionCard}
      {onAdd}
    />
  </section>
{/if}
