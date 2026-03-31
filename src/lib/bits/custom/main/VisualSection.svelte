<script lang="ts">
import type { MainVisualSectionProps } from './main.types'

let {
  class: className = '',
  isCollapsed = false,
  expandedHeight = 520,
  collapsedHeight = 64,
  imageAspectRatio = null,
  leftControls,
  centerControls,
  rightControls,
  map,
  image,
}: MainVisualSectionProps = $props()

const rootClass = $derived(
  [
    'bits-theme bits-feature-visual',
    isCollapsed ? 'bits-feature-visual--collapsed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
const rootStyle = $derived(
  `--bits-feature-visual-expanded-height:${expandedHeight}px; --bits-feature-visual-collapsed-height:${collapsedHeight}px; --bits-feature-visual-image-ratio:${imageAspectRatio ?? 1};`,
)
</script>

<section class={rootClass} style={rootStyle}>
  {#if leftControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--left">
      {@render leftControls()}
    </div>
  {/if}

  {#if centerControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--center">
      {@render centerControls()}
    </div>
  {/if}

  {#if rightControls}
    <div class="bits-feature-visual__controls bits-feature-visual__controls--right">
      {@render rightControls()}
    </div>
  {/if}

  <div class="bits-feature-visual__body">
    <div class="bits-feature-visual__map">{@render map?.()}</div>

    <div class="bits-feature-visual__image">{@render image?.()}</div>
  </div>
</section>
