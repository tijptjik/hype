<script lang="ts">
// ICONS
import UserRound from 'virtual:icons/proicons/person'

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
    class={`ring-panel flex items-center justify-center overflow-hidden rounded-full ring-4 ${
      isGuest ? 'bg-panel/70 h-32 w-32 shadow-md' : 'bg-surface h-32 w-32'
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
