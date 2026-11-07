<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// COMPONENTS
import { Switch } from '#lib/bits/custom/switch/index.js'
import SettingsDisclosure from '#lib/bits/patterns/settingsPanel/components/SettingsDisclosure.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
import { ThemePicker } from '#lib/bits/patterns/themePicker/index.js'
// ICONS
import Palette from 'virtual:icons/tabler/palette'
// MAP STYLES
import {
  FEATURED_MAP_STYLE_KEYS,
  SELECTABLE_MAP_STYLE_CATALOG,
  isProjectOnlyMapStyle,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogCopy } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
// TYPES
import type { SettingsPanelModel } from '#lib/bits/patterns/settingsPanel/settingsPanel.types.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

let {
  model,
  ...panelProps
}: PanelProps & {
  model: SettingsPanelModel
} = $props()
const mapModel = $derived('mode' in model ? null : model)
const styles = SELECTABLE_MAP_STYLE_CATALOG.filter(
  style => style.key !== 'hyperAdmin' && !isProjectOnlyMapStyle(style.key),
)
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
const syncId = `${name}-sync`
const activeMapId = `${name}-active-map`
</script>

<Section
  {...panelProps}
  title={m.theme_title()}
  icon={Palette}
  iconGraphicClass="!size-12 scale-125 origin-bottom-right mr-1"
  iconColorClass="text-base-content"
>
  <div class="flex flex-col gap-4 px-6 pt-2 pb-6">
    <SettingsDisclosure title={m.theme_ui_title()} open>
      <div class="pt-3 pb-2">
        {#if mapModel}
          <div class="mb-4 flex items-center justify-between gap-4">
            <label for={syncId} class="min-w-0 text-sm font-light"
              >{m.theme_map_sync()}</label
            >
            <Switch
              id={syncId}
              class="shrink-0"
              checked={mapModel.mapSyncEnabled}
              onCheckedChange={checked => mapModel.onMapSync(checked === true)}
              size="sm"
            />
          </div>
        {/if}
        <ThemePicker
          label={m.theme_ui_title()}
          class="[&>legend]:sr-only"
          value={model.theme}
          onSelect={model.onTheme}
        />
      </div>
    </SettingsDisclosure>
    {#if mapModel}
      <SettingsDisclosure title={m.theme_map_title()} open>
        <fieldset class="min-w-0 pt-3 pb-2">
          <legend class="sr-only">{m.theme_map_title()}</legend>
          <div class="mb-4 flex items-center justify-between gap-4">
            <label for={activeMapId} class="min-w-0 text-sm font-light"
              >{m.theme_map_automatic()}</label
            >
            <Switch
              id={activeMapId}
              class="shrink-0"
              checked={mapModel.useActiveMapStyle}
              onCheckedChange={checked => mapModel.onUseActiveMap(checked === true)}
              size="sm"
            />
          </div>
          <div id={stylesId} class="grid grid-cols-2 gap-3">
            {#each visibleStyles as style (style.key)}
              {@const copy = getMapStyleCatalogCopy(style.key, getLocaleKey())}
              <label
                class="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-card transition-colors hover:border-primary {mapModel.mapTheme ===
                style.key
                  ? 'border-primary'
                  : 'border-border'}"
              >
                <input
                  type="radio"
                  {name}
                  value={style.key}
                  aria-label={copy.name}
                  checked={mapModel.mapTheme === style.key}
                  onchange={() => mapModel.onMapTheme(style.key)}
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
                <span
                  class="px-3 py-3 text-sm font-semibold peer-focus-visible:underline"
                  >{copy.name}</span
                >
                {#if mapModel.mapTheme === style.key}
                  <span
                    aria-hidden="true"
                    class="bg-primary text-primary-content absolute top-2 right-2 rounded-full px-2 py-0.5"
                    >✓</span
                  >
                {/if}
              </label>
            {/each}
          </div>
          <button
            type="button"
            class="border-border text-base-content hover:bg-surface focus-visible:outline-focus mt-3 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
            aria-expanded={showMore}
            aria-controls={stylesId}
            onclick={() => (showMore = !showMore)}
          >
            {showMore ? m.theme_map_show_less() : m.theme_map_show_more()}
          </button>
        </fieldset>
      </SettingsDisclosure>
    {/if}
  </div>
</Section>
