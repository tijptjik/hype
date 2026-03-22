<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
import { cx } from '$lib/bits/utils'
import * as ResourceControlBarPrimitive from '$lib/bits/patterns/resource/resourceControlBar/components'
import { ResourceSortControl } from '$lib/bits/patterns/resource/resourceSortControl'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import {
  getFeatureTaskLabel,
  getFilterRenderItems,
  getFilterSectionCount,
  getResourceLocaleToggleItems,
} from '$lib/client/services/filters'
// ICONS
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import FunnelIcon from 'virtual:icons/lucide/funnel'
// TYPES
import type {
  NavigableResource,
  ResourceControlBarConfig,
  ResourceSortConfig,
} from '$lib/types'

let {
  resource,
  count = 0,
  filters,
  sortables,
}: {
  resource: NavigableResource
  count?: number
  filters: ResourceControlBarConfig
  sortables?: ResourceSortConfig
} = $props()

const adminCtx = getAdminCtx()

// ---
/********************
 *  1. LOCAL STATE
 ************/
// +++ Local State

let activeSection = $state<string | null>(null)
let filterCarouselIndex = $state(0)

const FILTER_CAROUSEL_VISIBLE_COUNT = 6

const FILTER_SECTION_BUTTON_CLASSES = cx(
  'relative h-10 min-w-0 rounded-md px-2.5 text-sm text-base-content/70',
  'transition-colors duration-300',
  'data-[has-indicator=true]:after:absolute',
  'data-[has-indicator=true]:after:right-0',
  'data-[has-indicator=true]:after:top-0',
  'data-[has-indicator=true]:after:h-2.5',
  'data-[has-indicator=true]:after:w-2.5',
  'data-[has-indicator=true]:after:rounded-full',
  'data-[has-indicator=true]:after:bg-accent',
  `data-[has-indicator=true]:after:content-['']`,
  'data-[has-indicator=true]:after:shadow-[0_0_0_2px_var(--color-base-200)]',
)

let isControlBarVisible = $derived(
  adminCtx.appCtx.state.ui.isControlBarVisible[resource],
)
let isSuperAdmin = $derived(
  Boolean(
    adminCtx.appCtx.user &&
      'superAdmin' in adminCtx.appCtx.user &&
      adminCtx.appCtx.user.superAdmin,
  ),
)
let activeSectionConfig = $derived(
  filters.sections.find(section => section.key === activeSection) ?? null,
)
let isPropertySection = $derived(
  Boolean(activeSectionConfig && 'type' in activeSectionConfig),
)
let totalFilterCount = $derived(
  filters.sections.reduce(
    (total, section) =>
      total + getFilterSectionCount(adminCtx, filters, section, isSuperAdmin),
    0,
  ),
)

// ---

// ---
/********************
 *  2. LOCAL HANDLERS
 ************/
// +++ Local Handlers

function selectSection(sectionKey: string): void {
  activeSection = activeSection === sectionKey ? null : sectionKey
}

function resetFilters(): void {
  adminCtx.resetViewFilters()
}

function pageFilterCarousel(direction: 'prev' | 'next', totalItems: number): void {
  const maxIndex = Math.max(0, totalItems - FILTER_CAROUSEL_VISIBLE_COUNT)
  if (direction === 'prev') {
    filterCarouselIndex = Math.max(
      0,
      filterCarouselIndex - FILTER_CAROUSEL_VISIBLE_COUNT,
    )
    return
  }

  filterCarouselIndex = Math.min(
    maxIndex,
    filterCarouselIndex + FILTER_CAROUSEL_VISIBLE_COUNT,
  )
}

// ---

// ---
/********************
 *  3. EFFECTS
 ************/
// +++ Effects

$effect(() => {
  activeSection
  filterCarouselIndex = 0
})

// ---
</script>

{#if isControlBarVisible}
  <ResourceControlBarPrimitive.Root
    filterLabel={activeSectionConfig ? activeSectionConfig.title : m.filters__filter_by()}
    filterIcon={activeSectionConfig ? activeSectionConfig.icon : FunnelIcon}
    hasActiveSection={Boolean(activeSectionConfig)}
    showSort={Boolean(sortables)}
    {count}
    resetDisabled={totalFilterCount === 0}
    onReset={resetFilters}
  >
    {#snippet sortContent(args: {
      isSortOpen: boolean
      handleSortOpenChange: (isOpen: boolean) => Promise<void>
    })}
      {#if sortables}
        <ResourceSortControl
          resource={filters.resource as NavigableResource}
          {sortables}
          isOpen={args.isSortOpen}
          onOpenChange={args.handleSortOpenChange}
        />
      {/if}
    {/snippet}

    {#snippet filterMenuContent({ notifyLayoutChange, closeMenu })}
      {#each filters.sections as section, idx (section.key)}
        {#if activeSection !== section.key}
          {@const SectionIcon = section.icon}
          {@const sectionCount = getFilterSectionCount(
            adminCtx,
            filters,
            section,
            isSuperAdmin,
          )}
          <Button
            text={section.title}
            iconComponent={SectionIcon}
            style="transparent"
            size="sm"
            transition={fade}
            transitionOpts={{ duration: 220, delay: 50 * idx }}
            iconClasses="h-5 w-5"
            class={FILTER_SECTION_BUTTON_CLASSES}
            attrs={{
              'data-has-indicator': sectionCount > 0 ? 'true' : 'false',
            }}
            onClick={() => {
              selectSection(section.key)
              closeMenu()
              notifyLayoutChange()
            }}
          />
        {/if}
      {/each}
    {/snippet}

    {#snippet filterActiveContent()}
      {#if activeSectionConfig}
        {#key activeSectionConfig.key}
          {@const activeItems = getFilterRenderItems(
            adminCtx,
            filters,
            activeSectionConfig,
            isSuperAdmin,
          )}
          {@const isCarouselActive =
            activeItems.length > FILTER_CAROUSEL_VISIBLE_COUNT}
          {@const visibleItems = isCarouselActive
            ? activeItems.slice(
                filterCarouselIndex,
                filterCarouselIndex + FILTER_CAROUSEL_VISIBLE_COUNT,
              )
            : activeItems}
          {@const activeSectionHasTranslations =
            !('type' in activeSectionConfig) &&
            activeSectionConfig.filters.some(filter => filter.type === 'translation')}

          <div class="bits-resource-filter-bar__active-strip">
            {#if activeSectionHasTranslations}
              <ResourceControlBarPrimitive.LocaleToggleGroup
                items={getResourceLocaleToggleItems(adminCtx, filters.resource)}
              />
            {/if}

            {#if isCarouselActive}
              <Button
                iconComponent={ChevronLeftIcon}
                hideLabel={true}
                text="Previous"
                size="sm"
                style="ghost"
                color="light"
                class="bits-resource-filter-bar__carousel-nav"
                disabled={filterCarouselIndex === 0}
                onClick={() => pageFilterCarousel('prev', activeItems.length)}
              />
            {/if}

            <div class="bits-resource-filter-bar__carousel-track">
              {#each visibleItems as item, idx (item.id)}
                <ResourceControlBarPrimitive.FilterToggle
                  label={item.label}
                  tooltip={item.tooltip}
                  currentValue={item.currentValue}
                  idx={filterCarouselIndex + idx}
                  transformOffset={item.transformOffset ?? 12}
                  falseLabel={item.falseLabel ??
                    getFeatureTaskLabel(
                      item,
                      false,
                      !isPropertySection && item.type === 'translation',
                    )}
                  trueLabel={item.trueLabel ??
                    getFeatureTaskLabel(
                      item,
                      true,
                      !isPropertySection && item.type === 'translation',
                    )}
                  onToggleFalse={item.onToggleFalse}
                  onToggleTrue={item.onToggleTrue}
                  onToggleChange={item.onToggleChange}
                />
              {/each}
            </div>

            {#if isCarouselActive}
              <Button
                iconComponent={ChevronRightIcon}
                hideLabel={true}
                text="Next"
                size="sm"
                style="ghost"
                color="light"
                class="bits-resource-filter-bar__carousel-nav"
                disabled={filterCarouselIndex + FILTER_CAROUSEL_VISIBLE_COUNT >= activeItems.length}
                onClick={() => pageFilterCarousel('next', activeItems.length)}
              />
            {/if}
          </div>
        {/key}
      {/if}
    {/snippet}
  </ResourceControlBarPrimitive.Root>
{/if}
