<script lang="ts">
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// BITS
import { cx } from '#lib/bits/utils.js'
// ICONS
import LoaderCircle from 'virtual:icons/proicons/spinner'
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderActionClasses,
  HEADER_BUTTON_LABEL_CLASSES,
  HEADER_EDIT_ACTION_CLASSES,
  HEADER_PRIMARY_ACTION_CLASSES,
  HEADER_FORM_ACTIONS_CLASSES,
  HEADER_PUBLISH_STATUS_CLASSES,
  HEADER_PUBLISH_STATUS_LABEL_CLASSES,
} from './headerPrimitives.styles'

let {
  primaryAction = null,
  saveAction = null,
  deleteAction = null,
  publishAction = null,
  hideLabel = false,
}: HeaderFormActionsProps = $props()

function resolveActionClass(className?: string): string {
  return getHeaderActionClasses(className, hideLabel)
}

function resolveIconClasses(icon?: unknown): string {
  return icon === LoaderCircle ? 'animate-spin' : ''
}
</script>

<div class={HEADER_FORM_ACTIONS_CLASSES}>
  {#if deleteAction}
    <Button
      size="sm"
      text={deleteAction.text}
      color={deleteAction.color ?? 'warning'}
      style={deleteAction.style ?? 'ghost'}
      iconComponent={deleteAction.icon}
      iconClasses={resolveIconClasses(deleteAction.icon)}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={resolveActionClass(deleteAction.class)}
      {hideLabel}
      hideLabelInstantly
      disabled={deleteAction.disabled}
      onClick={() => deleteAction.onClick?.()}
    />
  {:else if primaryAction}
    <Button
      size="sm"
      text={primaryAction.text}
      color={primaryAction.color ?? 'neutral'}
      style={primaryAction.style ?? 'ghost'}
      iconComponent={primaryAction.icon}
      iconClasses={resolveIconClasses(primaryAction.icon)}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={cx(
        resolveActionClass(primaryAction.class),
        primaryAction.style === 'soft' && HEADER_EDIT_ACTION_CLASSES,
      )}
      {hideLabel}
      hideLabelInstantly
      disabled={primaryAction.disabled}
      onClick={() => primaryAction.onClick?.()}
    />
  {/if}

  {#if saveAction}
    <Button
      size="sm"
      text={saveAction.text}
      color={saveAction.color ?? 'success'}
      style={saveAction.style ?? 'ghost'}
      iconComponent={saveAction.icon}
      iconClasses={resolveIconClasses(saveAction.icon)}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={cx(
        resolveActionClass(saveAction.class),
        saveAction.color === 'primary' && HEADER_PRIMARY_ACTION_CLASSES,
      )}
      {hideLabel}
      hideLabelInstantly
      disabled={saveAction.disabled}
      onClick={() => saveAction.onClick?.()}
    />
  {:else if publishAction}
    {#if publishAction.kind === 'button'}
      <Button
        size="sm"
        text={publishAction.text}
        color={publishAction.color ?? 'success'}
        style={publishAction.style ?? 'ghost'}
        iconComponent={publishAction.icon}
        iconClasses={resolveIconClasses(publishAction.icon)}
        labelClasses={HEADER_BUTTON_LABEL_CLASSES}
        class={cx(
          resolveActionClass(publishAction.class),
          publishAction.color === 'primary' && HEADER_PRIMARY_ACTION_CLASSES,
        )}
        {hideLabel}
        hideLabelInstantly
        disabled={publishAction.disabled}
        onClick={() => publishAction.onClick?.()}
      />
    {:else}
      <div
        class={cx(
          HEADER_PUBLISH_STATUS_CLASSES,
          resolveActionClass(publishAction.class),
        )}
        aria-live={publishAction.ariaLive ?? 'polite'}
      >
        {#if publishAction.icon}
          {@const PublishStatusIcon = publishAction.icon}
          <span
            class={cx('shrink-0', resolveIconClasses(publishAction.icon))}
            aria-hidden="true"
          >
            <PublishStatusIcon />
          </span>
        {/if}
        {#if !hideLabel}
          <span class={HEADER_PUBLISH_STATUS_LABEL_CLASSES}>{publishAction.text}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
