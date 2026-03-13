<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
// ICONS
import SlidersHorizontal from 'virtual:icons/lucide/sliders-horizontal'

let {
  isControlBarVisible = false,
  onToggle,
}: {
  isControlBarVisible: boolean
  onToggle?: (next: boolean) => void
} = $props()
</script>

<div class="flex items-center caret-transparent">
  <button
    class="btn btn-ghost px-3 transition-opacity duration-200"
    class:opacity-100={isControlBarVisible}
    class:opacity-70={!isControlBarVisible}
    class:hover:opacity-100={!isControlBarVisible}
    onclick={() => {
      onToggle?.(!isControlBarVisible)
    }}
    title="Controls"
  >
    <Icon src={SlidersHorizontal as any} class="h-6 w-6" />
  </button>
</div>
