<script lang="ts">
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'

type Props = {
  hideActions?: boolean
  openProfileText?: string
  logoutText?: string
  onOpenProfile?: () => void
  onLogout?: () => void | Promise<void>
}

let {
  hideActions = false,
  openProfileText = '',
  logoutText = '',
  onOpenProfile,
  onLogout,
}: Props = $props()

function handleOpenProfile(): void {
  onOpenProfile?.()
}

function handleLogout(): void {
  void onLogout?.()
}
</script>

{#if !hideActions}
  <div class="z-10 flex flex-row items-center gap-2">
    <Button
      text={openProfileText}
      size="sm"
      class="uppercase"
      onClick={handleOpenProfile}
    />
    <Button text={logoutText} size="sm" class="uppercase" onClick={handleLogout} />
  </div>
{/if}
