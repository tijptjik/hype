<script lang="ts">
// COMPONENTS
import OptionIcon from './OptionIcon.svelte'
let {
  label,
  value,
  options,
  disabled = false,
  onchange,
}: {
  label: string
  value: string | string[]
  options: { value: string; label: string; icon?: string | null; path?: string }[]
  disabled?: boolean
  onchange: (value: string) => void
} = $props()
// Align the entire group to its longest caption so all three labels share a baseline.
let segmented = $derived(options.length === 2 || options.length === 3)
let inlineAt = $derived(
  options.every(option => option.label.length <= 6)
    ? 'flex-col @min-[19rem]:flex-row'
    : 'flex-col @min-[24rem]:flex-row',
)
</script>
<fieldset {disabled} class="@container grid min-w-0 gap-2">
  <legend
    class="text-muted mb-2 text-[0.8125rem] leading-4 font-semibold tracking-wide"
  >
    {label}
  </legend>
  <div
    class={[
      'grid',
      segmented && 'border-line bg-surface gap-px overflow-hidden rounded-lg border',
      options.length === 3
        ? 'grid-cols-3'
        : options.length === 2
          ? 'grid-cols-2'
          : options.length === 4
            ? 'grid-cols-2 gap-1.5'
            : 'grid-cols-[repeat(auto-fit,minmax(min(100%,6.7rem),1fr))] gap-1.5',
    ]}
  >
    {#each options as option (option.value)}
      {@const selected = Array.isArray(value)
        ? value.includes(option.value)
        : value === option.value}
      <button
        type="button"
        aria-pressed={selected}
        onclick={() => onchange(option.value)}
        class={[
          'flex min-h-11 min-w-0 items-center gap-1.5 px-1.5 py-1.5 text-center text-sm leading-tight font-medium break-words disabled:opacity-50',
          segmented
            ? 'after:bg-line relative justify-center after:absolute after:inset-y-2.5 after:right-0 after:w-px last:after:hidden focus-visible:z-1 focus-visible:-outline-offset-2'
            : 'justify-start rounded-lg border pl-2.5',
          options.length === 3 && (option.icon || option.path) && inlineAt,
          selected
            ? 'border-accent bg-accent text-on-accent'
            : 'border-line bg-surface text-ink',
        ]}
      >
        <OptionIcon id={option.icon} path={option.path} />
        <span class="max-w-full hyphens-auto">{option.label}</span>
      </button>
    {/each}
  </div>
</fieldset>
