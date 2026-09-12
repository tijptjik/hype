<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT

import { Panel as PanelType } from '$lib/enums'
// BITS
import { PanelRoot as Panel } from '$lib/bits'
// AUTH
import { useSession } from '$lib/auth/client'
// COMPONENTS
import Header from '$lib/bits/patterns/panels/components/common/Header.svelte'
import Info from '$lib/bits/patterns/panels/components/info/Stars.svelte'
import WantToVisit from '$lib/bits/patterns/panels/sections/wantToVisit/WantToVisitSection.svelte'
import HaveVisited from '$lib/bits/patterns/panels/sections/haveVisited/HaveVisitedSection.svelte'
import GuestAccountReminder from '$lib/bits/custom/GuestAccountReminder.svelte'
// TYPES
import type { PanelProps } from '$lib/types'
import type { usePanelShellModel } from '$lib/adapters/panels/usePanelShellModel.svelte'

// CONTEXT

const session = useSession()
const isGuestAccount = $derived($session.data?.user?.isAnonymous === true)

let { shell }: { shell: ReturnType<typeof usePanelShellModel> } = $props()

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
  {#if isGuestAccount}
    <GuestAccountReminder />
  {/if}
  <div class="flex h-full overflow-hidden">
    <div class="flex h-[calc(100dvh-140px)] w-full flex-col overflow-hidden">
      <WantToVisit />
      <HaveVisited />
    </div>
  </div>
</Panel>
