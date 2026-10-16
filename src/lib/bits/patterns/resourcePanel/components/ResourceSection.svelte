<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// SVELTE
import { untrack } from 'svelte'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronRight from 'virtual:icons/proicons/chevron-right'
import X from 'virtual:icons/proicons/cancel'
import Search from 'virtual:icons/proicons/search'
import Users from 'virtual:icons/proicons/person-multiple'
import Grid from 'virtual:icons/proicons/grid'
import Layers from 'virtual:icons/proicons/layers'
// COMPONENTS
import VirtualResourceList from '#lib/bits/custom/resources/VirtualResourceList.svelte'
import ResourceRow from './ResourceRow.svelte'
// TYPES
import type { ResourceSectionProps } from './resourcePanelPrimitives.types'
let { section, narrow = false, admin = false }: ResourceSectionProps = $props()
let open = $state(untrack(() => section.defaultOpen))
let touched = $state(false)
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
function toggleOpen(): void {
  touched = true
  open = !open
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
  class="flex min-h-0 min-w-0 flex-col bg-panel {open ? 'flex-1' : 'shrink-0'}"
  aria-label={section.title}
  style:max-height={maxHeight}
>
  <div
    class="relative flex h-14 min-w-0 shrink-0 items-center overflow-hidden"
    bind:clientHeight={headerHeight}
  >
    <button
      type="button"
      class="absolute right-6 rounded-lg p-1 text-muted-foreground transition-opacity duration-500 hover:bg-surface focus-override outline-none focus-visible:text-primary motion-reduce:transition-none"
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
      {#if open}
        <ChevronDown class="size-4" />
      {:else}
        <ChevronRight class="size-4" />
      {/if}
    </button>
    <button
      type="button"
      class="focus-override outline-none focus-visible:text-primary min-w-0 flex-1 truncate mx-16 text-left text-sm font-normal uppercase tracking-[0.1em] transition-opacity duration-500 motion-reduce:transition-none"
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
      aria-label={open
        ? m.panel__collapse({ name: section.title })
        : m.panel__expand({ name: section.title })}
      aria-expanded={open}
      aria-controls={id}
      title={section.title}
      onclick={toggleOpen}
    >
      {#if section.id === 'organisation'}
        <Users class="size-6" />
      {:else if section.id === 'project'}
        <Grid class="size-6" />
      {:else}
        <Layers class="size-6" />
      {/if}
    </button>
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
          <label
            class="mx-3 mb-2 flex shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface px-3 text-muted-foreground transition-opacity duration-500 focus-within:border-focus motion-reduce:transition-none"
            style:opacity={narrow ? 0 : 1}
            inert={narrow}
            aria-hidden={narrow}
          >
            <Search class="size-4" aria-hidden="true" />
            <input
              class="focus-override h-10 min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none"
              type="search"
              aria-label={m.panel__search({ name: section.title })}
              placeholder={m.panel__search({ name: section.title })}
              value={section.search}
              oninput={event => section.onSearch(event.currentTarget.value)}
              onkeydown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  section.search ? section.onSearch('') : section.onReset()
                }
              }}
            >
          </label>
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
        estimateSize={section.id === 'organisation' ? 40 : 56}
      >
        {#snippet item(
          row,
        )}
          <ResourceRow {row} {tone} {narrow} />
        {/snippet}
      </VirtualResourceList>
    {:else if items.length && narrow}
      <div class="max-h-32 shrink-0 overflow-y-auto">
        {#each items as row (row.id)}
          <ResourceRow {row} {tone} {narrow} />
        {/each}
      </div>
    {:else if items.length}
      <div class="flex max-h-32 shrink-0 flex-wrap gap-2 overflow-y-auto px-8 pb-3">
        {#each items as row (row.id)}
          <button
            type="button"
            class="focus-override outline-none focus-visible:text-primary focus-visible:border-primary inline-flex min-h-10 items-center gap-2 rounded-full border border-current/30 px-3 py-1 text-sm {color}"
            title={row.toggleLabel}
            onclick={row.onToggle}
          >
            {row.shortName || row.name}
            <X class="size-5" aria-hidden="true" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>
