<script lang="ts">
import { Button } from 'bits-ui'
import { fade } from 'svelte/transition'
// TYPES
import type { ButtonProps } from './button.types'

let {
  text,
  disabled = false,
  hideLabel = false,
  hideLabelInstantly = false,
  attrs = {},
  icon,
  iconComponent: IconComponent,
  href,
  onClick,
  color = 'neutral',
  style = 'none',
  size = 'md',
  modifier,
  transition = 'none',
  duration = 150,
  delay = 0,
  outDuration,
  outDelay = 0,
  class: className = '',
  type = 'button',
}: ButtonProps = $props()

const isIconOnly = $derived(modifier === 'square' || modifier === 'circle')
const shouldHideLabel = $derived(hideLabel || isIconOnly)

const classes = $derived(
  [
    'bits-btn',
    shouldHideLabel ? 'bits-btn--label-hidden' : '',
    shouldHideLabel && hideLabelInstantly ? 'bits-btn--label-hidden-static' : '',
    `bits-btn--color-${color}`,
    `bits-btn--style-${style}`,
    `bits-btn--size-${size}`,
    modifier ? `bits-btn--modifier-${modifier}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const transitionShellClasses = $derived(
  [
    'bits-btn__transition-shell',
    modifier === 'block' ? 'bits-btn__transition-shell--block' : '',
  ]
    .filter(Boolean)
    .join(' '),
)

function handleClick(event: MouseEvent) {
  if (disabled) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  onClick?.(event)
}
</script>

{#snippet buttonContent()}
  {#if icon || IconComponent}
    <span class="bits-btn__icon" aria-hidden="true">
      {#if icon}
        {@render icon()}
      {:else if IconComponent}
        <IconComponent />
      {/if}
    </span>
  {/if}
  <span class="bits-btn__label">{text}</span>
{/snippet}

{#snippet buttonRoot()}
  {#if href}
    <Button.Root
      {...attrs}
      {href}
      class={classes}
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
      aria-label={shouldHideLabel ? text : undefined}
      tabindex={disabled ? -1 : 0}
      {disabled}
      onclick={handleClick}
    >
      {@render buttonContent()}
    </Button.Root>
  {/if}
{/snippet}

{#if transition === 'fade'}
  <div
    class={transitionShellClasses}
    in:fade={{ duration, delay }}
    out:fade={{ duration: outDuration ?? duration, delay: outDelay }}
  >
    {@render buttonRoot()}
  </div>
{:else}
  {@render buttonRoot()}
{/if}
