<script lang="ts">
  let { children } = $props<{
    children: any;
  }>();
</script>

<div class="flex flex-col min-h-0 overflow-y-auto scrollbar-thin bg-black gap-[1px] py-1">
    {@render children()}
</div>
