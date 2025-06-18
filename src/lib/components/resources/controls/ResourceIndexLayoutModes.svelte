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

const nextMode = $derived.by(() => {
  const currentIndex = modes.indexOf(layoutMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  return modes[nextIndex];
});

function toggleMode() {
  layoutMode = nextMode;
}
</script>

<div class="flex items-center space-x-2 caret-transparent">
  <button
    class="btn btn-ghost px-3 transition-opacity duration-200"
    onclick={toggleMode}
    title={`Switch to ${modeConfig[nextMode].label}`}
  >
    <Icon src={modeConfig[nextMode].icon as any} class="h-6 w-6" />
  </button>
</div>
