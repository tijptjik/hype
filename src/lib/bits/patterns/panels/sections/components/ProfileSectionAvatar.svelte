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
    class={`flex h-32 w-32 items-center justify-center overflow-hidden rounded-full ring-4 ring-black/40 ${
      isGuest ? 'bg-black/70 shadow-[0_0_30px_6px_rgb(240_77_127_/_0.32)]' : 'bg-base-300'
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
