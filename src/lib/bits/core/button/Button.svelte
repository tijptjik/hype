<script lang="ts">
import { fade } from 'svelte/transition'
import { Button } from 'bits-ui'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import { cx } from '$lib/bits/utils'
// STYLES
import {
  BUTTON_ICON_CLASSES,
  BUTTON_LABEL_CLASSES,
  getButtonRootClasses,
  getButtonRootVars,
} from './button.styles'
// TYPES
import type { ButtonProps, ButtonTransition, ButtonTransitionFn } from './button.types'

let {
  text,
  disabled = false,
  hideLabel = false,
  hideLabelInstantly = false,
  availableWidth,
  hideLabelBelow,
  attrs = {},
  icon,
  iconComponent: IconComponent,
  href,
  onClick,
  color = 'neutral',
  style = 'none',
  size = 'md',
  modifier,
  transition: transitionFn,
  transitionOpts,
  iconClasses = '',
  labelClasses = '',
  class: className = '',
  type = 'button',
}: ButtonProps = $props()

const responsiveCtx = getResponsiveCtx()

const isIconOnly = $derived(modifier === 'square' || modifier === 'circle')
const responsiveWidth = $derived(availableWidth ?? responsiveCtx.main.width)
const shouldAutoHideLabel = $derived(
  hideLabelBelow !== undefined &&
    responsiveWidth !== undefined &&
    responsiveWidth < hideLabelBelow,
)
const shouldHideLabel = $derived(hideLabel || isIconOnly || shouldAutoHideLabel)
const hasVisibleLabel = $derived(Boolean(text) && !shouldHideLabel)
const hasIcon = $derived(Boolean(icon || IconComponent))

const classes = $derived(
  cx(
    getButtonRootClasses({ style, modifier, className }),
    !hasVisibleLabel && hasIcon && 'gap-0 justify-center',
  ),
)

const buttonStyles = $derived(getButtonRootVars({ color, style, size }))
const resolvedTransition = $derived(resolveTransition(transitionFn))

function handleClick(event: MouseEvent): void {
  if (disabled) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  onClick?.(event)
}

function resolveTransition(
  transition: ButtonTransition | undefined,
): ButtonTransitionFn | undefined {
  if (transition === undefined || transition === 'none') {
    return undefined
  }

  if (transition === 'fade') {
    return fade
  }

  return transition
}
</script>

{#snippet buttonContent()}
  {#if hasIcon}
    <span class={cx(BUTTON_ICON_CLASSES, iconClasses)} aria-hidden="true">
      {#if icon}
        {@render icon()}
      {:else if IconComponent}
        <IconComponent />
      {/if}
    </span>
  {/if}
  {#if hasVisibleLabel}
    <span
      class={cx(
        BUTTON_LABEL_CLASSES,
        labelClasses,
        hideLabelInstantly && 'transition-none',
        style === 'link' && 'underline underline-offset-4',
      )}
    >
      {text}
    </span>
  {/if}
{/snippet}

{#snippet buttonRoot()}
  {#if href}
    <Button.Root
      {...attrs}
      {href}
      class={classes}
      style={buttonStyles}
      aria-label={shouldHideLabel ? text : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      tabindex={disabled ? -1 : undefined}
      onclick={handleClick}
    >
      {@render buttonContent()}
    </Button.Root>
  {:else}
    <Button.Root
      {...attrs}
      {type}
      class={classes}
      style={buttonStyles}
      aria-label={shouldHideLabel ? text : undefined}
      tabindex={disabled ? -1 : 0}
      {disabled}
      onclick={handleClick}
    >
      {@render buttonContent()}
    </Button.Root>
  {/if}
{/snippet}

{#if resolvedTransition}
  <div
    class={cx(
      'pointer-events-auto inline-flex max-w-full',
      modifier === 'block' && 'block w-full',
    )}
    transition:resolvedTransition|global={transitionOpts}
  >
    {@render buttonRoot()}
  </div>
{:else}
  {@render buttonRoot()}
{/if}
