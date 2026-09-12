<script lang="ts">
// ICONS
import UserRound from 'virtual:icons/lucide/user-round'

let {
  avatarSrc = null,
  isGuest = false,
}: {
  avatarSrc?: string | null
  isGuest?: boolean
} = $props()
</script>

<div class="relative z-10">
  <div
    class={`flex h-32 w-32 items-center justify-center overflow-hidden rounded-full ring-4 ring-black/20 ${
      isGuest ? 'bg-panel/70 shadow-md' : 'bg-base-300'
    }`}
  >
    {#if avatarSrc}
      <img
        alt="Avatar"
        src={avatarSrc}
        class="block h-full w-full object-cover"
        referrerpolicy="no-referrer"
      >
    {:else}
      <UserRound
        class={`h-15 w-15 ${isGuest ? 'text-primary' : 'text-base-content/45'}`}
        aria-label="Default avatar"
      />
    {/if}
  </div>
</div>
