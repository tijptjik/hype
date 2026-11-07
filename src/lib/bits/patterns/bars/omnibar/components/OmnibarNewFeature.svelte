<script lang="ts">
// ICONS
import Add from 'virtual:icons/proicons/add'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { OmnibarNewFeatureProps } from './omnibarPrimitives.types'

let { onCreateFeature }: OmnibarNewFeatureProps = $props()
</script>

<div
  class="divide-border bg-panel flex flex-col divide-y overscroll-contain caret-transparent select-none"
>
  <button
    type="button"
    onclick={onCreateFeature}
    class="btn bg-primary/15 text-primary hover:bg-primary/25 focus-visible:ring-primary active:bg-primary/30 dark:bg-base-content/5 dark:text-base-content dark:hover:bg-base-content/10 dark:active:bg-base-content/15 flex items-center justify-center gap-2 rounded-t-none p-4 text-center font-semibold uppercase shadow-[inset_0_1px_0_0_var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset active:scale-100 dark:shadow-[inset_0_1px_0_0_var(--color-border)]"
  >
    <Add class="text-primary size-5 shrink-0" aria-hidden="true" />
    {m.whole_house_cougar_hurl()}
  </button>
</div>
