<script lang="ts">
let { children }: { children: any } = $props();
</script>

<div
  class="flex-grow-1 flex-shrink-4 pointer-events-none flex min-h-0 w-full flex-col overflow-y-auto overflow-x-visible">
  {@render children()}
</div>
