<script lang="ts">
import { fly } from 'svelte/transition'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Plus from 'virtual:icons/lucide/plus'
// TYPES
import type { HeaderNewProps } from './headerPrimitives.types'
// STYLES
import {
  getHeaderActionClasses,
  HEADER_BUTTON_LABEL_CLASSES,
  HEADER_NEW_BUTTON_CLASSES,
} from './headerPrimitives.styles'

let {
  isCreatable = false,
  label = 'New',
  hideLabel = false,
  onCreate,
}: HeaderNewProps = $props()
</script>

{#snippet iconSnippet()}
  <Plus />
{/snippet}

{#if isCreatable}
  <div
    in:fly={{ x: 12, delay: 180, duration: 180, opacity: 0.15 }}
    out:fly={{ x: -12, duration: 180, opacity: 0.15 }}
  >
    <Button
      text={label}
      color="neutral"
      style="ghost"
      icon={iconSnippet}
      labelClasses={HEADER_BUTTON_LABEL_CLASSES}
      class={getHeaderActionClasses(HEADER_NEW_BUTTON_CLASSES, hideLabel)}
      {hideLabel}
      onClick={() => onCreate?.()}
    />
  </div>
{/if}
