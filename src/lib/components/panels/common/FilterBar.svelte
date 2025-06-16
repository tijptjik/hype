<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass, XMark } from '@steeze-ui/heroicons';
import { slide } from 'svelte/transition';
import { m } from '$lib/i18n';
let {
  searchTerm = $bindable(''),
  position = 'left',
  onReset
}: {
  searchTerm: string;
  position?: 'left' | 'right';
  onReset?: () => void;
} = $props();

// Reset input and clear filter
const resetInput = async (e: Event) => {
  e.preventDefault();
  searchTerm = '';
  document.getElementById(`search`)?.focus();
};
</script>

<div
  class="relative flex-shrink-0 flex-grow-0 {position == 'right' ? 'pl-4' : ''} "
  transition:slide={{ duration: 200 }}>
  <input
    id="search"
    type="text"
    autocomplete="off"
    bind:value={searchTerm}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (searchTerm) {
          resetInput(e);
        } else {
          // Clear selection
          onReset?.();
        }
      }
    }}
    placeholder={m.legal_clear_panther_soar()}
    class="input m-0 h-12 w-full rounded-none bg-base-200 {position === 'right'
      ? 'rounded-l-md pl-[26px] pr-10'
      : 'rounded-r-md pl-10 pr-[26px]'} text-sm focus:border-none focus:outline-none" />
  <div
    class="absolute inset-y-0 {position === 'left'
      ? 'right-1.5'
      : 'right-[22px]'} flex items-center pr-3">
    {#if !searchTerm}
      <Icon src={MagnifyingGlass} class="h-6 w-6 text-base-content/60" />
    {:else}
      <button onclick={resetInput} class="focus:outline-none" tabindex="-1">
        <Icon src={XMark} class="h-6 w-6 text-base-content/60" />
      </button>
    {/if}
  </div>
</div>
