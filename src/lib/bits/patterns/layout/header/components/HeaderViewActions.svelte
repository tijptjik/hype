<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { HeaderViewActionsProps } from './headerPrimitives.types'

let {
  controlsAction = undefined,
  layoutAction = undefined,
  hideLabel = true,
}: HeaderViewActionsProps = $props()
</script>

<div class="bits-pattern-header__view-actions">
  {#if controlsAction}
    <Button
      text={controlsAction.text}
      class={controlsAction.class}
      color={controlsAction.color ?? 'neutral'}
      style={controlsAction.style ?? 'ghost'}
      iconComponent={controlsAction.icon}
      {hideLabel}
      disabled={controlsAction.disabled}
      onClick={() => controlsAction.onClick?.()}
    />
  {/if}

  {#if layoutAction}
    <Button
      text={layoutAction.text}
      class={layoutAction.class}
      color={layoutAction.color ?? 'neutral'}
      style={layoutAction.style ?? 'ghost'}
      iconComponent={layoutAction.icon}
      {hideLabel}
      disabled={layoutAction.disabled}
      onClick={() => layoutAction.onClick?.()}
    />
  {/if}
</div>
