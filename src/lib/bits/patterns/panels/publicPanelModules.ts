// Menu intent and opening share each dynamic module without mounting its contents.
export const publicPanelModules = {
  station: () => import('#lib/bits/patterns/station/StationPanel.svelte'),
  prisms: () => import('#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'),
  stars: () => import('#lib/bits/patterns/starsPanel/StarsPanel.svelte'),
  hub: () => import('#lib/bits/patterns/hubPanel/HubPanel.svelte'),
  filters: () => import('#lib/bits/patterns/filtersPanel/FiltersPanel.svelte'),
  settings: () => import('#lib/bits/patterns/settingsPanel/SettingsPanel.svelte'),
}
