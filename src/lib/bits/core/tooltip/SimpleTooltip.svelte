<script lang="ts">
// BITS-UI
import { Popover as PopoverPrimitive } from 'bits-ui'
// TYPES
import type { SimpleTooltipProps } from './tooltip.types'

let {
  open = $bindable(false),
  trigger,
  children,
  disabled = false,
  triggerProps = {},
  triggerClass = '',
  contentProps = {},
  contentClass = '',
  ...restProps
}: SimpleTooltipProps = $props()
const uid = $props.id()
const contentId = $derived(contentProps.id ?? `${uid}-content`)
let triggerElement = $state<HTMLDivElement>()

// A scroll invalidates the visible anchor; help must not follow a row out of view.
$effect(() => {
  if (!open || !triggerElement) return
  const dismiss = (): void => { open = false; restProps.onOpenChange?.(false) }
  const onScroll = (event: Event): void => {
    const target = event.target
    if (target === document || target === window || target instanceof Node && triggerElement && target.contains(triggerElement)) dismiss()
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
  ['bits-theme', 'bits-tooltip__content', contentClass].filter(Boolean).join(' '),
)
</script>

{#if disabled || !children}
  {@render trigger()}
{:else}
  <PopoverPrimitive.Root bind:open {...restProps}>
    <PopoverPrimitive.Trigger openOnHover {...triggerProps}>
      {#snippet child(
        _triggerChild,
      )}
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
            if (event.target === event.currentTarget && typeof _triggerChild.props.onkeydown === 'function') {
              _triggerChild.props.onkeydown(event)
            }
          }}
        >{@render trigger()}</div>
      {/snippet}
    </PopoverPrimitive.Trigger>

    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...contentProps}
        id={contentId}
        role={contentProps.role ?? 'tooltip'}
        class={contentClasses}
        side={contentProps.side ?? 'top'}
        sideOffset={contentProps.sideOffset ?? 8}
        strategy={contentProps.strategy ?? 'fixed'}
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
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
{/if}
