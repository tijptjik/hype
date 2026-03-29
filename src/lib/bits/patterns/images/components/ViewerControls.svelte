<script lang="ts">
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import type { ViewerControlsProps } from './imagePrimitives.types'

let { canGoPrev, canGoNext, onPrev, onNext }: ViewerControlsProps = $props()
</script>

<div
  class={cx(
    'pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-150',
    'group-hover/viewer:opacity-100 group-focus-within/viewer:opacity-100',
  )}
>
  <div class="absolute inset-y-0 left-0 flex items-center p-3">
    <button
      type="button"
      class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 disabled:cursor-default disabled:opacity-25"
      onclick={onPrev}
      disabled={!canGoPrev}
      aria-label={m.gallery__previous_image()}
    >
      <ChevronLeftIcon class="h-5 w-5" />
    </button>
  </div>

  <div class="absolute inset-y-0 right-0 flex items-center p-3">
    <button
      type="button"
      class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60 disabled:cursor-default disabled:opacity-25"
      onclick={onNext}
      disabled={!canGoNext}
      aria-label={m.gallery__next_image()}
    >
      <ChevronRightIcon class="h-5 w-5" />
    </button>
  </div>
</div>
