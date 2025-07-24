<script lang="ts">
// TYPES
interface Props {
  leftActions?: import('svelte').Snippet;
  rightActions?: import('svelte').Snippet;
}

// PROPS
let { leftActions, rightActions }: Props = $props();
</script>

<div
  class="pointer-events-auto flex min-h-16 flex-shrink-0 flex-row items-center justify-between bg-black px-3 py-2 pt-3 caret-transparent w-100:px-4 w-100:pb-4 w-112:rounded-b-lg">
  <div class="flex-1">
    {#if leftActions}
      {@render leftActions()}
    {/if}
  </div>
  <div class="flex-shrink-0">
    {#if rightActions}
      {@render rightActions()}
    {/if}
  </div>
</div>
