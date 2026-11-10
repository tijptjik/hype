<script lang="ts">
// COMPONENTS
import FeatureIntentHelp from './FeatureIntentHelp.svelte'
import FeaturePolicyIllustration from './FeaturePolicyIllustration.svelte'
let {
  label,
  help,
  value,
  options,
  disabled = false,
  layout = 'card',
  onChange,
}: {
  label: string
  help?: 'kind' | 'relation' | 'start' | 'missing'
  layout?: 'card' | 'horizontal'
  value: string
  options: readonly {
    value: string
    title: string
    description: string
    forthcoming?: boolean
    scene?: string
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
      {#if help}
        <FeatureIntentHelp topic={help} label={`About ${label.toLowerCase()}`} />
      {/if}
    </span>
  </legend>
  <div
    class={layout === 'horizontal'
      ? 'grid min-w-0 grid-cols-1 items-stretch gap-3 sm:grid-cols-2'
      : options.length === 2
        ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] items-stretch'
        : 'grid min-w-0 grid-cols-2 items-stretch gap-3'}
  >
    {#each options as option, index}
      {#if layout !== 'horizontal' && options.length === 2 && index > 0}
        <span
          class="text-muted-foreground flex items-center justify-center text-xs"
          aria-hidden="true"
          >or</span
        >
      {/if}
      <label
        class="border-border/40 has-checked:border-primary/60 has-checked:bg-primary/5 has-focus-visible:outline-primary relative min-w-0 items-center rounded-lg border transition-colors {layout ===
        'horizontal'
          ? 'grid grid-cols-[4.5rem_minmax(0,1fr)_0.75rem] gap-3 px-3 py-3 text-left'
          : 'flex flex-col gap-1 px-2 pt-2 pb-3 text-center'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 motion-reduce:transition-none {option.forthcoming
          ? 'opacity-55'
          : ''} {disabled || option.forthcoming
          ? 'cursor-default'
          : 'cursor-pointer hover:border-primary/40 hover:bg-muted/30'}"
      >
        <!-- Keep native radio grouping; the registered draft field owns submission. -->
        <input
          type="radio"
          form=""
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
        <div class={layout === 'horizontal' ? 'w-full [&_svg]:h-12' : 'w-full'}>
          <FeaturePolicyIllustration scene={option.scene ?? option.value} />
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
