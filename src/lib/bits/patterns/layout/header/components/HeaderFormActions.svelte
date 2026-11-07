<script lang="ts">
// SVELTE
import { fly } from 'svelte/transition'
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
  featuresAction = null,
  usersAction = null,
  shareAction = null,
  saveAction = null,
  deleteAction = null,
  publishAction = null,
  publishPrompt = null,
  previewAction = null,
  hideLabel = false,
}: HeaderFormActionsProps = $props()

function resolveActionClass(className?: string): string {
  return getHeaderActionClasses(className, hideLabel)
}

function resolveIconClasses(icon?: unknown): string {
  return icon === LoaderCircle ? 'animate-spin' : ''
}
</script>

<div class={cx(HEADER_FORM_ACTIONS_CLASSES, 'relative')}>
  {#if featuresAction}
    <Button
      size="sm"
      text={featuresAction.text}
      color={featuresAction.color ?? 'neutral'}
      style={featuresAction.style ?? 'outline'}
      iconComponent={featuresAction.icon}
      class={resolveActionClass(featuresAction.class)}
      hideLabel
      hideLabelInstantly
      disabled={featuresAction.disabled}
      onClick={() => featuresAction.onClick?.()}
    />
  {/if}

  {#if usersAction}
    <Button
      size="sm"
      text={usersAction.text}
      color={usersAction.color ?? 'neutral'}
      style={usersAction.style ?? 'outline'}
      iconComponent={usersAction.icon}
      class={resolveActionClass(usersAction.class)}
      hideLabel
      hideLabelInstantly
      disabled={usersAction.disabled}
      onClick={() => usersAction.onClick?.()}
    />
  {/if}

  {#if shareAction}
    <Button
      size="sm"
      text={shareAction?.text ?? ''}
      attrs={shareAction?.attrs}
      color={shareAction?.color ?? 'neutral'}
      style={shareAction?.style ?? 'outline'}
      iconComponent={shareAction?.icon}
      class={resolveActionClass(shareAction?.class)}
      hideLabel
      hideLabelInstantly
      disabled={shareAction?.disabled ?? !shareAction}
      onClick={() => shareAction?.onClick?.()}
    />
  {/if}

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
  {/if}
  {#if publishAction}
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
  {#if previewAction}
    <Button
      size="sm"
      text={previewAction.text}
      color={previewAction.color ?? 'neutral'}
      style={previewAction.style ?? 'outline'}
      iconComponent={previewAction.icon}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={resolveActionClass(previewAction.class)}
      {hideLabel}
      hideLabelInstantly
      disabled={previewAction.disabled}
      onClick={() => previewAction.onClick?.()}
    />
  {/if}

  {#if publishPrompt}
    <div
      class="border-border/60 bg-panel absolute top-[calc(100%+0.75rem)] right-0 z-50 flex w-[min(22rem,calc(100vw-3rem))] items-center gap-4 rounded-md border px-4 py-2 shadow-[var(--shadow-mini)]"
      in:fly={{ y: -8, duration: 180, opacity: 0 }}
      out:fly={{ y: -8, duration: 140, opacity: 0 }}
      role="status"
    >
      <span class="text-foreground min-w-0 text-sm font-medium"
        >{publishPrompt.text}</span
      >
      <Button
        text={publishPrompt.actionText}
        color="primary"
        size="sm"
        class="h-9 shrink-0 rounded-md px-4 text-sm font-medium shadow-none"
        onClick={publishPrompt.onClick}
      />
    </div>
  {/if}
</div>
