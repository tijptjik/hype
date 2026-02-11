<script lang="ts">
import { Button } from 'bits-ui'
// TYPES
import type { ButtonProps } from './button.types'

let {
  text,
  disabled = false,
  icon,
  href,
  onClick,
  color = 'neutral',
  style = 'none',
  size = 'md',
  modifier,
  class: className = '',
  type = 'button'
}: ButtonProps = $props()

const isIconOnly = $derived(modifier === 'square' || modifier === 'circle')

const classes = $derived(
  [
    'bits-btn',
    `bits-btn--color-${color}`,
    `bits-btn--style-${style}`,
    `bits-btn--size-${size}`,
    modifier ? `bits-btn--modifier-${modifier}` : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
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

{#if href}
  <Button.Root
    {href}
    class={classes}
    aria-label={isIconOnly ? text : undefined}
    aria-disabled={disabled ? 'true' : undefined}
    tabindex={disabled ? -1 : undefined}
    onclick={handleClick}>
    {#if icon}
      <span class="bits-btn__icon" aria-hidden="true">{@render icon()}</span>
    {/if}
    {#if !isIconOnly}
      <span class="bits-btn__label">{text}</span>
    {/if}
  </Button.Root>
{:else}
  <Button.Root
    {type}
    class={classes}
    aria-label={isIconOnly ? text : undefined}
    {disabled}
    onclick={handleClick}>
    {#if icon}
      <span class="bits-btn__icon" aria-hidden="true">{@render icon()}</span>
    {/if}
    {#if !isIconOnly}
      <span class="bits-btn__label">{text}</span>
    {/if}
  </Button.Root>
{/if}
