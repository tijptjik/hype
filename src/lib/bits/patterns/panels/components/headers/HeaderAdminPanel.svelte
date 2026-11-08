<script lang="ts">
// BITS
import { Button } from '#lib/bits/core/index.js'
// ICONS
import Bolt from 'virtual:icons/proicons/bolt'
import Menu from 'virtual:icons/proicons/menu'

type Props = {
  title: string
  isNarrow: boolean
  onTogglePanel: () => void
}

let { title, isNarrow, onTogglePanel }: Props = $props()
</script>

<div
  class="bits-theme bg-panel flex h-18 shrink-0 flex-row items-center justify-between p-4"
>
  {#if !isNarrow}
    <h1 class="pl-2 text-lg font-semibold text-white uppercase">{title}</h1>
    <div class="flex gap-2">
      <Button
        text="Toggle admin panel"
        size="lg"
        color="light"
        iconComponent={Menu}
        iconClasses="h-6 w-6 hover:text-white"
        onClick={onTogglePanel}
        style="ghost"
        modifier="circle"
        class="m-0"
      />
    </div>
  {:else}
    <Button
      text={title}
      size="lg"
      iconComponent={Bolt}
      iconClasses="h-8 w-8 text-[oklch(var(--color-primary)_80%_1_1)]"
      onClick={onTogglePanel}
      style="transparent"
      hideLabel={true}
      class="bits-panel-header-admin__narrow-trigger"
    />
  {/if}
</div>
