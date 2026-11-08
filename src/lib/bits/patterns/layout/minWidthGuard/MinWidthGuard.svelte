<script lang="ts">
import { fade } from 'svelte/transition'
import { Icon } from '#lib/bits/custom/icon/index.js'
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

<div class="bits-theme relative flex h-dvh min-h-0 w-dvw min-w-0 flex-1">
  <div
    class="flex h-dvh min-h-0 w-dvw min-w-0 flex-1"
    class:pointer-events-none={shouldHideContent}
    class:opacity-0={shouldHideContent}
  >
    {@render children()}
  </div>

  {#if innerWidth && !isViewportWideEnough}
    <div
      class="bg-base-100 absolute inset-0 z-100 flex h-dvh w-dvw items-center justify-center p-4 caret-transparent"
      transition:fade={{ duration: 300 }}
    >
      <div
        class="border-base-300 bg-base-200 w-full max-w-md rounded-xl border p-6 text-center shadow-xl"
      >
        {#if icon}
          <div class="mb-4 flex justify-center">
            <Icon src={icon} size="3xl" tone="accent" strokeWidth={2} />
          </div>
        {/if}
        <h2 class="text-2xl font-bold">{title}</h2>
        <p class="text-base-content/80 mt-3">{description}</p>
        <p class="text-base-content/60 mt-2 text-sm">{widthLabel}: {innerWidth}px</p>
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
