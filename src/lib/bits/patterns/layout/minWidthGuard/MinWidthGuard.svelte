<script lang="ts">
import { fade } from 'svelte/transition'
import { Icon } from '$lib/bits/custom/icon'
import type { MinWidthGuardProps } from './minWidthGuard.types'

let {
  children,
  minWidth,
  title,
  description,
  widthLabel,
  progressMax = 1200,
  icon = null,
}: MinWidthGuardProps = $props()

let innerWidth = $state(0)
const isViewportWideEnough = $derived(innerWidth >= minWidth)
const shouldHideContent = $derived(innerWidth > 0 && !isViewportWideEnough)
</script>

<svelte:window bind:innerWidth />

<div class="bits-theme relative flex min-h-0 min-w-0 flex-1 h-dvh w-dvw">
  <div
    class="flex min-h-0 min-w-0 flex-1 h-dvh w-dvw"
    class:pointer-events-none={shouldHideContent}
    class:opacity-0={shouldHideContent}
  >
    {@render children()}
  </div>

  {#if innerWidth && !isViewportWideEnough}
    <div
      class="absolute inset-0 z-100 flex h-dvh w-dvw items-center justify-center bg-base-100 p-4 caret-transparent"
      transition:fade={{ duration: 300 }}
    >
      <div
        class="w-full max-w-md rounded-xl border border-base-300 bg-base-200 p-6 text-center shadow-xl"
      >
        {#if icon}
          <div class="mb-4 flex justify-center">
            <Icon src={icon} size="3xl" tone="accent" strokeWidth={2} />
          </div>
        {/if}
        <h2 class="text-2xl font-bold">{title}</h2>
        <p class="mt-3 text-base-content/80">{description}</p>
        <p class="mt-2 text-sm text-base-content/60">{widthLabel}: {innerWidth}px</p>
        <progress
          class="progress progress-accent mt-4 w-full"
          value={innerWidth}
          max={progressMax}
          aria-label="Progress toward minimum width requirement"
        ></progress>
      </div>
    </div>
  {/if}
</div>
