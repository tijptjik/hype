<script lang="ts">
import { m } from '$lib/i18n';
import { ADMIN_MIN_WIDTH } from '$lib';
// SVELTE
import { fade } from 'svelte/transition';
// STATE :: VIEWPORT
let innerWidth = $state(0);
let isViewportWideEnough = $derived(innerWidth >= ADMIN_MIN_WIDTH);

let { children }: { children: any } = $props();
</script>

<svelte:window bind:innerWidth />

<div class="h-full w-full" class:opacity-0={!isViewportWideEnough}>
  {@render children()}
</div>
{#if !isViewportWideEnough}
  <div
    class="fixed z-[100] flex h-screen w-full items-center justify-center bg-base-100 p-4 caret-transparent"
    transition:fade={{ duration: 300 }}>
    <div class="card w-full max-w-md border border-base-300 bg-base-200 shadow-xl">
      <div class="card-body text-center">
        <div class="mb-4 flex justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-16 w-16 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            ></path>
          </svg>
        </div>
        <h2 class="card-title justify-center text-2xl font-bold">
          {m.admin__desktop_only_window_too_small()}
        </h2>
        <p class="text-base-content/80">
          {m.admin__desktop_only_window_too_small_explainer()}
        </p>
        <p class="mt-2 text-sm text-base-content/60">
          {m.admin__desktop_only_current_width()}: {innerWidth}px
        </p>
        <div class="mt-4">
          <progress
            class="progress progress-warning w-full"
            value={innerWidth}
            max="1200"
            aria-label="Progress toward minimum width requirement">
          </progress>
        </div>
      </div>
    </div>
  </div>
{/if}
