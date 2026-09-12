<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { PanelRoot as Panel } from '$lib/bits'
// COMPONENTS
import Header from '$lib/bits/patterns/panels/components/common/Header.svelte'
import Info from '$lib/bits/patterns/panels/components/info/Filters.svelte'
import Reset from '$lib/bits/patterns/panels/components/controls/Reset.svelte'
import Neighbourhoods from '$lib/bits/patterns/panels/sections/neighbourhoods/NeighbourhoodsSection.svelte'
import Categories from '$lib/bits/patterns/panels/sections/categories/CategoriesSection.svelte'
// CONTEXT

// ENUMS
import { Panel as PanelType, PanelSide } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'
import type { usePanelShellModel } from '$lib/adapters/panels/usePanelShellModel.svelte'
import type { useFilterPanelModel } from '$lib/adapters/panels/useFilterPanelModel.svelte'

// CONTEXT

let {
  shell,
  model,
}: {
  shell: ReturnType<typeof usePanelShellModel>
  model: ReturnType<typeof useFilterPanelModel>
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

const panelProps = $derived(shell.panel)
</script>

<!-- Filter changes are applied to the already-loaded feature collection so marker updates
     and viewport fitting stay synchronous with the selected filter state. -->

<Panel isOpen={shell.open} bind:panelContainer {...panelProps}>
  <Header
    onClose={shell.onClose}
    {...panelProps}
    title={m.menu_filters()}
    onToggleInfo={(e) => {
      handleToggleInfo(e);
    }}
  />
  <Info isOpen={isInfoOpen} />
  <div class="flex flex-col">
    <div class="grow flex max-h-[40vh] min-h-0 shrink-0 flex-col">
      <Neighbourhoods {model} {...panelProps} />
    </div>
    <div class="grow flex max-h-[calc(100vh-206px)] min-h-0 shrink-0 flex-col">
      <Categories {model} {...panelProps} />
    </div>
  </div>
  <Reset text={model.resetText} active={model.hasActiveFilters} onReset={model.reset} />
</Panel>
