<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
import Search from 'virtual:icons/lucide/search'
import Users from 'virtual:icons/lucide/users'
import Grid from 'virtual:icons/lucide/grid-2x2'
import Layers from 'virtual:icons/lucide/layers'
// COMPONENTS
import VirtualResourceList from '$lib/bits/custom/resources/VirtualResourceList.svelte'
import ResourceRow from './ResourceRow.svelte'
// TYPES
import type { ResourceSectionProps } from './resourcePanelPrimitives.types'
let { section, narrow = false, admin = false }: ResourceSectionProps = $props()
let open = $state(untrack(() => section.defaultOpen))
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
  class="flex min-h-0 flex-col border-b border-border bg-panel {open ? 'flex-1' : 'shrink-0'}"
  aria-label={section.title}
>
  <div class="flex h-14 shrink-0 items-center gap-2 px-3">
    <button
      type="button"
      class="rounded-lg p-1 text-muted-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
      aria-label={`${open ? 'Collapse' : 'Expand'} ${section.title}`}
      aria-expanded={open}
      aria-controls={id}
      onclick={() => open = !open}
    >
      {#if open}
        <ChevronDown class="size-4" />
      {:else}
        <ChevronRight class="size-4" />
      {/if}
    </button>
    {#if !narrow}
      <button
        type="button"
        class="flex-1 text-left text-xs font-semibold uppercase tracking-[0.14em]"
        onclick={() => {
          if (section.onNavigate) {
            section.onNavigate()
          } else {
            open = !open
          }
        }}
      >
        {section.title}
      </button>
    {/if}
    <span class={color}
      >{#if section.id === 'organisation'}
        <Users class="size-5" />
      {:else if section.id === 'project'}
        <Grid class="size-5" />
      {:else}
        <Layers class="size-5" />
      {/if}</span
    >
  </div>
  <div {id} class="flex min-h-0 flex-col {open ? 'flex-1' : ''}">
    {#if open && !narrow}
      <label
        class="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-muted-foreground focus-within:border-focus"
      >
        <Search class="size-4" aria-hidden="true" />
        <input
          class="h-10 min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none"
          type="search"
          aria-label={`Search ${section.title}`}
          placeholder={`Search ${section.title.toLowerCase()}`}
          value={section.search}
          oninput={event => section.onSearch(event.currentTarget.value)}
          onkeydown={event => { if (event.key === 'Escape') { event.stopPropagation(); section.search ? section.onSearch('') : section.onReset() } }}
        >
      </label>
    {/if}
    {#if open}
      <VirtualResourceList
        {items}
        loading={section.loading}
        error={section.error}
        onNearEnd={section.onNext}
        onRetry={section.onRetry}
        onVisibleItems={section.onVisible}
        viewKey={section.viewKey}
      >
        {#snippet item(row)}
          <ResourceRow {row} {tone} {narrow} />
        {/snippet}
      </VirtualResourceList>
    {:else if items.length}
      <div class="flex max-h-32 shrink-0 flex-wrap gap-2 overflow-y-auto px-4 pb-3">
        {#each items as row (row.id)}
          <button
            type="button"
            class="rounded-full border border-border px-3 py-1 text-xs {color}"
            title={row.toggleLabel}
            onclick={row.onToggle}
          >
            {row.name}
            ×
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>
