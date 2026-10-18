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
  class="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-dashed border-border-input bg-base-200 px-6 text-center text-base-content"
>
  <div class="space-y-2">
    <p class="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
      Missing Image
    </p>
    <h3 class="text-2xl font-semibold tracking-[-0.03em] text-base-content">
      Add yours?
    </h3>
  </div>

  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-full border border-border-input bg-base-content/8 px-4 py-2 text-sm font-medium text-base-content backdrop-blur-sm"
    onclick={handleAddPhoto}
  >
    <CameraIcon class="h-4 w-4" />
    {m.honest_fluffy_falcon_enjoy()}
  </button>
</div>
