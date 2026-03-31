<script lang="ts">
let { avatarSrc = null }: { avatarSrc?: string | null } = $props()
</script>

<div class="relative z-10">
  <div class="w-32 overflow-hidden rounded-full ring ring-black/40">
    <img
      alt="Avatar"
      src={avatarSrc ?? ''}
      class="block h-full w-full object-cover"
      referrerpolicy="no-referrer"
    >
  </div>
</div>
