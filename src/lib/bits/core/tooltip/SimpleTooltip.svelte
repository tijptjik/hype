<script lang="ts">
// BITS-UI
import { Popover as PopoverPrimitive } from 'bits-ui'
// TOOLTIP POLICY
import { repeatsVisibleTooltipLabel } from './tooltipLabel.js'
// TYPES
import type { SimpleTooltipProps } from './tooltip.types'

let {
  open = $bindable(false),
  trigger,
  children,
  disabled = false,
  showArrow = false,
  triggerProps = {},
  triggerClass = '',
  contentProps = {},
  contentClass = '',
  ...restProps
}: SimpleTooltipProps = $props()
const uid = $props.id()
const contentId = $derived(contentProps.id ?? `${uid}-content`)
let triggerElement = $state<HTMLDivElement>()
let contentElement = $state<HTMLDivElement | null>(null)
let contentIsRedundant = $state(false)

// Apply the same redundancy policy to snippet-based help before its first paint.
$effect(() => {
  if ((contentProps.role ?? 'tooltip') !== 'tooltip') {
    contentIsRedundant = false
    return
  }
  if (!open || !triggerElement || !contentElement) return
  const redundant =
    !contentElement.querySelector(
      'a, button, input, select, textarea, [role="button"]',
    ) && repeatsVisibleTooltipLabel(triggerElement, contentElement.textContent ?? '')
  contentIsRedundant = redundant
  if (!redundant) return
  open = false
  restProps.onOpenChange?.(false)
})

// A scroll invalidates the visible anchor; help must not follow a row out of view.
$effect(() => {
  if (!open || !triggerElement) return
  const dismiss = (): void => {
    open = false
    restProps.onOpenChange?.(false)
  }
  const onScroll = (event: Event): void => {
    const target = event.target
    if (
      target === document ||
      target === window ||
      (target instanceof Node && triggerElement && target.contains(triggerElement))
    )
      dismiss()
  }
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', dismiss)
  return () => {
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', dismiss)
  }
})

const triggerClasses = $derived(
  ['bits-theme', 'bits-tooltip__trigger', triggerClass].filter(Boolean).join(' '),
)

const contentClasses = $derived(
  [
    'bits-theme',
    'bits-tooltip__content',
    showArrow ? 'overflow-visible' : '',
    contentClass,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

{#if disabled || !children}
  {@render trigger()}
{:else}
  <PopoverPrimitive.Root bind:open {...restProps}>
    <PopoverPrimitive.Trigger openOnHover openDelay={500} {...triggerProps}>
      {#snippet child(_triggerChild)}
        <!-- biome-ignore lint/a11y/noStaticElementInteractions: Bits supplies the trigger semantics through the spread props; nested controls retain their own role. -->
        <div
          {..._triggerChild.props}
          bind:this={triggerElement}
          aria-haspopup={contentProps.role === 'dialog' ? 'dialog' : undefined}
          aria-describedby={open
            ? [triggerProps['aria-describedby'], contentId].filter(Boolean).join(' ')
            : triggerProps['aria-describedby']}
          tabindex={triggerProps.tabindex ?? 0}
          class={triggerClasses}
          onkeydown={event => {
            // Nested buttons and inputs retain their own keyboard activation.
            if (
              event.target === event.currentTarget &&
              typeof _triggerChild.props.onkeydown === 'function'
            ) {
              _triggerChild.props.onkeydown(event)
            }
          }}
        >
          {@render trigger()}
        </div>
      {/snippet}
    </PopoverPrimitive.Trigger>

    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...contentProps}
        bind:ref={contentElement}
        hidden={contentIsRedundant || contentProps.hidden}
        aria-hidden={contentIsRedundant ? true : contentProps['aria-hidden']}
        id={contentId}
        role={contentProps.role ?? 'tooltip'}
        class={contentClasses}
        side={contentProps.side ?? 'top'}
        sideOffset={contentProps.sideOffset ?? 8}
        strategy={contentProps.strategy ?? 'fixed'}
        collisionPadding={contentProps.collisionPadding ?? 16}
        trapFocus={false}
        preventScroll={false}
        onOpenAutoFocus={event => {
          // Help overlays must not move focus or scroll the surrounding form.
          event.preventDefault()
          contentProps.onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          contentProps.onCloseAutoFocus?.(event)
        }}
      >
        {@render children?.()}
        {#if showArrow}
          <PopoverPrimitive.Arrow width={20} height={10} class="text-surface" />
        {/if}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
{/if}
