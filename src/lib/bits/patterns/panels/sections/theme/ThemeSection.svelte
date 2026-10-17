<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// COMPONENTS
import SettingsDisclosure from '#lib/bits/patterns/settingsPanel/components/SettingsDisclosure.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
import { ThemePicker } from '#lib/bits/patterns/themePicker/index.js'
// ICONS
import Palette from 'virtual:icons/tabler/palette'
// MAP STYLES
import {
  FEATURED_MAP_STYLE_KEYS,
  REGISTERED_MAP_STYLE_CATALOG,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogCopy } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
// TYPES
import type { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

let {
  model,
  ...panelProps
}: PanelProps & {
  model: ReturnType<typeof useSettingsPanelModel>
} = $props()
const styles = REGISTERED_MAP_STYLE_CATALOG.filter(style => style.key !== 'hyperAdmin')
const featuredStyles = FEATURED_MAP_STYLE_KEYS.flatMap(key =>
  styles.filter(style => style.key === key),
)
const additionalStyles = styles.filter(
  style => !FEATURED_MAP_STYLE_KEYS.some(key => key === style.key),
)
let showMore = $state(false)
const visibleStyles = $derived(
  showMore ? [...featuredStyles, ...additionalStyles] : featuredStyles,
)
const name = $props.id()
const stylesId = `${name}-styles`
</script>

<Section
  {...panelProps}
  title={m.theme_title()}
  icon={Palette}
  iconGraphicClass="!size-12 scale-125 origin-bottom-right mr-1"
  iconColorClass="text-base-content"
>
  <div class="flex flex-col gap-4 px-6 pt-2 pb-6">
    <SettingsDisclosure title="UI" open>
      <div class="pt-3 pb-2">
        <ThemePicker
          label="UI"
          class="[&>legend]:sr-only"
          value={model.theme}
          onSelect={model.onTheme}
        />
      </div>
    </SettingsDisclosure>
    <SettingsDisclosure title={m.theme_map_title()} open>
      <fieldset class="min-w-0 pt-3 pb-2">
        <legend class="sr-only">{m.theme_map_title()}</legend>
        <label class="mb-4 flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            {name}
            checked={model.mapTheme === null}
            onchange={() => model.onMapTheme(null)}
            class="accent-primary"
          >
          {m.theme_map_automatic()}
        </label>
        <div id={stylesId} class="grid grid-cols-2 gap-3">
          {#each visibleStyles as style (style.key)}
            {@const copy = getMapStyleCatalogCopy(style.key, getLocaleKey())}
            <label
              class="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-card transition-colors hover:border-primary {model.mapTheme ===
              style.key
                ? 'border-primary'
                : 'border-border'}"
            >
              <input
                type="radio"
                {name}
                value={style.key}
                aria-label={copy.name}
                checked={model.mapTheme === style.key}
                onchange={() => model.onMapTheme(style.key)}
                class="peer sr-only"
              >
              <img
                src={getMapStyleRenderAssetPath(style.key)}
                alt={copy.name}
                loading="lazy"
                width="256"
                height="256"
                class="aspect-square w-full object-cover"
              >
              <span class="px-3 py-3 text-sm font-semibold peer-focus-visible:underline"
                >{copy.name}</span
              >
              {#if model.mapTheme === style.key}
                <span
                  aria-hidden="true"
                  class="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground"
                  >✓</span
                >
              {/if}
            </label>
          {/each}
        </div>
        <button
          type="button"
          class="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm text-base-content hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          aria-expanded={showMore}
          aria-controls={stylesId}
          onclick={() => (showMore = !showMore)}
        >
          {showMore ? m.theme_map_show_less() : m.theme_map_show_more()}
        </button>
      </fieldset>
    </SettingsDisclosure>
  </div>
</Section>
