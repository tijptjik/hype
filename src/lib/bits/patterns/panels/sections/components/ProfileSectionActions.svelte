<script lang="ts">
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'

type Props = {
  isGuest?: boolean
  hideActions?: boolean
  openProfileText?: string
  logoutText?: string
  upgradeText?: string
  onOpenProfile?: () => void
  onLogout?: () => void | Promise<void>
  onUpgrade?: () => void
}

let {
  isGuest = false,
  hideActions = false,
  openProfileText = '',
  logoutText = '',
  upgradeText = '',
  onOpenProfile,
  onLogout,
  onUpgrade,
}: Props = $props()

function handleOpenProfile(): void {
  onOpenProfile?.()
}

function handleLogout(): void {
  void onLogout?.()
}

function handleUpgrade(): void {
  onUpgrade?.()
}
</script>

{#if isGuest}
  <div class="z-10">
    <Button
      text={upgradeText}
      color="primary"
      size="sm"
      class="min-w-43 uppercase shadow-[0_0_22px_rgb(240_77_127_/_0.35)]"
      onClick={handleUpgrade}
    />
  </div>
{:else if !hideActions}
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
