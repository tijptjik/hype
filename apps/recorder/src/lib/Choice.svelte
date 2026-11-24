<script lang="ts">
let {
  label,
  value,
  options,
  disabled = false,
  onchange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onchange: (value: string) => void
} = $props()
</script>
<fieldset {disabled} class="grid gap-2">
  <legend class="text-muted mb-2 text-sm">{label}</legend>
  <div class="flex flex-wrap gap-2">
    {#each options as option (option.value)}
      <button
        type="button"
        aria-pressed={value === option.value}
        onclick={() => onchange(option.value)}
        class={[
          'min-h-12 flex-1 rounded-xl border px-4 py-3 font-medium disabled:opacity-50',
          value === option.value
            ? 'border-accent bg-accent text-on-accent'
            : 'border-line bg-surface text-ink',
        ]}
      >
        {option.label}
      </button>
    {/each}
  </div>
</fieldset>
