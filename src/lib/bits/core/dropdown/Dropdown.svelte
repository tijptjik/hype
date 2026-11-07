<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// BITS-UI
import { DropdownMenu } from 'bits-ui'
// BITS
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { DropdownProps } from './dropdown.types'

let {
  ariaLabel,
  disabled = false,
  triggerClass = '',
  triggerIcon: TriggerIcon = null,
  triggerIconClass = '',
  contentClass = '',
  attached = false,
  contentSide = 'bottom',
  contentSideOffset = 8,
  contentAlign = 'center',
  contentAlignOffset = 0,
  itemClass = '',
  items = [],
}: DropdownProps = $props()

let open = $state(false)

const resolvedTriggerClass = $derived(
  cx(
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-border-input bg-base-content/3 text-muted-foreground transition hover:bg-base-content/6 hover:text-base-content',
    triggerClass,
  ),
)

const resolvedTriggerIconClass = $derived(cx('h-5 w-5', triggerIconClass))
const resolvedContentClass = $derived(
  cx(
    'z-[1200] min-w-[12rem] rounded-2xl border border-border-input bg-(--theme-panel) p-2 text-base-content shadow-2xl backdrop-blur-xl',
    contentClass,
  ),
)
const resolvedItemClass = $derived(
  cx(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-base-content outline-none transition hover:bg-base-200 data-[highlighted]:bg-base-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
    itemClass,
  ),
)
</script>

{#snippet menuItems()}
  {#each items as item, index (`${item.label}-${index}`)}
    <DropdownMenu.Item
      class={cx(resolvedItemClass, item.class)}
      disabled={item.disabled}
      onSelect={() => item.onSelect?.()}
    >
      {#if item.icon}
        <item.icon class={cx('h-4 w-4 shrink-0', item.iconClass)} />
      {/if}
      <span>{item.label}</span>
    </DropdownMenu.Item>
  {/each}
{/snippet}

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    data-attached-menu-open={attached && open ? true : undefined}
    class={resolvedTriggerClass}
    aria-label={ariaLabel}
    {disabled}
  >
    {#if TriggerIcon}
      <TriggerIcon class={resolvedTriggerIconClass} />
    {/if}
  </DropdownMenu.Trigger>

  {#if attached}
    <!-- Keep the panel in the card stacking context, beneath its portal and labels. -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-full z-0 overflow-hidden pt-2"
      style="mask-image: var(--feature-card-menu-mask);"
    >
      <DropdownMenu.ContentStatic forceMount>
        {#snippet child({ props })}
          {#if open}
            <div
              {...props}
              class="text-base-content before:bg-border-input/40 pointer-events-auto relative bg-(--theme-panel) px-[var(--feature-card-breadcrumbs-padding)] py-2 shadow-[0_-4px_8px_-4px_rgb(0_0_0/0.25)] outline-none before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px"
              style="padding-right: var(--feature-card-menu-right-inset);"
              transition:slide={{
                duration: prefersReducedMotion.current ? 0 : 420,
                easing: cubicInOut,
              }}
            >
              {@render menuItems()}
            </div>
          {/if}
        {/snippet}
      </DropdownMenu.ContentStatic>
    </div>
  {:else}
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class={resolvedContentClass}
        side={contentSide}
        sideOffset={contentSideOffset}
        align={contentAlign}
        alignOffset={contentAlignOffset}
      >
        {@render menuItems()}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  {/if}
</DropdownMenu.Root>
