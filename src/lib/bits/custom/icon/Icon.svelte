<script lang="ts">
import { fade } from 'svelte/transition'

import { cx } from '$lib/bits/utils'

import type { IconProps, IconTransition, IconTransitionFn } from './icon.types'

const SIZE_CLASS_MAP = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
  '2xl': 'h-10 w-10',
  '3xl': 'h-12 w-12',
} as const

const TONE_CLASS_MAP = {
  inherit: 'text-inherit',
  current: 'text-current',
  base: '!text-base-content',
  muted: '!text-base-content/70',
  primary: '!text-primary',
  secondary: '!text-secondary',
  accent: '!text-accent',
  info: '!text-info',
  success: '!text-success',
  warning: '!text-warning',
  error: '!text-error',
  white: '!text-white',
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
  cx(
    'inline-block shrink-0 align-middle',
    SIZE_CLASS_MAP[size],
    TONE_CLASS_MAP[tone],
    ANIMATION_CLASS_MAP[animation],
    filled ? 'fill-current' : 'fill-none',
    className,
  ),
)

const styles = $derived(
  cx(style, strokeWidth !== undefined && `stroke-width: ${strokeWidth};`),
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
