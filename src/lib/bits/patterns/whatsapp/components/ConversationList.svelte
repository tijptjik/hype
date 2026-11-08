<script lang="ts">
// BITS COMPONENTS
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
// TYPES
import type { Conversation } from '../whatsapp.types.js'
let {
  conversations,
  selected,
  onSelect,
  viewId = 'whatsapp',
  platformLabel = 'WhatsApp',
}: {
  viewId?: string
  platformLabel?: string
  conversations: Conversation[]
  selected: string
  onSelect: (chat: string) => void
} = $props()
let search = $state('')
const filtered = $derived(
  conversations.filter(chat =>
    `${chat.name} ${chat.username || ''} ${chat.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  ),
)
</script>

<nav aria-label={`${platformLabel} conversations`} class="flex min-w-0 flex-col gap-3">
  <TextInputField
    id={`${viewId}-search`}
    label="Search conversations"
    bind:value={search}
    placeholder="Name or number"
  />
  <div
    class="flex max-h-60 flex-col gap-1 overflow-y-auto overscroll-contain md:max-h-[65vh]"
  >
    {#each filtered as chat (chat.id)}
      <button
        type="button"
        aria-current={chat.id === selected ? 'true' : undefined}
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-focus {chat.id ===
        selected
          ? 'border-primary bg-raised'
          : 'border-transparent hover:bg-surface'}"
        onclick={() => onSelect(chat.id)}
      >
        <Avatar name={chat.name} src={chat.photo} />
        <span class="grid min-w-0 gap-1">
          <span
            class="text-sm font-semibold [overflow-wrap:anywhere] break-words whitespace-normal"
            >{chat.name}</span
          >
          {#if chat.username}
            <span class="text-muted-foreground text-xs break-words"
              >@{chat.username.replace(/^@/, '')}</span
            >
          {/if}
          <span
            class="text-muted-foreground line-clamp-2 text-xs [overflow-wrap:anywhere] break-words"
            >{chat.preview}</span
          >
        </span>
      </button>
    {:else}
      <p class="text-muted-foreground p-3 text-sm">
        {search
          ? 'No matching conversations.'
          : 'Conversations appear when this device receives messages.'}
      </p>
    {/each}
  </div>
</nav>
