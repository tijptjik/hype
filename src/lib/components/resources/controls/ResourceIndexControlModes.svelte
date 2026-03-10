<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
// ICONS
import { Funnel } from '@steeze-ui/heroicons'
import ArrowUpDown from 'virtual:icons/lucide/arrow-up-down'
// TYPES
import type { ControlMode } from '$lib/types'

type VisibleControlMode = Exclude<ControlMode, 'hidden'>

let {
  controlMode = $bindable<ControlMode | null>(null),
  defaultMode = null,
  modes = ['filter', 'sort'],
}: {
  controlMode: ControlMode | null
  defaultMode?: ControlMode | null
  modes?: VisibleControlMode[]
} = $props()

const adminCtx = getAdminCtx()

$effect(() => {
  if (controlMode === null && defaultMode !== null) {
    controlMode = defaultMode
  }
})

const modeConfig: Record<VisibleControlMode, { icon: unknown; label: string }> = {
  filter: {
    icon: Funnel,
    label: 'Filters',
  },
  sort: {
    icon: ArrowUpDown,
    label: 'Sorting',
  },
}

function toggleMode(modeKey: VisibleControlMode): void {
  if (controlMode === modeKey) {
    controlMode = null
    if (modeKey === 'filter') {
      adminCtx.resetViewFilters()
    }
  } else {
    controlMode = modeKey
  }
  adminCtx.appCtx.setControlMode(controlMode)
}
</script>

<div class="flex items-center space-x-2 caret-transparent">
  {#each modes as modeKey}
    {@const { icon, label } = modeConfig[modeKey]}
    <button
      class="btn btn-ghost px-3 transition-opacity duration-200"
      class:opacity-100={controlMode === modeKey}
      class:opacity-70={controlMode !== modeKey}
      class:hover:opacity-100={controlMode !== modeKey}
      onclick={() => toggleMode(modeKey)}
      title={label}
    >
      <Icon src={icon as any} class="h-6 w-6" />
    </button>
  {/each}
</div>
