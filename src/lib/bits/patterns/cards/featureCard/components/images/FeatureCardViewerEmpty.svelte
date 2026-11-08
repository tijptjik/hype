<script lang="ts">
// CONTEXT
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// AUTH
import { hasDurableAccount, requestAccountUpgrade } from '#lib/auth/upgrade.js'
// ENUMS
import { FeatureCardMode } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import CameraIcon from 'virtual:icons/proicons/camera'

const cardCtx = getCardCtx()
const appCtx = getSurfaceCtx()

function handleAddPhoto(): void {
  const user = appCtx.account.user
  if (!hasDurableAccount(user)) {
    requestAccountUpgrade('contribution', window.location.href)
    return
  }
  cardCtx.setMode(FeatureCardMode.AddPhoto)
}
</script>

<div
  class="border-border-input bg-base-200 text-base-content flex h-full w-full flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-dashed px-6 text-center"
>
  <div class="space-y-2">
    <p class="text-muted-foreground font-mono text-[11px] tracking-[0.32em] uppercase">
      Missing Image
    </p>
    <h3 class="text-base-content text-2xl font-semibold tracking-[-0.03em]">
      Add yours?
    </h3>
  </div>

  <button
    type="button"
    class="border-border-input bg-base-content/8 text-base-content inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-sm"
    onclick={handleAddPhoto}
  >
    <CameraIcon class="h-4 w-4" />
    {m.honest_fluffy_falcon_enjoy()}
  </button>
</div>
