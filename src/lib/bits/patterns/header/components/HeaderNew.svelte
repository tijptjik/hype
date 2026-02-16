<script lang="ts">
import { fly } from 'svelte/transition'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Plus from 'virtual:icons/lucide/plus'
// TYPES
import type { HeaderNewProps } from './headerPrimitives.types'

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
      {hideLabel}
      onClick={() => onCreate?.()}
    />
  </div>
{/if}
