<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { PanelRoot as Panel, ProfileSection } from '$lib/bits'
// ADAPTERS
import { useProfileSectionModel } from '$lib/adapters/panels'
// COMPONENTS
import Header from '$lib/components/panels/common/Header.svelte'
import Info from '$lib/components/panels/info/Settings.svelte'
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
import type { PanelProps } from '$lib/types'

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

const profileSectionModel = useProfileSectionModel(appCtx, () => ({
  hideActions: false,
  hideEditableFields: false,
}))
</script>

<Panel bind:panelContainer {...panelProps}>
  <Header
    title={m.menu_settings()}
    onToggleInfo={e => {
      handleToggleInfo(e)
    }}
    {...panelProps}
  />
  <Info isOpen={isInfoOpen} />

  <ProfileSection {...profileSectionModel.getProfileProps()} />
  <div class="flex flex-col">
    {#if panelProps.isAdmin}
      <div class="shrink-0"><Admin {...panelProps} /></div>
    {/if}
    <div class="shrink-0"><Language {...panelProps} /></div>
    {#if !panelProps.isAdmin}
      <div class="shrink-0"><Contributor {...panelProps} /></div>
      <div class="shrink-0"><DefaultMap {...panelProps} /></div>
      <div class="shrink-0"><Experimental {...panelProps} /></div>
    {/if}
  </div>
</Panel>
