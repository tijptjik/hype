<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// BITS
import { cx } from '#lib/bits/index.js'
import * as ImagePrimitive from '#lib/bits/patterns/images/components/index.js'
import { VISUAL_TRANSITION_MS } from './visualTransition.js'
import type { MainVisualSectionImageProps } from './main.types'

let {
  class: className = '',
  href = undefined,
  src = null,
  alt,
  isCollapsed = false,
  emptyText = 'No image available',
  onImageLoad,
}: MainVisualSectionImageProps = $props()

const rootClass = $derived(
  cx(
    'relative w-full min-h-0',
    !isCollapsed && 'h-full',
    isCollapsed &&
      'top-[calc((var(--bits-feature-visual-collapsed-height,64px)-var(--bits-feature-visual-expanded-height,520px))/2)] h-[var(--bits-feature-visual-expanded-height,520px)] self-start',
    className,
  ),
)
const mediaClass = $derived(
  cx(
    'relative flex h-full min-h-0 w-full overflow-hidden border-0 bg-transparent',
    'items-center justify-center',
  ),
)
const imageItem = $derived(
  src
    ? {
        id: src,
        src,
        alt,
      }
    : null,
)
</script>

<div class={rootClass}>
  <a class={mediaClass} {href}>
    {#if src}
      {#key src}
        <div
          class="absolute inset-0"
          transition:fade={{
            duration: prefersReducedMotion.current ? 0 : VISUAL_TRANSITION_MS,
          }}
        >
          <ImagePrimitive.ImageSurface
            item={imageItem}
            fit={isCollapsed ? 'cover' : 'fit'}
            enableSourceTransition={false}
            showBackdrop={!isCollapsed}
            class="h-full w-full"
            rounded="rounded-none"
            onLoad={size => {
              if (!size) return
              onImageLoad?.(size)
            }}
          />
        </div>
      {/key}
    {:else}
      <div
        class="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/8 via-panel to-secondary/10 text-center text-muted-foreground"
      >
        <div
          aria-hidden="true"
          class="absolute -right-12 -top-12 size-64 rounded-full border border-primary/10"
        ></div>
        <div
          aria-hidden="true"
          class="absolute -bottom-20 -left-12 size-72 rounded-full border border-secondary/15"
        ></div>
        <div class="relative flex flex-col items-center gap-3 px-6 py-8">
          <svg
            aria-hidden="true"
            viewBox="0 0 160 112"
            class="h-28 w-40 text-primary/60"
            fill="none"
          >
            <rect
              x="33"
              y="12"
              width="104"
              height="78"
              rx="10"
              transform="rotate(9 85 51)"
              class="fill-secondary/10 stroke-secondary/25"
            />
            <rect
              x="22"
              y="20"
              width="112"
              height="80"
              rx="10"
              class="fill-panel stroke-primary/30"
              stroke-width="1.5"
            />
            <circle cx="105" cy="43" r="9" class="fill-accent/30" />
            <path
              d="M23 84 57 49 85 79 101 62 133 91V90a10 10 0 0 1-10 10H33a10 10 0 0 1-10-10Z"
              class="fill-primary/10 stroke-primary/35"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <path d="m57 49 9 10-9-3-8 3" class="stroke-primary/35" />
          </svg>
          <p class="text-sm font-medium text-foreground/75">{emptyText}</p>
          <p class="max-w-56 text-xs text-muted-foreground">
            A photo will appear here when added.
          </p>
        </div>
      </div>
    {/if}
  </a>
</div>
