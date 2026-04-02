<script lang="ts">
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature'

const omniCtx = getOmniCtx()
const appCtx = getAppCtx()
</script>

<div
  class="flex select-none flex-col divide-y divide-neutral-800 overscroll-contain bg-neutral-900 caret-transparent"
>
  <button
    type="button"
    onclick={event => initAddNewFeature(appCtx, omniCtx, event)}
    class="btn rounded-t-none bg-transparent p-4 text-center uppercase text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:bg-base-200 active:scale-100 active:bg-base-200/80"
  >
    {m.whole_house_cougar_hurl()}
  </button>
</div>
