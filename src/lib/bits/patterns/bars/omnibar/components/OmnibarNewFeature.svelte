<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { OmnibarNewFeatureProps } from './omnibarPrimitives.types'

let { onCreateFeature }: OmnibarNewFeatureProps = $props()
</script>

<div
  class="flex select-none flex-col divide-y divide-border overscroll-contain bg-panel caret-transparent"
>
  <button
    type="button"
    onclick={onCreateFeature}
    class="btn rounded-t-none bg-transparent p-4 text-center uppercase text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:bg-base-200 active:scale-100 active:bg-base-200/80"
  >
    {m.whole_house_cougar_hurl()}
  </button>
</div>
