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

<div class="bits-theme bits-min-width-guard__root">
  <div
    class="bits-min-width-guard__content"
    class:bits-min-width-guard__content--hidden={shouldHideContent}
  >
    {@render children()}
  </div>

  {#if innerWidth && !isViewportWideEnough}
    <div class="bits-min-width-guard" transition:fade={{ duration: 300 }}>
      <div class="bits-min-width-guard__card">
        {#if icon}
          <div class="bits-min-width-guard__icon">
            <Icon src={icon} size="3xl" tone="warning" strokeWidth={2} />
          </div>
        {/if}
        <h2 class="bits-min-width-guard__title">{title}</h2>
        <p class="bits-min-width-guard__description">{description}</p>
        <p class="bits-min-width-guard__width">{widthLabel}: {innerWidth}px</p>
        <progress
          class="bits-min-width-guard__progress"
          value={innerWidth}
          max={progressMax}
          aria-label="Progress toward minimum width requirement"
        ></progress>
      </div>
    </div>
  {/if}
</div>
