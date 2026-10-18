<script lang="ts">
let {
  label,
  onRemove,
  removeLabel,
  tone = 'primary',
}: {
  label: string
  onRemove: () => void
  removeLabel?: string
  tone?: 'primary' | 'secondary' | 'tertiary'
} = $props()

const color = $derived(
  tone === 'primary'
    ? 'bg-primary/15 text-primary'
    : tone === 'secondary'
      ? 'bg-secondary/15 text-secondary'
      : 'bg-tertiary/15 text-tertiary',
)
</script>

<button
  type="button"
  class="rounded-full px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus {color}"
  aria-label={removeLabel}
  title={removeLabel}
  onclick={onRemove}
>
  {label} <span aria-hidden="true">×</span>
</button>
