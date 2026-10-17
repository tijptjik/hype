<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
// COMPONENTS
import { Icon } from '#lib/bits/index.js'
import XCircle from 'virtual:icons/proicons/cancel-circle'
// CONTEXT
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES

let {
  panelType,
  title,
  onToggleInfo,
  onClose,
  isAdmin = false,
}: {
  isAdmin?: boolean
  onClose: () => void
  panelType: Panel
  title: string
  onToggleInfo?: (e: MouseEvent | TouchEvent) => void
} = $props()
</script>

<header
  class="sticky top-0 z-30 flex h-[calc(4.5rem+1px)] shrink-0 select-none flex-row items-center justify-between border-b border-border bg-panel px-6 py-2 caret-transparent focus:outline-none"
  style:box-shadow="var(--shadow-lg)"
>
  <div class="flex flex-row items-center gap-2">
    <h2 class="text-sm font-medium uppercase tracking-[0.1em] text-base-content">
      {title}
    </h2>
  </div>
  <div class="flex flex-row items-center gap-4">
    {#if onToggleInfo}
      <Button
        text="?"
        style="transparent"
        class="m-0 h-auto flex-none border-transparent p-0 text-base-content shadow-none [--btn-size:auto] [--btn-padding-x:0]"
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
        onClose()
      }}
    />
  </div>
</header>
