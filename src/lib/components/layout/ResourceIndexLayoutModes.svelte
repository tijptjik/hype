<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// ICONS
import { QueueList, Squares2x2, TableCells } from '@steeze-ui/heroicons';
// TYPES
import type { LayoutMode } from '$lib/types';

let {
  layoutMode = $bindable(),
  defaultMode = 'card',
  modes = ['card', 'table']
}: {
  layoutMode: LayoutMode;
  defaultMode?: LayoutMode;
  modes?: LayoutMode[];
} = $props();

// Initialize mode if not set
if (!layoutMode) {
  layoutMode = defaultMode;
}

const modeConfig = {
  table: {
    icon: TableCells,
    label: 'Table View'
  },
  list: {
    icon: QueueList,
    label: 'List View'
  },
  card: {
    icon: Squares2x2,
    label: 'Card View'
  }
};

function setMode(newMode: LayoutMode) {
  layoutMode = newMode;
}
</script>

<div class="flex items-center space-x-2">
  {#each modes as modeKey}
  {@const {icon, label} = modeConfig[modeKey]}
    <button
      class="btn btn-ghost transition-opacity duration-200 px-3"
      class:opacity-100={layoutMode === modeKey}
      class:opacity-70={layoutMode !== modeKey}
      class:hover:opacity-100={layoutMode !== modeKey}
      onclick={() => setMode(modeKey)}
      title={label}>
      <Icon src={icon as any} class="h-6 w-6" />
    </button>
  {/each}
</div>
