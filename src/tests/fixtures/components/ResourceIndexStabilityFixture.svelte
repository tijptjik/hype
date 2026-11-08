<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import TooltipProvider from '#lib/bits/core/tooltip/TooltipProvider.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import ResourceSection from '#lib/bits/patterns/resourcePanel/components/ResourceSection.svelte'
import ResourceRow from '#lib/bits/patterns/resource/rows/ResourceRow/ResourceRow.svelte'
// TYPES
import type { ResourcePanelSection } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'

setResponsiveCtx()
let revision = $state(0)
let navigations = $state(0)
let active = $state(true)
const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="290"><rect width="360" height="290" fill="#4ba7b8"/></svg>',
  )
const fallbacks = $derived.by(() => {
  revision
  return [placeholder]
})
const section = $derived<ResourcePanelSection>({
  id: 'organisation',
  title: 'Organizations',
  search: '',
  rows: [],
  loading: false,
  error: false,
  viewKey: 'organisations',
  defaultOpen: true,
  isIndexActive: active,
  onNavigate: () => {
    navigations++
    active = true
    revision++
  },
  onSearch: () => {},
  onReset: () => {},
  onNext: () => {},
  onRetry: () => {},
  onVisible: () => {},
})
</script>

<TooltipProvider />
<div
  class="bits-theme bg-canvas text-foreground grid min-h-screen grid-cols-[240px_minmax(0,1fr)]"
>
  <aside class="bg-panel flex flex-col"><ResourceSection {section} admin /></aside>
  <main class="space-y-4 p-4">
    <div class="w-[360px] max-w-full" data-testid="organisation-card">
      <IndexCard
        title="Mission for Migrant Workers"
        description="No Description"
        imageSrc="https://card-assets.test/missing.png"
        imageFallbackSrcs={fallbacks}
        imageAlt="Organization logo"
        imageLayout="cover"
      />
    </div>
    <div data-testid="organisation-row">
      <ResourceRow
        index={0}
        title="Hong Kong Ghost Signs"
        description="Row image fallback"
        imageAlt="Hong Kong Ghost Signs logo"
        imageSrc="https://row-assets.test/missing.png"
        imageFallbackSrcs={fallbacks}
      />
    </div>
    <button type="button" onclick={() => revision++}>
      Rebuild identical card model
    </button>
    <button type="button" onclick={() => (active = false)}>Leave index</button>
    <output aria-label="Navigation count">{navigations}</output>
    <button type="button" data-tooltip="Repeated label">
      <span>Repeated label</span>
    </button>
    <span data-tooltip="Repeated wrapper"
      ><span>Repeated wrapper</span
      ><span aria-hidden="true"> • Repeated wrapper</span></span
    >
    <button type="button" title="Native duplicate">Native duplicate</button>
    <span
      class="block w-20 overflow-hidden whitespace-nowrap"
      data-tooltip="A long label that is genuinely clipped"
      >A long label that is genuinely clipped</span
    >
    <button
      type="button"
      aria-label="Information"
      data-tooltip="Additional explanation"
    >
      <svg width="20" height="20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="currentColor" />
      </svg>
    </button>
    <SimpleTooltip
      triggerProps={{ role: 'button', 'aria-label': 'Repeated rich label' }}
    >
      {#snippet trigger()}
        <span>Repeated rich label</span>
      {/snippet}
      Repeated rich label
    </SimpleTooltip>
    <SimpleTooltip triggerProps={{ role: 'button', 'aria-label': 'Useful help' }}>
      {#snippet trigger()}
        <span>Useful help</span>
      {/snippet}
      This explanation adds context.
    </SimpleTooltip>
  </main>
</div>
