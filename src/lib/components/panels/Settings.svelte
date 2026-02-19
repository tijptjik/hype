<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
import Panel from '$lib/components/layout/Panel.svelte'
import Info from '$lib/components/panels/info/Settings.svelte'
import Profile from '$lib/components/panels/sections/Profile.svelte'
import Language from '$lib/components/panels/sections/Language.svelte'
import Contributor from '$lib/components/panels/sections/Contributor.svelte'
import DefaultMap from '$lib/components/panels/sections/DefaultMap.svelte'
import Experimental from '$lib/components/panels/sections/Experimental.svelte'
import Admin from '$lib/components/panels/sections/Admin.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { Panel as PanelEnum, PanelSide } from '$lib/enums'
// TYPES
import type { PanelPosition, PanelProps } from '$lib/types'

// CONTEXT
const appCtx = getAppCtx()

// STATE
let isInfoOpen = $state(false)
// svelte-ignore non_reactive_update
let panelContainer: HTMLDivElement

let handleToggleInfo = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation()
  isInfoOpen = !isInfoOpen
  if (isInfoOpen) {
    setTimeout(() => {
      panelContainer?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 300)
  }
}

let panelProps: PanelProps = $derived({
  panelType: PanelEnum.settings,
  position: PanelSide.right,
  scrollable: true,
  inline: appCtx.isAdmin(),
  isNarrow: false,
  isAdmin: appCtx.isAdmin(),
})
</script>

<Panel bind:panelContainer {...panelProps}>
  <Header
    title={m.menu_settings()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }}
    {...panelProps}
  />
  <Info isOpen={isInfoOpen} />

  <Profile />
  <div class="flex h-[calc(100vh-206px)] flex-col">
    {#if panelProps.isAdmin}
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Admin {...panelProps} />
      </div>
    {/if}
    <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
      <Language {...panelProps} />
    </div>
    {#if !panelProps.isAdmin}
      <div class="flex-grow-1 flex min-h-0 flex-shrink-0 flex-col">
        <Contributor {...panelProps} />
      </div>
      <div class="flex-grow-1 flex max-h-[calc(50vh)] min-h-0 flex-shrink-0 flex-col">
        <DefaultMap {...panelProps} />
      </div>
      <div class="flex-grow-1 flex max-h-[calc(50vh)] min-h-0 flex-shrink-0 flex-col">
        <Experimental {...panelProps} />
      </div>
    {/if}
  </div>
</Panel>
