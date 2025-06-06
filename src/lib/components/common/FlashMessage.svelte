<script lang="ts">
// Animation
import { fade, fly } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';

const flash = getFlash(page, {
  clearOnNavigate: false,
  clearAfterMs: 5000 // Auto-clear after 5 seconds
});
</script>

{#if $flash}
  <div
    class="fixed bottom-24 left-1/2 z-50 w-full max-w-md px-4"
    style="transform: translateX(-50%) !important;">
    <div
      class="alert relative rounded-none border-l-2 bg-black shadow-lg"
      class:border-primary={$flash.type === 'success'}
      class:text-primary={$flash.type === 'success'}
      class:border-error={$flash.type === 'error'}
      class:text-error={$flash.type === 'error'}
      class:border-info={$flash.type === 'info'}
      class:text-info={$flash.type === 'info'}
      class:border-warning={$flash.type === 'warning'}
      class:text-warning={$flash.type === 'warning'}
      in:fly={{ duration: 500, y: 400, opacity: 0, easing: cubicInOut }}
      out:fly={{ duration: 300, y: 400, opacity: 0, easing: cubicInOut }}>
      <div class="flex flex-row gap-2 pr-10">
        {#if $flash.type === 'success'}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 flex-shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        {:else if $flash.type === 'error'}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 flex-shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        {:else if $flash.type === 'warning'}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 flex-shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            ></path>
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="h-6 w-6 flex-shrink-0 stroke-current">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        {/if}
        <span class="break-words">{$flash.message}</span>
      </div>
      <button
        class="btn btn-ghost btn-sm absolute right-3 top-3 h-auto min-h-0 p-1"
        onclick={() => ($flash = undefined)}
        aria-label="Close notification">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  </div>
{/if}
