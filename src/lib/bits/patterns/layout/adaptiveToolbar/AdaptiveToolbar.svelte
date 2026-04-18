<script lang="ts">
// LIB
import { createAdaptiveToolbarOverflowAttach } from './useAdaptiveToolbarOverflow.svelte'
// TYPES
import type { AdaptiveToolbarProps } from './adaptiveToolbar.types'

let {
  class: className = '',
  left,
  right,
  ...restProps
}: AdaptiveToolbarProps = $props()

let hideMeasuredControls = $state(true)
let hasResolvedOnce = $state(false)
let showButtonText = $state(false)

const rootClass = $derived(
  [
    'bits-pattern-header',
    hideMeasuredControls ? 'bits-pattern-header--hide-measured-controls' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const renderState = $derived({
  showButtonText: hasResolvedOnce ? showButtonText : false,
  isMeasuring: false,
})

const measurementState = {
  showButtonText: true,
  isMeasuring: true,
} as const

const overflowAttach = createAdaptiveToolbarOverflowAttach({
  onMeasureStart: () => {
    if (!hasResolvedOnce) {
      hideMeasuredControls = true
    }
  },
  onMeasureEnd: ({ showButtonText: nextShowButtonText }) => {
    showButtonText = nextShowButtonText
    hasResolvedOnce = true
    hideMeasuredControls = false
  },
})
</script>

<header
  class={rootClass}
  {@attach overflowAttach}
  {...(restProps as Record<string, unknown>)}
>
  <div class="bits-pattern-header__left" data-adaptive-toolbar-left-group>
    {@render left?.(renderState)}
  </div>

  <div class="bits-pattern-header__right" data-adaptive-toolbar-right-group>
    {@render right?.(renderState)}
  </div>

  <div class="bits-pattern-header__measure-layer" aria-hidden="true">
    <div
      class="bits-pattern-header__left bits-pattern-header__measure-group"
      data-adaptive-toolbar-left-group-measure
    >
      {@render left?.(measurementState)}
    </div>

    <div
      class="bits-pattern-header__right bits-pattern-header__measure-group"
      data-adaptive-toolbar-right-group-measure
    >
      {@render right?.(measurementState)}
    </div>
  </div>
</header>
