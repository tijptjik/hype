<script lang="ts">
// BITS-UI
import { Popover } from 'bits-ui'
// BITS
import { cx } from '#lib/bits/utils.js'
// I18N
import { m } from '#lib/i18n.js'
// API
import { adminIntentOrder } from '#lib/api/services/image.js'
import { intentDisplay } from '#lib/client/services/image.js'
// TYPES
import type { Intent } from '#lib/db/zod/schema/image.types.js'
import type { ThumbnailIntentSelectorProps } from './imagePrimitives.types'

let {
  item,
  onIntentChange,
  contentSide = 'left',
  disabled = false,
  class: className = '',
}: ThumbnailIntentSelectorProps & {
  class?: string
} = $props()
let open = $state(false)
const currentIntent = $derived((item.intent ?? 'general') as Intent)
const hasIntentError = $derived(Boolean(item.meta?.intentError))
const intentErrorMessage = $derived(
  typeof item.meta?.intentErrorMessage === 'string'
    ? item.meta.intentErrorMessage
    : null,
)
const orderedIntentOptions = $derived([
  ...adminIntentOrder.filter(option => option !== 'undefined'),
  'undefined',
])

async function handleSelect(nextIntent: Intent): Promise<void> {
  if (disabled) return
  open = false
  await onIntentChange?.(item, nextIntent)
}
</script>

<div class={cx('absolute inset-x-0 bottom-3.5 z-30 flex justify-center', className)}>
  <Popover.Root bind:open>
    <Popover.Trigger
      {disabled}
      class={cx(
        'inline-flex h-[26px] max-w-[6.25rem] items-center rounded-md px-2 text-[10px] font-medium uppercase tracking-[0.14em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed',
        hasIntentError
          ? 'bg-error text-error-content hover:bg-error'
          : currentIntent === 'canonical'
            ? 'bg-primary text-primary-content hover:bg-primary/85'
            : 'border border-border-input bg-(--theme-panel) text-base-content hover:bg-base-200',
      )}
      aria-label={m.gallery__change_image_intent()}
      title={intentErrorMessage ?? undefined}
    >
      <span class="overflow-hidden text-ellipsis whitespace-nowrap"
        >{intentDisplay[currentIntent]}</span
      >
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        side={contentSide}
        align="center"
        sideOffset={10}
        class="bits-theme z-[200] flex w-40 flex-col gap-1 overflow-hidden rounded-xl border border-border-input bg-(--theme-panel) p-1.5 text-base-content shadow-xl backdrop-blur-sm"
      >
        {#each orderedIntentOptions as option}
          <button
            type="button"
            class={cx(
              'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm outline-none transition hover:bg-base-200 focus-visible:bg-base-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              option === currentIntent ? 'text-primary' : 'text-base-content',
            )}
            onclick={() => {
              void handleSelect(option as Intent)
            }}
          >
            <span>{intentDisplay[option as Intent]}</span>
          </button>
        {/each}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
