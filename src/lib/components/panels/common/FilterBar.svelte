<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass, XMark } from '@steeze-ui/heroicons';
import { slide } from 'svelte/transition';
let { searchTerm = $bindable('') } = $props<{
  searchTerm: string;
}>();

// Reset input and clear filter
const resetInput = async (e: Event) => {
  e.preventDefault();
  searchTerm = '';
  document.getElementById('search')?.focus();
};
</script>

<div class="relative flex-shrink-0 flex-grow-0" transition:slide={{ duration: 200 }}>
  <input
    id="search"
    type="text"
    bind:value={searchTerm}
    placeholder="Search..."
    class="input m-0 h-12 w-full rounded-none bg-base-200 pl-[30px] pr-10 text-sm focus:border-none focus:outline-none" />
  <div class="absolute inset-y-0 right-1.5 flex items-center pr-3">
    {#if !searchTerm}
      <Icon src={MagnifyingGlass} class="h-6 w-6 text-base-content/60" />
    {:else}
      <button onclick={resetInput} class="focus:outline-none">
        <Icon src={XMark} class="h-6 w-6 text-base-content/60" />
      </button>
    {/if}
  </div>
</div>
