<script lang="ts">
// SVELTE
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
    class="rounded-lg border border-border bg-foreground/5 px-3 py-2 text-foreground"
    {type}
    {autocomplete}
    {required}
    {minlength}
    {maxlength}
    bind:value
  >
</label>
