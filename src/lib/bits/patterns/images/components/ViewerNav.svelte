<script lang="ts">
import { m } from '$lib/i18n'
import ChevronLeftIcon from 'virtual:icons/lucide/chevron-left'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import type { ViewerControlsProps } from './imagePrimitives.types'
import {
  VIEWER_NAV_BUTTON_CLASSES,
  VIEWER_NAV_ICON_CLASSES,
  VIEWER_NAV_ROOT_CLASSES,
  viewerNavEdgeClass,
} from './ViewerNav.styles'

let { canGoPrev, canGoNext, onPrev, onNext }: ViewerControlsProps = $props()
</script>

<div class={VIEWER_NAV_ROOT_CLASSES}>
  <div class={viewerNavEdgeClass('left')}>
    <button
      type="button"
      class={VIEWER_NAV_BUTTON_CLASSES}
      onclick={onPrev}
      disabled={!canGoPrev}
      aria-label={m.gallery__previous_image()}
    >
      <ChevronLeftIcon class={VIEWER_NAV_ICON_CLASSES} />
    </button>
  </div>

  <div class={viewerNavEdgeClass('right')}>
    <button
      type="button"
      class={VIEWER_NAV_BUTTON_CLASSES}
      onclick={onNext}
      disabled={!canGoNext}
      aria-label={m.gallery__next_image()}
    >
      <ChevronRightIcon class={VIEWER_NAV_ICON_CLASSES} />
    </button>
  </div>
</div>
