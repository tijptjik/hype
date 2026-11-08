<script lang="ts">
// ICONS
import WhatsAppIcon from 'virtual:icons/simple-icons/whatsapp'
import TelegramIcon from 'virtual:icons/simple-icons/telegram'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let {
  platform,
  connected,
  status,
  size = 'sm',
}: {
  platform: MessagingPlatform | null
  connected?: boolean
  status?: string
  size?: 'sm' | 'md'
} = $props()
const label = $derived(platform === 'telegram' ? 'Telegram' : 'WhatsApp')
const description = $derived(status ? `${label} · ${status}` : label)
const color = $derived(
  connected === undefined
    ? 'text-muted-foreground'
    : platform === 'telegram'
      ? 'text-[#229ed9]'
      : 'text-[#25d366]',
)
</script>

{#if platform}
  <span
    role="img"
    aria-label={description}
    title={description}
    class={`inline-flex shrink-0 items-center justify-center ${color} ${connected === false ? 'opacity-45 grayscale' : ''}`}
  >
    {#if platform === 'telegram'}
      <TelegramIcon class={size === 'md' ? 'size-5' : 'size-4'} aria-hidden="true" />
    {:else}
      <WhatsAppIcon class={size === 'md' ? 'size-5' : 'size-4'} aria-hidden="true" />
    {/if}
  </span>
{/if}
