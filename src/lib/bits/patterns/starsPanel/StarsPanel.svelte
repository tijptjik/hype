<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT

import { Panel as PanelType } from '$lib/enums'
// BITS
import { PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/bits/patterns/panels/components/common/Header.svelte'
import Info from '$lib/bits/patterns/panels/components/info/Stars.svelte'
import WantToVisit from '$lib/bits/patterns/panels/sections/wantToVisit/WantToVisitSection.svelte'
import HaveVisited from '$lib/bits/patterns/panels/sections/haveVisited/HaveVisitedSection.svelte'
import GuestAccountReminder from '$lib/bits/custom/GuestAccountReminder.svelte'
// TYPES
import type { PanelProps } from '$lib/bits/patterns/panels/panel.types'
import type { usePanelShellModel } from '$lib/adapters/panels/usePanelShellModel.svelte'
import type {
  useSavedFeatureListModel,
} from '$lib/adapters/panels/useSavedFeatureListModel.svelte'

// CONTEXT

let {
  shell,
  model,
}: {
  shell: ReturnType<typeof usePanelShellModel>
  model: {
    isGuestAccount: boolean
    wishlist: ReturnType<typeof useSavedFeatureListModel>
    visited: ReturnType<typeof useSavedFeatureListModel>
  }
} = $props()

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

let isVisitedOpen = $state(false)
let handleToggleVisited = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation()
  isVisitedOpen = !isVisitedOpen
}

let isWantToVisitOpen = $state(false)
let handleToggleWantToVisit = (e: MouseEvent | TouchEvent) => {
  e.stopPropagation()
  isWantToVisitOpen = !isWantToVisitOpen
}

const panelProps = $derived(shell.panel)
</script>

<Panel isOpen={shell.open} bind:panelContainer {...panelProps}>
  <Header
    onClose={shell.onClose}
    {...panelProps}
    title={m.menu_stars()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }}
  />
  <Info isOpen={isInfoOpen} />
  {#if model.isGuestAccount}
    <GuestAccountReminder />
  {/if}
  <div class="flex h-full overflow-hidden">
    <div class="flex h-[calc(100dvh-140px)] w-full flex-col overflow-hidden">
      <WantToVisit model={model.wishlist} panel={panelProps} />
      <HaveVisited model={model.visited} panel={panelProps} />
    </div>
  </div>
</Panel>
