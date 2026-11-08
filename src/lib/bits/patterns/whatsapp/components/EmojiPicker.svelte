<script lang="ts">
// BITS COMPONENTS
import Popover from '#lib/bits/core/popover/Popover.svelte'
// ICONS
import SmileIcon from 'virtual:icons/lucide/smile'
// TYPES
interface Props {
  label?: string
  disabled?: boolean
  onSelect: (emoji: string) => void
  removable?: boolean
  iconOnly?: boolean
  open?: boolean
}
let {
  label = 'Emoji',
  disabled = false,
  onSelect,
  removable = false,
  iconOnly = false,
  open = $bindable(false),
}: Props = $props()
const emojis = [
  '😀',
  '😊',
  '😂',
  '🥰',
  '😍',
  '🤔',
  '😢',
  '😮',
  '👍',
  '👎',
  '❤️',
  '🔥',
  '🎉',
  '🙏',
  '👏',
  '👋',
  '✅',
  '💯',
  '✨',
  '🥳',
  '🤝',
  '💜',
  '🍀',
  '🙌',
]
</script>

<Popover
  bind:open
  triggerProps={{
    disabled,
    role: 'button',
    tabindex: disabled ? -1 : 0,
    'aria-disabled': disabled,
    'aria-label': label,
    title: label,
  }}
  triggerClass={`inline-flex cursor-pointer items-center text-sm text-base-content focus-visible:outline-2 focus-visible:outline-focus data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${iconOnly ? 'size-8 justify-center rounded-full hover:bg-raised' : 'gap-2 rounded-lg border border-border bg-surface px-3 py-2'}`}
  contentClass="z-50 w-64 rounded-xl border border-border bg-panel p-3 text-base-content shadow-xl"
  contentProps={{ side: 'top', align: 'start' }}
>
  {#snippet trigger()}
    <SmileIcon class="size-4" aria-hidden="true" />
    {#if !iconOnly}
      <span>{label}</span>
    {/if}
  {/snippet}
  <p class="text-muted-foreground mb-2 text-xs">Choose an emoji</p>
  <div class="grid grid-cols-6 gap-1">
    {#each emojis as emoji}
      <button
        type="button"
        aria-label={emoji}
        class="hover:bg-raised focus-visible:outline-focus rounded-lg p-2 text-xl focus-visible:outline-2"
        onclick={() => {
          onSelect(emoji)
          open = false
        }}
      >
        {emoji}
      </button>
    {/each}
  </div>
  {#if removable}
    <button
      type="button"
      class="bg-surface hover:bg-raised mt-2 w-full rounded-lg p-2 text-sm"
      onclick={() => {
        onSelect('')
        open = false
      }}
    >
      Remove my reaction
    </button>
  {/if}
</Popover>
