<script lang="ts">
// ICONS
import Facebook from 'virtual:icons/simple-icons/facebook'
import Google from 'virtual:icons/logos/google-icon'
import Wechat from 'virtual:icons/simple-icons/wechat'
// AUTH
import { AUTH_PROVIDER_REGISTRY, type AuthProviderId } from '$lib/auth/providers'
// I18N
import { m } from '$lib/i18n'

let {
  compact = false,
  disabled = false,
  onSelect,
}: {
  compact?: boolean
  disabled?: boolean
  onSelect: (providerId: AuthProviderId) => void
} = $props()

function providerIcon(providerId: AuthProviderId) {
  if (providerId === 'google') return Google
  if (providerId === 'facebook') return Facebook
  return Wechat
}
</script>

{#each AUTH_PROVIDER_REGISTRY.filter(provider => provider.id !== 'email') as provider (provider.id)}
  {@const Icon = providerIcon(provider.id)}
  <button
    class={compact
      ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:border-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40'
      : 'flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white hover:bg-white/90 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/20 disabled:hover:bg-transparent disabled:hover:text-inherit'}
    class:bg-white={!compact && provider.enabled}
    class:text-black={!compact && provider.enabled}
    type="button"
    aria-label={provider.label}
    title={provider.enabled ? provider.label : `${provider.label} · ${m.guest__coming_soon()}`}
    disabled={!provider.enabled || disabled}
    onclick={() => onSelect(provider.id)}
  >
    <Icon class={provider.id === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'} />
    {#if !compact}
      <span>{provider.label}</span>
    {/if}
  </button>
{/each}
