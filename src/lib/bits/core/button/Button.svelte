<script lang="ts">
import { Button } from 'bits-ui'
// TYPES
import type { ButtonProps } from './button.types'

let {
  text,
  disabled = false,
  hideLabel = false,
  icon,
  iconComponent: IconComponent,
  href,
  onClick,
  color = 'neutral',
  style = 'none',
  size = 'md',
  modifier,
  class: className = '',
  type = 'button',
}: ButtonProps = $props()

const isIconOnly = $derived(modifier === 'square' || modifier === 'circle')
const shouldHideLabel = $derived(hideLabel || isIconOnly)

const classes = $derived(
  [
    'bits-btn',
    shouldHideLabel ? 'bits-btn--label-hidden' : '',
    `bits-btn--color-${color}`,
    `bits-btn--style-${style}`,
    `bits-btn--size-${size}`,
    modifier ? `bits-btn--modifier-${modifier}` : '',
    className,
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

{#if href}
  <Button.Root
    {href}
    class={classes}
    aria-label={shouldHideLabel ? text : undefined}
    aria-disabled={disabled ? 'true' : undefined}
    tabindex={disabled ? -1 : undefined}
    onclick={handleClick}
  >
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
  </Button.Root>
{:else}
  <Button.Root
    {type}
    class={classes}
    aria-label={shouldHideLabel ? text : undefined}
    tabindex={disabled ? -1 : 0}
    {disabled}
    onclick={handleClick}
  >
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
  </Button.Root>
{/if}
