<script lang="ts">
let { children } = $props<{
  children: any;
}>();
</script>

<div
  class="scrollbar-thin flex min-h-0 flex-col gap-[1px] overflow-visible overflow-y-auto overscroll-none bg-black py-1"
  tabindex="-1">
  {@render children()}
</div>
