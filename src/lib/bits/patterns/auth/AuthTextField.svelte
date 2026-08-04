<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements'

let {
  label,
  value = $bindable(''),
  type = 'text',
  autocomplete,
  required = false,
  minlength,
  maxlength,
}: {
  label: string
  value?: string
  type?: string
  autocomplete?: HTMLInputAttributes['autocomplete']
  required?: boolean
  minlength?: number
  maxlength?: number
} = $props()
</script>

<label class="flex flex-col gap-1.5 text-sm">
  <span>{label}</span>
  <input
    class="rounded-lg border border-white/20 bg-white/8 px-3 py-2 text-white"
    {type}
    {autocomplete}
    {required}
    {minlength}
    {maxlength}
    bind:value
  >
</label>
