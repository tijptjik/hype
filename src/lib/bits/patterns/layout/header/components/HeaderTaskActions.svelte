<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
// TYPES
import type { HeaderTaskActionsProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderActionClasses,
  HEADER_BUTTON_LABEL_CLASSES,
  HEADER_TASK_ACTIONS_CLASSES,
} from './headerPrimitives.styles'

let {
  actions = [],
  content = null,
  hideLabel = false,
}: HeaderTaskActionsProps = $props()

function shouldHideActionLabel(alwaysHideLabel?: boolean): boolean {
  return hideLabel || Boolean(alwaysHideLabel)
}

function resolveActionClass(className?: string, alwaysHideLabel?: boolean): string {
  return getHeaderActionClasses(className, shouldHideActionLabel(alwaysHideLabel))
}

function resolveIconClasses(icon?: unknown, iconClass?: string): string {
  return [icon === LoaderCircle ? 'animate-spin' : '', iconClass]
    .filter(Boolean)
    .join(' ')
}
</script>

<div class={HEADER_TASK_ACTIONS_CLASSES}>
  {#if content?.component}
    {@const InlineContent = content.component}
    <div class="mr-2 flex items-center">
      <InlineContent {...(content.props ?? {})} isCompact={hideLabel} />
    </div>
  {/if}

  {#each actions as action (action.text)}
    <Button
      text={action.text}
      attrs={action.attrs}
      color={action.color ?? 'neutral'}
      style={action.style ?? 'ghost'}
      iconComponent={action.icon}
      iconClasses={resolveIconClasses(action.icon, action.iconClass)}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={resolveActionClass(action.class, action.alwaysHideLabel)}
      hideLabel={shouldHideActionLabel(action.alwaysHideLabel)}
      disabled={action.disabled}
      onClick={() => action.onClick?.()}
    />
  {/each}
</div>
