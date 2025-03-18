<script lang="ts">
import { fly } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
import { onMount } from 'svelte';
let {
  children,
  direction = 'right',
  scrollable = true,
  animate = true
} = $props<{
  children: any;
  direction?: 'left' | 'right';
  scrollable?: boolean;
  animate?: boolean;
}>();

let isMounted = $state(false);

onMount(() => {
  isMounted = true;
});
</script>

<div
  id={`${direction}-panel`}
  class="absolute z-50 flex h-[calc(100vh-77px)] w-full select-none flex-col bg-black shadow-xl [@media(min-width:920px)]:w-[420px]"
  class:overflow-y-hidden={!scrollable}
  class:overflow-y-auto={scrollable}
  class:md:left-0={direction === 'left'}
  class:md:right-0={direction === 'right'}
  transition:fly={{
    duration: 150,
    easing: cubicInOut,
    x: direction === 'left' ? -420 : 420
  }}>
  <div class="h-full" class:overflow-y-auto={scrollable}>
    {@render children()}
  </div>
</div>
