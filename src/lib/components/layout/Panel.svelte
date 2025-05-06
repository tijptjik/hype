<script lang="ts">
import { fly } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
import { onMount } from 'svelte';
let {
  children,
  position = 'right',
  scrollable = true,
  animate = true,
  panelContainer = $bindable()
} = $props<{
  children: any;
  position?: 'left' | 'right';
  scrollable?: boolean;
  animate?: boolean;
  panelContainer?: HTMLDivElement;
}>();

let isMounted = $state(false);

onMount(() => {
  isMounted = true;
});
</script>

<div
  id={`${position}-panel`}
  class="absolute top-0 z-50 flex h-full w-full select-none flex-col bg-black caret-transparent shadow-xl [@media(min-width:920px)]:w-[420px]"
  class:overflow-y-hidden={!scrollable}
  class:overflow-y-auto={scrollable}
  class:md:left-0={position === 'left'}
  class:md:right-0={position === 'right'}
  transition:fly={{
    duration: 150,
    easing: cubicInOut,
    x: position === 'left' ? -420 : 420
  }}>
  <div class="h-full" class:overflow-y-auto={scrollable} bind:this={panelContainer}>
    {@render children()}
  </div>
</div>
