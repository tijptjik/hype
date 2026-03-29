<script lang="ts">
import { Popover } from 'bits-ui'
import { cx } from '$lib/bits/utils'
import { m } from '$lib/i18n'
import { adminIntentOrder } from '$lib/api/services/image'
import { intentDisplay } from '$lib/client/services/image'
import type { Intent } from '$lib/db/zod/schema/image.types'
import type { ThumbnailIntentSelectorProps } from './imagePrimitives.types'

let {
  imageId,
  intent = 'general',
  onIntentChange,
  class: className = '',
}: ThumbnailIntentSelectorProps & {
  class?: string
} = $props()
let open = $state(false)
const currentIntent = $derived((intent ?? 'general') as Intent)
const orderedIntentOptions = $derived([
  ...adminIntentOrder.filter(option => option !== 'undefined'),
  'undefined',
])

async function handleSelect(nextIntent: Intent): Promise<void> {
  await onIntentChange?.(imageId, nextIntent)
  open = false
}
</script>

<div class={cx('absolute inset-x-0 bottom-3.5 z-30 flex justify-center', className)}>
  <Popover.Root bind:open>
    <Popover.Trigger
      class={cx(
        'inline-flex h-[26px] max-w-[6.25rem] items-center rounded-md px-2 text-[10px] font-medium uppercase tracking-[0.14em] transition',
        currentIntent === 'canonical'
          ? 'bg-primary/70 text-white hover:bg-primary/85'
          : 'bg-black/70 text-white hover:bg-black/85',
      )}
      aria-label={m.gallery__change_image_intent()}
    >
      <span class="truncate">{intentDisplay[currentIntent]}</span>
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        side="left"
        align="center"
        sideOffset={10}
        class="bits-theme z-[200] flex w-40 flex-col gap-1 overflow-hidden rounded-xl border border-white/10 bg-black/95 p-1.5 shadow-xl backdrop-blur-sm"
      >
        {#each orderedIntentOptions as option}
          <button
            type="button"
            class={cx(
              'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition',
              option === currentIntent
                ? 'text-primary hover:bg-white/10'
                : 'text-white hover:bg-white/10',
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
