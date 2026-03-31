<script lang="ts">
// BITS
import { Button } from '$lib/bits/core'
// ICONS
import Bolt from 'virtual:icons/lucide/zap'
import Menu from 'virtual:icons/lucide/menu'

type Props = {
  title: string
  isNarrow: boolean
  onTogglePanel: () => void
}

let { title, isNarrow, onTogglePanel }: Props = $props()
</script>

<div class="bits-theme bits-panel-header-admin">
  {#if !isNarrow}
    <h1 class="bits-panel-header-admin__title">{title}</h1>
    <div class="bits-panel-header-admin__actions">
      <Button
        text="Toggle admin panel"
        size="lg"
        color="light"
        iconComponent={Menu}
        iconClasses="h-6 w-6 hover:text-white"
        onClick={onTogglePanel}
        style="ghost"
        modifier="circle"
        class="bits-panel-header-admin__button"
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
