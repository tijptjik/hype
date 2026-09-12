<script lang="ts">
// PATTERN PRIMITIVES
import * as ResourcePanelPrimitive from './components'
// BITS
import { PanelRoot } from '$lib/bits/patterns/panels'
import X from 'virtual:icons/lucide/x'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { ResourcePanelProps } from './resourcePanel.types'
let { model, footer }: ResourcePanelProps = $props()
</script>

<PanelRoot {...model.panel} isOpen={model.open}>
  <div class="flex h-full min-h-0 flex-col bg-panel text-base-content">
    <header
      class="flex h-18 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
    >
      {#if !model.panel.isNarrow}
        <h2 class="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          {model.title}
        </h2>
      {/if}
      <button
        type="button"
        class="rounded-full p-2 text-muted-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
        aria-label="Close panel"
        onclick={model.onClose}
      >
        <X class="size-5" />
      </button>
    </header>
    <div class="flex min-h-0 flex-1 flex-col">
      {#each model.sections as section (section.id)}
        <ResourcePanelPrimitive.Section
          {section}
          narrow={model.panel.isNarrow}
          admin={model.panel.isAdmin}
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
