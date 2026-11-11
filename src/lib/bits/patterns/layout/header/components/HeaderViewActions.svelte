<script lang="ts">
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
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
  content = null,
  trailingContent = null,
  hideLabel = true,
}: HeaderViewActionsProps = $props()

// Preserve the previous footprint while the next control set is measured.
let contentWidth = $state<number | undefined>(undefined)
</script>

<div
  class="shrink-0 overflow-clip transition-[width] duration-180 ease-out motion-reduce:transition-none"
  data-header-view-actions
  style:width={contentWidth ? `${contentWidth}px` : undefined}
>
  <div class={`${HEADER_VIEW_ACTIONS_CLASSES} w-max`} bind:clientWidth={contentWidth}>
    {#if content?.component}
      {@const InlineContent = content.component}
      <div class="mr-2 flex items-center">
        <InlineContent {...content.props ?? {}} />
      </div>
    {/if}

    {#each extraActions as action (action.id ?? action.text)}
      <Button
        text={action.text}
        attrs={action.attrs}
        class={getHeaderActionClasses(
          action.class,
          hideLabel || action.alwaysHideLabel,
        )}
        color={action.color ?? 'neutral'}
        style={action.style ?? 'ghost'}
        labelClasses={HEADER_BUTTON_LABEL_CLASSES}
        iconComponent={action.icon}
        iconClasses={action.iconClass}
        hideLabel={hideLabel || action.alwaysHideLabel}
        hideLabelInstantly={action.hideLabelInstantly ?? action.alwaysHideLabel}
        disabled={action.disabled}
        onClick={() => action.onClick?.()}
      />
    {/each}

    <!-- Action props can clear while the parent header finishes its cross-fade. -->
    {#if controlsAction}
      <Button
        text={controlsAction?.text}
        attrs={controlsAction?.attrs}
        class={getHeaderActionClasses(
          controlsAction?.class,
          hideLabel || controlsAction?.alwaysHideLabel,
        )}
        color={controlsAction?.color ?? 'neutral'}
        style={controlsAction?.style ?? 'ghost'}
        labelClasses={HEADER_BUTTON_LABEL_CLASSES}
        iconComponent={controlsAction?.icon}
        hideLabel={hideLabel || controlsAction?.alwaysHideLabel}
        hideLabelInstantly={controlsAction?.hideLabelInstantly ??
          controlsAction?.alwaysHideLabel}
        disabled={controlsAction?.disabled}
        onClick={() => controlsAction?.onClick?.()}
      />
    {/if}

    {#if layoutAction}
      <Button
        text={layoutAction?.text}
        attrs={layoutAction?.attrs}
        class={getHeaderActionClasses(
          layoutAction?.class,
          hideLabel || layoutAction?.alwaysHideLabel,
        )}
        color={layoutAction?.color ?? 'neutral'}
        style={layoutAction?.style ?? 'ghost'}
        labelClasses={HEADER_BUTTON_LABEL_CLASSES}
        iconComponent={layoutAction?.icon}
        hideLabel={hideLabel || layoutAction?.alwaysHideLabel}
        hideLabelInstantly={layoutAction?.hideLabelInstantly ??
          layoutAction?.alwaysHideLabel}
        disabled={layoutAction?.disabled}
        onClick={() => layoutAction?.onClick?.()}
      />
    {/if}
    {#if trailingContent?.component}
      {@const TrailingContent = trailingContent.component}
      <TrailingContent {...trailingContent.props ?? {}} />
    {/if}
  </div>
</div>
