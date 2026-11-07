<script lang="ts">
// COMPONENTS
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
import VirtualResourceList from '#lib/bits/custom/resources/VirtualResourceList.svelte'
import ResourcePanel from '#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'
import DeferredPanel from '#lib/bits/patterns/panels/DeferredPanel.svelte'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'

let open = $state(false)
let position = $state<'left' | 'right'>('left')
let inline = $state(false)
let resources = $state(false)
let narrow = $state(false)
const scenario = new URLSearchParams(window.location.search)
const deferred = scenario.has('deferred')
let items = $state(
  Array.from({ length: 10 }, (_, index) => ({
    id: `row-${index}`,
    name: `Steady panel row ${index + 1}`,
    revision: 0,
  })),
)
const panel = $derived<PanelProps>({
  panelType: resources && inline ? Panel.admin : Panel.prisms,
  position,
  inline,
  scrollable: false,
  isAdmin: resources && inline,
  isNarrow: narrow,
})

/** Refreshes object identities while preserving keyed rows. @returns Nothing. */
function refreshRows(): void {
  items = items.map(item => ({ ...item, revision: item.revision + 1 }))
}

/** Reorders keys during the shell's entrance. @returns Nothing. */
function reorderRows(): void {
  items = [...items].reverse()
}

// Reproduce independent query updates while the ancestor is still moving.
$effect(() => {
  if (!open || scenario.has('steady')) return
  const timers = [16, 32, 48, 64, 80, 96, 112].map(delay =>
    setTimeout(refreshRows, delay),
  )
  timers.push(setTimeout(reorderRows, 45))
  return () => timers.forEach(clearTimeout)
})

const model: ResourcePanelModel = {
  get panel() {
    return panel
  },
  get open() {
    return open
  },
  title: 'Maps',
  get sections() {
    return [
      {
        id: 'layer' as const,
        title: 'Layers',
        search: '',
        defaultOpen: true,
        loading: false,
        error: false,
        viewKey: 'panel-motion',
        rows: items.map(item => ({
          ...item,
          breadcrumbs: ['Organisation', 'Project'],
          selected: false,
          active: false,
          enabled: false,
          primaryLabel: item.name,
          toggleLabel: `Pin ${item.name}`,
          onPrimary: () => {},
          onToggle: () => {},
        })),
        onSearch: () => {},
        onReset: () => {},
        onNext: () => {},
        onRetry: () => {},
        onVisible: () => {},
      },
    ]
  },
  onClose: () => {
    open = false
  },
}
</script>

<main class="bits-theme bg-surface text-base-content flex h-screen min-h-0 flex-col">
  <div class="flex shrink-0 flex-wrap gap-3 p-3">
    <button
      type="button"
      data-action="open"
      onclick={() => {
        open = true
      }}
    >
      Open
    </button>
    <button
      type="button"
      data-action="close"
      onclick={() => {
        open = false
      }}
    >
      Close
    </button>
    <button type="button" data-action="refresh" onclick={refreshRows}>
      Refresh rows
    </button>
    <button type="button" data-action="reorder" onclick={reorderRows}>
      Reorder rows
    </button>
    <label
      >Position
      <select data-position bind:value={position}>
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select></label
    >
    <label><input data-inline type="checkbox" bind:checked={inline}> Inline</label>
    <label><input data-resources type="checkbox" bind:checked={resources}> Maps</label>
    <label><input data-narrow type="checkbox" bind:checked={narrow}> Narrow</label>
  </div>
  <div class="relative flex min-h-0 flex-1 overflow-hidden" data-motion-stage>
    {#if resources}
      {#if deferred}
        <DeferredPanel
          active={open}
          load={() => import('#lib/bits/patterns/resourcePanel/ResourcePanel.svelte')}
        >
          {#snippet children(Content)}
            <Content {model} />
          {/snippet}
        </DeferredPanel>
      {:else}
        <ResourcePanel {model} />
      {/if}
    {:else}
      <PanelRoot {...panel} isOpen={open} preserveContentWidth={!narrow}>
        <div class="flex h-full min-h-0 flex-col" data-motion-body>
          <header
            class="border-border h-18 shrink-0 border-b px-4 py-5"
            data-motion-anchor
          >
            Panel motion
          </header>
          <VirtualResourceList {items} animateRows>
            {#snippet item(row)}
              <div class="h-12 px-4 py-3" data-motion-row={row.id}>{row.name}</div>
            {/snippet}
          </VirtualResourceList>
        </div>
      </PanelRoot>
    {/if}
    <div class="min-w-0 flex-1"></div>
  </div>
</main>
