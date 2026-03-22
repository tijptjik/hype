<script lang="ts">
import { fade } from 'svelte/transition'

import type { IconProps, IconTransition, IconTransitionFn } from './icon.types'

const SIZE_CLASS_MAP = {
  xs: 'bits-icon--size-xs',
  sm: 'bits-icon--size-sm',
  md: 'bits-icon--size-md',
  lg: 'bits-icon--size-lg',
  xl: 'bits-icon--size-xl',
  '2xl': 'bits-icon--size-2xl',
  '3xl': 'bits-icon--size-3xl',
} as const

const TONE_CLASS_MAP = {
  inherit: 'bits-icon--tone-inherit',
  current: 'bits-icon--tone-current',
  base: 'bits-icon--tone-base',
  muted: 'bits-icon--tone-muted',
  primary: 'bits-icon--tone-primary',
  secondary: 'bits-icon--tone-secondary',
  accent: 'bits-icon--tone-accent',
  info: 'bits-icon--tone-info',
  success: 'bits-icon--tone-success',
  warning: 'bits-icon--tone-warning',
  error: 'bits-icon--tone-error',
  white: 'bits-icon--tone-white',
} as const

const ANIMATION_CLASS_MAP = {
  inherit: 'animate-inherit',
  spin: 'animate-spin',
} as const

let {
  src: DynamicIcon,
  size = 'md',
  tone = 'inherit',
  animation = 'inherit',
  transition: transitionFn,
  transitionOpts,
  filled = false,
  strokeWidth,
  title,
  class: className = '',
  style = '',
  ...restProps
}: IconProps = $props()

const resolvedTransition = $derived(resolveTransition(transitionFn))

const classes = $derived(
  [
    'bits-icon',
    SIZE_CLASS_MAP[size],
    TONE_CLASS_MAP[tone],
    ANIMATION_CLASS_MAP[animation],
    filled ? 'fill-current' : 'fill-none',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const styles = $derived(
  [style, strokeWidth !== undefined ? `stroke-width: ${strokeWidth};` : '']
    .filter(Boolean)
    .join(' '),
)

function resolveTransition(
  transition: IconTransition | undefined,
): IconTransitionFn | undefined {
  if (transition === undefined || transition === 'none') {
    return undefined
  }

  if (transition === 'fade') {
    return fade
  }

  return transition
}
</script>

{#if resolvedTransition}
  <span
    class="inline-flex shrink-0"
    transition:resolvedTransition|global={transitionOpts}
  >
    <DynamicIcon class={classes} style={styles} {title} {...restProps} />
  </span>
{:else}
  <DynamicIcon class={classes} style={styles} {title} {...restProps} />
{/if}
