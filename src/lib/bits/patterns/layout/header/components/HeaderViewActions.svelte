<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { HeaderViewActionsProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderActionClasses,
  HEADER_BUTTON_LABEL_CLASSES,
  HEADER_VIEW_ACTIONS_CLASSES,
} from './headerPrimitives.styles'

let {
  controlsAction = undefined,
  layoutAction = undefined,
  extraActions = [],
  hideLabel = true,
}: HeaderViewActionsProps = $props()
</script>

<div class={HEADER_VIEW_ACTIONS_CLASSES}>
  {#each extraActions as action (action.text)}
    <Button
      text={action.text}
      attrs={action.attrs}
      class={getHeaderActionClasses(action.class, hideLabel)}
      color={action.color ?? 'neutral'}
      style={action.style ?? 'ghost'}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      iconComponent={action.icon}
      {hideLabel}
      disabled={action.disabled}
      onClick={() => action.onClick?.()}
    />
  {/each}

  {#if controlsAction}
    <Button
      text={controlsAction.text}
      attrs={controlsAction.attrs}
      class={getHeaderActionClasses(controlsAction.class, hideLabel)}
      color={controlsAction.color ?? 'neutral'}
      style={controlsAction.style ?? 'ghost'}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      iconComponent={controlsAction.icon}
      {hideLabel}
      disabled={controlsAction.disabled}
      onClick={() => controlsAction.onClick?.()}
    />
  {/if}

  {#if layoutAction}
    <Button
      text={layoutAction.text}
      attrs={layoutAction.attrs}
      class={getHeaderActionClasses(layoutAction.class, hideLabel)}
      color={layoutAction.color ?? 'neutral'}
      style={layoutAction.style ?? 'ghost'}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      iconComponent={layoutAction.icon}
      {hideLabel}
      disabled={layoutAction.disabled}
      onClick={() => layoutAction.onClick?.()}
    />
  {/if}
</div>
