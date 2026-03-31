<script lang="ts">
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import XCircle from 'virtual:icons/lucide/circle-x'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES

let { panelType, title, onToggleInfo } = $props<{
  panelType: Panel
  title: string
  onToggleInfo?: (e: MouseEvent | TouchEvent) => void
}>()

const appCtx = getAppCtx()
</script>

<header
  class="sticky top-0 z-30 flex h-18.75 shrink-0 select-none flex-row items-center justify-between border-b-3 border-base-300 bg-black px-4 py-2 caret-transparent focus:outline-none"
>
  <div class="flex flex-row items-center gap-2">
    <h2 class="text-lg font-semibold uppercase tracking-widest text-primary">
      {title}
    </h2>
  </div>
  <div class="flex flex-row items-center gap-4">
    {#if onToggleInfo}
      <Button
        text="?"
        style="transparent"
        class="m-0 h-auto flex-none border-transparent p-0 text-base-50 shadow-none [--btn-size:auto] [--btn-padding-x:0]"
        labelClasses="text-2xl"
        onClick={onToggleInfo}
      />
    {/if}
    <Button
      text="Close panel"
      iconComponent={XCircle}
      size="xl"
      hideLabel={true}
      style="transparent"
      class="m-0 h-auto flex-none border-transparent p-0 shadow-none [--btn-size:auto] [--btn-padding-x:0]"
      onClick={() => {
        appCtx.closePanel(panelType)
      }}
    />
  </div>
</header>
