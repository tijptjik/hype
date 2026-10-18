<script lang="ts">
import ThemeSection from '#lib/bits/patterns/panels/sections/theme/ThemeSection.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import '#lib/styles/app.css'
setResponsiveCtx()
let mapTheme = $state<string | null>(null)
const model = {
  theme: 'breadline-light',
  get mapTheme() {
    return mapTheme
  },
  onTheme() {},
  onMapTheme(value: string | null) {
    mapTheme = value
  },
} as unknown as ReturnType<typeof useSettingsPanelModel>
const panel = { panelType: 'settings', position: 'right' } as PanelProps
</script>
<div class="min-h-screen bg-panel max-w-96"><ThemeSection {model} {...panel} /></div>
