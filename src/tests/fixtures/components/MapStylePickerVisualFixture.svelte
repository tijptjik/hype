<script lang="ts">
import { onMount } from 'svelte'
import { ThemeModel } from '#lib/themes/theme.svelte.js'
import { resolveTheme } from '#lib/themes/themes.js'
import ThemeSection from '#lib/bits/patterns/panels/sections/theme/ThemeSection.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import '#lib/styles/app.css'
setResponsiveCtx()
const theme = new ThemeModel()
onMount(() => {
  theme.selected = resolveTheme(
    document.documentElement.dataset.theme,
    location.hostname,
  )
  theme.restoreMapPreferences()
})
const model = {
  get theme() {
    return theme.selected
  },
  onTheme: theme.select,
  get mapTheme() {
    return theme.mapSelected
  },
  onMapTheme: theme.selectMap,
  get mapSyncEnabled() {
    return theme.mapSyncEnabled
  },
  onMapSync: theme.setMapSync,
  onUseActiveMap: theme.setUseActiveMap,
  get useActiveMapStyle() {
    return theme.useActiveMapStyle
  },
  get resolvedMapTheme() {
    return theme.resolvedMapStyle
  },
  onActiveMapContext: theme.updateActiveMapContext,
} as unknown as ReturnType<typeof useSettingsPanelModel>
const panel = { panelType: 'settings', position: 'right' } as PanelProps
</script>
<div class="min-h-screen bg-panel max-w-96"><ThemeSection {model} {...panel} /></div>
