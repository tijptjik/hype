<script lang="ts">
import type { OverlayBarProps } from './overlayBar.types'

let { left, center, right, class: className = '' }: OverlayBarProps = $props()

const classes = $derived(
  ['bits-theme', 'bits-overlay-bar', className].filter(Boolean).join(' '),
)
</script>

<div class={classes}>
  <div class="bits-overlay-bar__grid">
    <div class="bits-overlay-bar__section bits-overlay-bar__section--left">
      {@render left?.()}
    </div>
    <div class="bits-overlay-bar__section bits-overlay-bar__section--center">
      {@render center?.()}
    </div>
    <div class="bits-overlay-bar__section bits-overlay-bar__section--right">
      {@render right?.()}
    </div>
  </div>
</div>
