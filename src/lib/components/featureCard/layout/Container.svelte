<script lang="ts">
  let { children }: { children: any } = $props();
</script>

<div
  class="flex flex-grow-1 flex-shrink-4 pointer-events-auto w-full flex-col overflow-y-auto overflow-x-visible min-h-0">
  {@render children()}
</div>
