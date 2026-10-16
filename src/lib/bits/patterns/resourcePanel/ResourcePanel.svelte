<script lang="ts">
// SVELTE
import { onDestroy, tick } from 'svelte'
// PATTERN PRIMITIVES
import * as ResourcePanelPrimitive from './components'
// BITS
import { PanelRoot } from '#lib/bits/patterns/panels/index.js'
import Info from '#lib/bits/patterns/panels/components/info/Maps.svelte'
import X from 'virtual:icons/proicons/cancel-circle'
import ChevronLeft from 'virtual:icons/proicons/chevron-left'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { ResourcePanelProps } from './resourcePanel.types'
let isInfoOpen = $state(false)
let sidebarToggleButton = $state<HTMLButtonElement>()
let { model, footer }: ResourcePanelProps = $props()

let hoverLabel = $state<{ name: string; left: number; top: number } | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** Clears the short handoff delay when the pointer reaches another resource. */
function cancelLabelHide(): void {
  clearTimeout(hideTimer)
  hideTimer = undefined
}

/**
 * Positions the shared label at the hovered or keyboard-focused row.
 * @param name - Full resource name to reveal.
 * @param anchor - Primary row button in the collapsed rail.
 * @returns Nothing.
 */
function showLabel(name: string, anchor: HTMLElement): void {
  cancelLabelHide()
  if (!model.panel.isNarrow) return
  const rect = anchor.getBoundingClientRect()
  hoverLabel = { name, left: rect.right, top: rect.top + rect.height / 2 }
}

/** Keeps one label mounted while the pointer moves between adjacent dots. */
function hideLabel(): void {
  cancelLabelHide()
  hideTimer = setTimeout(() => {
    hoverLabel = null
  }, 40)
}

/** Clears a label whose anchor moved or is no longer in the collapsed rail. */
function clearLabel(): void {
  cancelLabelHide()
  hoverLabel = null
}

/** Toggles the sidebar and retains focus when its control moves between layouts. */
async function toggleSidebar(): Promise<void> {
  const restoreFocus = document.activeElement === sidebarToggleButton
  clearLabel()
  model.onClose()
  await tick()
  if (restoreFocus) sidebarToggleButton?.focus()
}

$effect(() => {
  if (!model.panel.isNarrow || !model.open) clearLabel()
})
onDestroy(cancelLabelHide)
</script>

<svelte:window onresize={clearLabel} onscroll={clearLabel} />

{#snippet sidebarToggle()}
  <button
    bind:this={sidebarToggleButton}
    type="button"
    data-sidebar-toggle
    class="flex size-8 items-center justify-center rounded-lg text-base-content/60 hover:bg-surface hover:text-base-content focus-override focus-visible:outline-2 focus-visible:outline-focus"
    aria-label={model.panel.isNarrow
      ? m.panel__expand({ name: model.title })
      : m.panel__collapse({ name: model.title })}
    aria-expanded={!model.panel.isNarrow}
    aria-controls="left-panel"
    onclick={toggleSidebar}
  >
    <ChevronLeft
      class="size-5 transition-transform duration-300 motion-reduce:transition-none {model
        .panel.isNarrow
        ? 'rotate-180'
        : ''}"
      aria-hidden="true"
    />
  </button>
{/snippet}

<PanelRoot {...model.panel} isOpen={model.open}>
  <div
    class="flex h-full min-h-0 flex-col bg-panel text-base-content"
    onscrollcapture={clearLabel}
  >
    {#if model.panel.isAdmin && model.panel.isNarrow}
      <div class="flex h-12 w-16 shrink-0 items-center justify-center">
        {@render sidebarToggle()}
      </div>
    {/if}
    {#if !model.panel.isAdmin}
      <header
        class="flex h-18 shrink-0 items-center gap-3 border-b border-border px-2 {model
          .panel.isNarrow
          ? 'justify-center'
          : 'justify-between px-4'}"
      >
        {#if !model.panel.isNarrow}
          <h2 class="text-lg font-medium uppercase tracking-widest text-primary">
            {model.title}
          </h2>
        {/if}
        {#if model.panel.panelType === 'prisms'}
          <button
            type="button"
            class="ml-auto rounded-full p-2 text-muted-foreground hover:bg-surface"
            aria-label={m.menu_about()}
            aria-expanded={isInfoOpen}
            onclick={() => (isInfoOpen = !isInfoOpen)}
          >
            <span class="text-2xl font-medium" aria-hidden="true">?</span>
          </button>
        {/if}
        <button
          type="button"
          class="rounded-full p-2 text-base-content hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={m.panel__close()}
          onclick={model.onClose}
        >
          <X class="size-8" />
        </button>
      </header>
    {/if}
    <div class="max-h-[45%] shrink-0 overflow-y-auto"><Info isOpen={isInfoOpen} /></div>
    <div class="flex min-h-0 flex-1 flex-col">
      {#each model.sections as section, index (section.id)}
        <ResourcePanelPrimitive.Section
          {section}
          narrow={model.panel.isNarrow}
          admin={model.panel.isAdmin}
          headerAction={model.panel.isAdmin && !model.panel.isNarrow && index === 0
            ? sidebarToggle
            : undefined}
          onLabelShow={showLabel}
          onLabelHide={hideLabel}
        />
      {/each}
    </div>
    {#if model.loadingMessage}
      <p role="status" class="px-4 py-3 text-xs text-muted-foreground">
        {model.loadingMessage}
      </p>
    {/if}
    {#if model.loadError}
      <button
        type="button"
        class="p-3 text-sm text-primary"
        onclick={model.onRetryFeatures}
      >
        {m.resource_retry()}
      </button>
    {/if}
    {#if footer}
      <footer class="shrink-0 border-t border-border">{@render footer()}</footer>
    {/if}
  </div>
</PanelRoot>

<ResourcePanelPrimitive.HoverLabel label={hoverLabel} />
