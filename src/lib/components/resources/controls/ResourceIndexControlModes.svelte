<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// ICONS
import { Funnel } from '@steeze-ui/heroicons';
// TYPES
import type { ControlMode } from '$lib/types';

let {
  controlMode = $bindable(),
  defaultMode = null,
  modes = ['filter']
}: {
  controlMode: ControlMode;
  defaultMode?: ControlMode;
  modes?: Exclude<ControlMode, null>[];
} = $props();

const adminCtx = getAdminCtx();

// Initialize mode if not set
if (!controlMode) {
  controlMode = defaultMode;
}

const modeConfig = {
  filter: {
    icon: Funnel,
    label: 'Filters'
  }
};

function toggleMode(modeKey: ControlMode) {
  if (controlMode === modeKey) {
    controlMode = null;
    adminCtx.resetViewFilters();
  } else {
    controlMode = modeKey;
  }
}
</script>

<div class="flex items-center space-x-2">
  {#each modes as modeKey}
    {@const { icon, label } = modeConfig[modeKey]}
    <button
      class="btn btn-ghost px-3 transition-opacity duration-200"
      class:opacity-100={controlMode === modeKey}
      class:opacity-70={controlMode !== modeKey}
      class:hover:opacity-100={controlMode !== modeKey}
      onclick={() => toggleMode(modeKey)}
      title={label}>
      <Icon src={icon as any} class="h-6 w-6" />
    </button>
  {/each}
</div>
