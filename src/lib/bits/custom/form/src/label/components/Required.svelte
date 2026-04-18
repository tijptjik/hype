<script lang="ts">
import { fade } from 'svelte/transition'
import type { FormLabelRequiredProps } from '../types'

let {
  required = false,
  isEditing = true,
  requiredSymbol = '*',
  class: className = '',
}: FormLabelRequiredProps = $props()
</script>

{#if required}
  <span class="bits-form__label-required-slot" aria-hidden={!isEditing}>
    {#if isEditing}
      <span
        class={`bits-form__label-required bits-form__label-required-floating ${className}`}
        in:fade={{ duration: 160 }}
        out:fade={{ duration: 130 }}
      >
        {requiredSymbol}
      </span>
    {/if}
  </span>
{/if}
