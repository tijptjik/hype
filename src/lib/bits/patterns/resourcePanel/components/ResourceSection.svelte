<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// SVELTE
import { onDestroy, tick, untrack } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import Users from 'virtual:icons/proicons/person-multiple'
import Grid from 'virtual:icons/proicons/grid'
import Layers from 'virtual:icons/proicons/layers'
// COMPONENTS
import SelectionChip from '#lib/bits/patterns/panels/components/common/SelectionChip.svelte'
import FilterBar from '#lib/bits/patterns/panels/components/common/FilterBar.svelte'
import VirtualResourceList from '#lib/bits/custom/resources/VirtualResourceList.svelte'
import ResourceRow from './ResourceRow.svelte'
// TYPES
import type { ResourceSectionProps } from './resourcePanelPrimitives.types'
let {
  section,
  narrow = false,
  admin = false,
  headerAction,
  onLabelShow,
  onLabelHide,
}: ResourceSectionProps = $props()
let open = $state(untrack(() => section.defaultOpen))
let touched = $state(false)
let element: HTMLElement | undefined = $state()
let animations: Animation[] = []
let headerHeight = $state(0)
let searchHeight = $state(0)
let contentHeight = $state(0)
const hasSearch = $derived(
  open && (section.rows.length >= 5 || Boolean(section.search)),
)
// Cap equal-share flex allocation at actual content height so other sections inherit spare room.
const maxHeight = $derived(
  open && contentHeight > 0
    ? `${headerHeight + (hasSearch ? searchHeight : 0) + contentHeight}px`
    : undefined,
)
$effect(() => {
  if (!touched) open = section.defaultOpen
})
/**
 * Animates the measured flex allocation of this group and its neighbours.
 * @returns Resolves after the new layout has been measured and animation started.
 * @remarks Explicit heights avoid scaling text and keep virtual lists constrained.
 */
async function toggleOpen(): Promise<void> {
  const siblings = Array.from(element?.parentElement?.children ?? []).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.hasAttribute('data-resource-section'),
  )
  const heights = siblings.map(node => node.getBoundingClientRect().height)
  // Reverse an interrupted transition from its current visible size.
  for (const node of siblings) {
    for (const animation of node.getAnimations?.() ?? []) {
      if (animation.id === 'resource-section-collapse') animation.cancel()
    }
  }
  touched = true
  open = !open
  await tick()
  if (prefersReducedMotion.current) return
  const targets = siblings.map(node => node.getBoundingClientRect().height)
  animations = siblings.flatMap((node, index) => {
    if (!node.animate || Math.abs(heights[index] - targets[index]) < 1) return []
    const frame = { flex: '0 0 auto', maxHeight: 'none', overflow: 'hidden' }
    return [
      node.animate(
        [
          { ...frame, height: `${heights[index]}px` },
          { ...frame, height: `${targets[index]}px` },
        ],
        {
          id: 'resource-section-collapse',
          duration: 240,
          easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
        },
      ),
    ]
  })
}
onDestroy(() => {
  for (const animation of animations) animation.cancel()
})
/**
 * Open the resource index before allowing its compact section to collapse.
 * @returns Resolves after navigation or the section toggle completes.
 */
async function handleNarrowClick(): Promise<void> {
  if (section.onNavigate && !section.isIndexActive) {
    await section.onNavigate()
    return
  }
  await toggleOpen()
}
const id = $props.id()
const tone = $derived(
  section.id === 'organisation'
    ? 'primary'
    : section.id === 'project'
      ? 'tertiary'
      : 'secondary',
)
const color = $derived(
  tone === 'primary'
    ? 'text-primary'
    : tone === 'secondary'
      ? 'text-secondary'
      : 'text-tertiary',
)
const items = $derived(
  open ? section.rows : section.rows.filter(row => row.selected || row.active),
)
</script>

<section
  bind:this={element}
  data-resource-section
  class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-panel {open
    ? 'flex-1'
    : 'shrink-0'}"
  aria-label={section.title}
  style:max-height={maxHeight}
>
  <div
    class="relative flex min-w-0 shrink-0 items-center overflow-hidden {narrow
      ? 'h-12'
      : 'h-14'}"
    bind:clientHeight={headerHeight}
  >
    <button
      type="button"
      class="absolute {headerAction
        ? 'right-14'
        : 'right-6'} rounded-lg p-1 text-muted-foreground transition-opacity duration-500 hover:bg-surface focus-override outline-none focus-visible:text-primary motion-reduce:transition-none"
      style:opacity={narrow ? 0 : 1}
      inert={narrow}
      aria-hidden={narrow}
      aria-label={open
        ? m.panel__collapse({ name: section.title })
        : m.panel__expand({ name: section.title })}
      aria-expanded={open}
      aria-controls={id}
      onclick={toggleOpen}
    >
      <ChevronDown
        class="size-4 transition-transform duration-250 motion-reduce:transition-none {open
          ? ''
          : '-rotate-90'}"
      />
    </button>
    <button
      type="button"
      class="focus-override outline-none focus-visible:text-primary min-w-0 flex-1 truncate ml-16 {headerAction
        ? 'mr-24'
        : 'mr-16'} text-left text-sm font-normal uppercase tracking-[0.1em] transition-opacity duration-500 motion-reduce:transition-none"
      style:opacity={narrow ? 0 : 1}
      inert={narrow}
      aria-hidden={narrow}
      onclick={() => {
        if (section.onNavigate) {
          section.onNavigate()
        } else {
          toggleOpen()
        }
      }}
    >
      {section.title}
    </button>
    <button
      type="button"
      class="absolute left-[32px] top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg focus-override outline-none focus-visible:ring-2 focus-visible:ring-focus {color}"
      inert={!narrow}
      aria-hidden={!narrow}
      aria-label={section.onNavigate && !section.isIndexActive
        ? section.title
        : open
          ? m.panel__collapse({ name: section.title })
          : m.panel__expand({ name: section.title })}
      aria-expanded={open}
      aria-controls={id}
      title={section.title}
      onclick={handleNarrowClick}
    >
      {#if section.id === 'organisation'}
        <Users class="size-6" />
      {:else if section.id === 'project'}
        <Grid class="size-6" />
      {:else}
        <Layers class="size-6" />
      {/if}
    </button>
    {#if headerAction}
      <div class="absolute right-3 top-1/2 -translate-y-1/2">
        {@render headerAction()}
      </div>
    {/if}
  </div>
  <div {id} class="flex min-h-0 flex-col {open ? 'flex-1' : ''}">
    {#if hasSearch}
      <!-- Collapse the search space along with the panel, without remounting the input. -->
      <div
        class="shrink-0 overflow-hidden transition-[height,opacity] duration-500 motion-reduce:transition-none"
        bind:clientHeight={searchHeight}
        style:height={narrow ? '0px' : '50px'}
        style:opacity={narrow ? 0 : 1}
        inert={narrow}
        aria-hidden={narrow}
      >
        <div class="min-h-0 overflow-hidden">
          <FilterBar
            bind:searchTerm={() => section.search, section.onSearch}
            label={m.panel__search({ name: section.title })}
            onReset={section.onReset}
          />
        </div>
      </div>
    {/if}
    {#if open}
      <VirtualResourceList
        {items}
        bind:contentHeight
        loading={section.loading}
        error={section.error}
        onNearEnd={section.onNext}
        onRetry={section.onRetry}
        onVisibleItems={section.onVisible}
        viewKey={section.viewKey}
        animateRows
        estimateSize={narrow ? 24 : section.id === 'organisation' ? 40 : 52}
      >
        {#snippet item(
          row,
        )}
          <ResourceRow {row} {tone} {narrow} {onLabelShow} {onLabelHide} />
        {/snippet}
      </VirtualResourceList>
    {:else if items.length && narrow}
      <div class="max-h-32 shrink-0 overflow-y-auto">
        {#each items as row (row.id)}
          <ResourceRow {row} {tone} {narrow} {onLabelShow} {onLabelHide} />
        {/each}
      </div>
    {:else if items.length}
      <div class="flex max-h-32 shrink-0 flex-wrap gap-2 overflow-y-auto px-6 py-4">
        {#each items as row (row.id)}
          <SelectionChip
            label={row.name}
            removeLabel={row.toggleLabel}
            onRemove={row.onToggle}
            {tone}
          />
        {/each}
      </div>
    {/if}
  </div>
</section>
