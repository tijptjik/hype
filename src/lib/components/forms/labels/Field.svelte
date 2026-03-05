<script lang="ts">
import { fade } from 'svelte/transition'
import type { Field } from '$lib/types'

type Props = {
  field: Field
  fieldRoot: string
  fieldIndex: number
  fieldKey: string
  constraints: Record<string, any>
  isEditing?: boolean
}

let {
  field,
  fieldRoot,
  fieldIndex,
  fieldKey,
  constraints,
  isEditing = true,
}: Props = $props()

const isRequired = $derived(
  field.isNested
    ? Boolean($constraints?.[fieldRoot]?.[fieldIndex]?.[fieldKey]?.required)
    : Boolean($constraints?.[fieldRoot]?.required),
)
</script>

<div class="label {!field.label ? 'hidden' : ''}">
  <span class="label-text text-sm font-bold">{field.label}</span>
  <span
    class="label-text-alt text-xs font-bold relative inline-flex h-[1em] w-3 justify-start"
    aria-hidden={!isRequired || !isEditing}
  >
    {#if isRequired && isEditing}
      <span
        class="absolute inset-0 inline-flex items-start justify-start"
        in:fade={{ duration: 160 }}
        out:fade={{ duration: 130 }}
      >
        *
      </span>
    {/if}
  </span>
</div>
