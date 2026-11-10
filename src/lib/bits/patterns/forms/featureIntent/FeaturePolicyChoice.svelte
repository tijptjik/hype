<script lang="ts">
// COMPONENTS
import { SimpleTooltip } from '#lib/bits/core/index.js'
import InfoIcon from 'virtual:icons/lucide/info'
import FeaturePolicyIllustration from './FeaturePolicyIllustration.svelte'
let {
  label,
  help,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  help: string
  value: string
  options: readonly {
    value: string
    title: string
    description: string
    forthcoming?: boolean
  }[]
  disabled?: boolean
  onChange: (value: string) => void
} = $props()
const id = $props.id()
</script>

<fieldset class="grid min-w-0 gap-2" {disabled} aria-label={label}>
  <legend class="mb-2 w-full">
    <span class="flex items-center justify-between gap-2">
      <span class="text-muted-foreground text-xs font-medium">{label}</span>
      <SimpleTooltip triggerClass="inline-flex">
        {#snippet trigger()}
          <button
            type="button"
            aria-label={`About ${label.toLowerCase()}`}
            class="text-muted-foreground hover:text-foreground focus-visible:outline-primary inline-flex size-6 items-center justify-center rounded focus-visible:outline-2"
          >
            <InfoIcon class="size-3.5" aria-hidden="true" />
          </button>
        {/snippet}
        <span class="block max-w-xs text-sm leading-5">{help}</span>
      </SimpleTooltip>
    </span>
  </legend>
  <div
    class={options.length === 2
      ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] items-stretch'
      : 'grid min-w-0 grid-cols-2 items-stretch gap-3'}
  >
    {#each options as option, index}
      {#if options.length === 2 && index > 0}
        <span
          class="text-muted-foreground flex items-center justify-center text-xs"
          aria-hidden="true"
          >or</span
        >
      {/if}
      <label
        class="border-border/40 has-checked:border-primary/60 has-checked:bg-primary/5 has-focus-visible:outline-primary relative flex min-w-0 flex-col items-center gap-1 rounded-lg border px-2 pt-2 pb-3 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 motion-reduce:transition-none {option.forthcoming
          ? 'opacity-55'
          : ''} {disabled || option.forthcoming
          ? 'cursor-default'
          : 'cursor-pointer hover:border-primary/40 hover:bg-muted/30'}"
      >
        <input
          type="radio"
          name={id}
          value={option.value}
          checked={value === option.value}
          disabled={disabled || option.forthcoming}
          class="cursor-inherit absolute inset-0 z-10 m-0 size-full opacity-0"
          onchange={() => {
            if (!disabled && !option.forthcoming) onChange(option.value)
          }}
          aria-label={option.title}
        >
        <div class="w-full">
          <FeaturePolicyIllustration scene={option.value} />
        </div>
        <span class="grid min-w-0 gap-1">
          <span class="text-sm font-medium break-words whitespace-normal"
            >{option.title}</span
          >
          <span
            class="text-muted-foreground text-xs leading-relaxed break-words whitespace-normal"
          >
            {option.forthcoming ? 'Forthcoming' : option.description}
          </span>
        </span>
        <span
          class="border-primary/40 flex size-3 items-center justify-center rounded-full border"
          aria-hidden="true"
        >
          {#if value === option.value}
            <span class="bg-primary size-1.5 rounded-full"></span>
          {/if}
        </span>
      </label>
    {/each}
  </div>
</fieldset>
