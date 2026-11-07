<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
import SettingsIcon from 'virtual:icons/proicons/settings'
import FilterIcon from 'virtual:icons/proicons/filter'
// COMPONENTS
import EmbedMap from '#lib/bits/patterns/embed/EmbedMap.svelte'
import ResourcePanel from '#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'
import SettingsPanel from '#lib/bits/patterns/settingsPanel/SettingsPanel.svelte'
import FiltersPanel from '#lib/bits/patterns/filtersPanel/FiltersPanel.svelte'
import AppMenu from '#lib/bits/patterns/bars/appMenu/AppMenu.svelte'
// TYPES
import type { EmbedCamera } from '#lib/embed/config.js'
import type { AppMenuItem } from '#lib/bits/patterns/bars/appMenu/appMenu.types.js'
// LAYOUT
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { getMenuReservedHeight } from '#lib/bits/patterns/bars/appMenu/appMenu.layout.js'
// ADAPTERS
import { useEmbedModel } from '#lib/adapters/embed/useEmbedModel.svelte.js'
import { useEmbedPanels } from '#lib/adapters/embed/useEmbedPanels.svelte.js'
import { useEmbedFilters } from '#lib/adapters/embed/useEmbedFilters.svelte.js'
// PRESENTATION
import { embedCopy } from '#lib/embed/copy.js'
import { embedLabel } from '#lib/embed/presentation.js'
import { getURLfromImage } from '#lib/client/services/image.js'
const responsive = getResponsiveCtx()
const menuReservedHeight = $derived(
  getMenuReservedHeight(responsive.visibleWindowWidth, responsive.visibleWindowHeight),
)
const model = useEmbedModel(new URL(page.url.href))
const copy = $derived(embedCopy(model.lang))
const panels = useEmbedPanels(model)
const filters = useEmbedFilters(model)
const layers = $derived(model.payload?.layers ?? [])
const config = $derived(
  model.payload ? { ...model.payload.config, lang: model.lang } : null,
)
const navItems = $derived<AppMenuItem<'maps' | 'filters' | 'settings'>[]>([
  { value: 'maps', icon: MapIcon, label: copy.maps },
  { value: 'filters', icon: FilterIcon, label: copy.filters },
  { value: 'settings', icon: SettingsIcon, label: copy.settings },
])
/** Publishes camera changes only to the same-origin share preview. @param camera Current view. @returns Nothing. */
function cameraChanged(camera: EmbedCamera): void {
  if (window.parent !== window)
    window.parent.postMessage(
      { type: 'hype-embed-camera', camera },
      window.location.origin,
    )
}
</script>
<svelte:head
  ><title>Hype · Embedded map</title>
  <meta name="robots" content="noindex"></svelte:head
>
<div
  data-theme={model.theme}
  class="bits-theme bg-canvas text-foreground fixed inset-0 flex flex-col"
  lang={model.lang}
>
  <main class="relative min-h-0 flex-1">
    {#if config}
      <EmbedMap
        features={model.visible}
        fitFeatures={model.initial}
        {config}
        onselect={id => {
          model.select(id)
          panels.close()
        }}
        oncamera={cameraChanged}
      />
    {/if}
    {#if model.loading || model.failure || !layers.length || !model.visible.length}
      <div
        class="bg-panel pointer-events-none absolute inset-x-4 bottom-8 z-10 mx-auto w-fit max-w-full rounded-xl p-4 shadow-lg"
        role="status"
        style:bottom={`${menuReservedHeight + 16}px`}
      >
        {model.failure
          ? copy.unavailable
          : model.loading
            ? copy.loading
            : !layers.length
              ? copy.empty
              : copy.noFeatures}
        {#if model.failure}
          <button
            type="button"
            class="pointer-events-auto ml-3 underline"
            onclick={() => model.load()}
          >
            {copy.retry}
          </button>
        {/if}
      </div>
    {/if}
    <div
      class="pointer-events-none absolute inset-x-0 top-0 [&>*]:pointer-events-auto"
      style:bottom={`${menuReservedHeight}px`}
    >
      {#key model.lang}
        <ResourcePanel model={panels.resources} />
        <SettingsPanel model={panels.settings} />
        <FiltersPanel shell={panels.filterShell} model={filters} />
      {/key}
    </div>
    {#if model.selected}
      <article
        style:bottom={`${menuReservedHeight + 12}px`}
        class="border-border bg-panel absolute inset-x-3 bottom-3 z-20 mx-auto max-h-[70%] max-w-md overflow-y-auto rounded-xl border p-5 shadow-xl"
      >
        <div class="flex items-start justify-between gap-3">
          <h1 class="text-lg font-semibold">
            {embedLabel(model.selected, model.lang, 'title', model.selected.id)}
          </h1>
          <button
            type="button"
            class="border-border rounded border px-2 py-1"
            onclick={() => model.select(null)}
          >
            {copy.close}
          </button>
        </div>
        {#if model.selected.image}
          <img
            src={getURLfromImage({
              image: model.selected.image,
              transformation: 'c_fit,h_640,w_640',
            })}
            alt={embedLabel(model.selected, model.lang, 'title', '')}
            class="mt-3 max-h-64 w-full rounded-lg object-contain"
            loading="lazy"
          >
        {/if}
        <p class="mt-3 text-sm">
          {embedLabel(model.selected, model.lang, 'displayAddress')}
        </p>
        <p class="my-3 break-words whitespace-pre-wrap">
          {embedLabel(model.selected, model.lang, 'description')}
        </p>
        {#each model.selected.properties.filter(item => item.propertyValue) as item}
          <p class="mb-2 text-sm">
            <span class="font-semibold"
              >{embedLabel(item.property, model.lang, 'name', '')}</span
            > {embedLabel(item.propertyValue, model.lang, 'name', '')}
          </p>
        {/each}
        <a
          href={`${page.url.origin}/features/${encodeURIComponent(model.selected.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          class="underline"
          >{copy.open}</a
        >
      </article>
    {/if}
  </main>
  <AppMenu items={navItems} offsetX={0} onSelect={item => panels.toggle(item.value)} />
</div>
