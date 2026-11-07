<script lang="ts">
// BITS-UI
import { Popover } from 'bits-ui'
// ICONS
import ChevronsUpDownIcon from 'virtual:icons/proicons/arrow-up-down'
// BITS
import { cx } from '#lib/bits/utils.js'
// I18N
import { m } from '#lib/i18n.js'
// API
import {
  DEFAULT_IMAGE_INTENTS,
  ImageIntentCatalogueSchema,
} from '#lib/images/intents.js'
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
  contentClass = '',
  label,
  toolbar = false,
}: ThumbnailIntentSelectorProps & {
  class?: string
  contentClass?: string
  label?: string
  toolbar?: boolean
} = $props()
let open = $state(false)
const intentDisabled = $derived(
  !onIntentChange || disabled || item.meta?.intentReadonly === true,
)
const currentIntent = $derived((item.intent ?? 'undefined') as Intent)
const intentOptions = $derived(
  ImageIntentCatalogueSchema.safeParse(item.meta?.intentOptions).data ??
    DEFAULT_IMAGE_INTENTS,
)
const hasIntentError = $derived(Boolean(item.meta?.intentError))
const intentErrorMessage = $derived(
  typeof item.meta?.intentErrorMessage === 'string'
    ? item.meta.intentErrorMessage
    : null,
)
const orderedIntentOptions = $derived(intentOptions.map(intent => intent.id))

async function handleSelect(nextIntent: Intent): Promise<void> {
  if (intentDisabled) return
  open = false
  await onIntentChange?.(item, nextIntent)
}
</script>

<!-- Keep the current intent visible while saving; disabled controls cannot change it. -->
<div
  class={cx(
    toolbar
      ? 'relative flex shrink-0'
      : 'absolute inset-x-0 bottom-3.5 z-30 flex justify-center',
    className,
  )}
>
  <Popover.Root bind:open>
    <Popover.Trigger
      disabled={intentDisabled}
      class={cx(
        'inline-flex h-[26px] max-w-[calc(100%_-_0.5rem)] items-center rounded-md px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed',
        toolbar &&
          'gap-2 h-9! max-w-36! rounded-full! border-0! bg-transparent! pl-[18px]! normal-case! tracking-normal! text-xs!',
        toolbar
          ? hasIntentError
            ? 'text-error hover:bg-error/10'
            : 'text-base-content hover:bg-base-200'
          : hasIntentError
            ? 'bg-error text-error-content hover:bg-error'
            : currentIntent === 'canonical'
              ? 'bg-primary text-primary-content hover:bg-primary/85'
              : 'border border-border-input bg-(--theme-panel) text-base-content hover:bg-base-200',
      )}
      aria-label={label ?? m.gallery__change_image_intent()}
      data-tooltip={intentErrorMessage ?? undefined}
    >
      <span class="overflow-hidden text-ellipsis whitespace-nowrap"
        >{intentOptions.find(intent => intent.id === currentIntent)?.label ??
          intentDisplay[currentIntent] ??
          currentIntent}</span
      >
      {#if toolbar && !intentDisabled}
        <ChevronsUpDownIcon class="size-4 shrink-0" />
      {/if}
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        side={contentSide}
        align="center"
        sideOffset={10}
        class={cx(
          'bits-theme z-[200] flex w-40 flex-col gap-1 overflow-hidden rounded-xl border border-border-input bg-(--theme-panel) p-1.5 text-base-content shadow-xl backdrop-blur-sm',
          contentClass,
        )}
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
            <span
              >{intentOptions.find(intent => intent.id === option)?.label ??
                option}</span
            >
          </button>
        {/each}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
