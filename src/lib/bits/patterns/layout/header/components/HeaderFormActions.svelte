<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { HeaderFormActionsProps } from './headerPrimitives.types'

let {
  primaryAction = null,
  saveAction = null,
  deleteAction = null,
  publishAction = null,
  hideLabel = false,
}: HeaderFormActionsProps = $props()

function resolveActionClass(className?: string): string {
  if (hideLabel) return ''
  return className ?? ''
}
</script>

<div class="bits-pattern-header__form-actions">
  {#if deleteAction}
    <Button
      text={deleteAction.text}
      color={deleteAction.color ?? 'warning'}
      style={deleteAction.style ?? 'ghost'}
      iconComponent={deleteAction.icon}
      class={resolveActionClass(deleteAction.class)}
      {hideLabel}
      disabled={deleteAction.disabled}
      onClick={() => deleteAction.onClick?.()}
    />
  {:else if primaryAction}
    <Button
      text={primaryAction.text}
      color={primaryAction.color ?? 'neutral'}
      style={primaryAction.style ?? 'ghost'}
      iconComponent={primaryAction.icon}
      class={resolveActionClass(primaryAction.class)}
      {hideLabel}
      disabled={primaryAction.disabled}
      onClick={() => primaryAction.onClick?.()}
    />
  {/if}

  {#if saveAction}
    <Button
      text={saveAction.text}
      color={saveAction.color ?? 'success'}
      style={saveAction.style ?? 'ghost'}
      iconComponent={saveAction.icon}
      class={resolveActionClass(saveAction.class)}
      {hideLabel}
      disabled={saveAction.disabled}
      onClick={() => saveAction.onClick?.()}
    />
  {:else if publishAction}
    {#if publishAction.kind === 'button'}
      <Button
        text={publishAction.text}
        color={publishAction.color ?? 'success'}
        style={publishAction.style ?? 'ghost'}
        iconComponent={publishAction.icon}
        class={resolveActionClass(publishAction.class)}
        {hideLabel}
        disabled={publishAction.disabled}
        onClick={() => publishAction.onClick?.()}
      />
    {:else}
      <div
        class={[
          'bits-pattern-header__publish-status',
          resolveActionClass(publishAction.class),
        ]
          .filter(Boolean)
          .join(' ')}
        aria-live={publishAction.ariaLive ?? 'polite'}
      >
        {#if publishAction.icon}
          {@const PublishStatusIcon = publishAction.icon}
          <span class="bits-pattern-header__publish-status-icon" aria-hidden="true">
            <PublishStatusIcon />
          </span>
        {/if}
        {#if !hideLabel}
          <span class="bits-pattern-header__publish-status-label"
            >{publishAction.text}</span
          >
        {/if}
      </div>
    {/if}
  {/if}
</div>
