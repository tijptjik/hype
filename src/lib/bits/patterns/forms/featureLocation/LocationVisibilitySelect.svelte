<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Select from '#lib/bits/core/select/Select.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import SharedIcon from 'virtual:icons/lucide/users'
import ExclusiveIcon from 'virtual:icons/lucide/lock-keyhole'
import InfoIcon from 'virtual:icons/lucide/info'

let {
  value = 'shared',
  disabled = false,
  onChange,
}: {
  value?: 'shared' | 'exclusive' | null
  disabled?: boolean
  onChange: (value: 'shared' | 'exclusive') => void
} = $props()
</script>

<div class="bits-theme flex items-center gap-2 text-foreground">
  <div class="relative">
    <span
      class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      aria-hidden="true"
    >
      {#if value !== 'exclusive'}
        <SharedIcon class="size-4" />
      {:else}
        <ExclusiveIcon class="size-4" />
      {/if}
    </span>
    <Select
      value={value ?? ''}
      {disabled}
      placeholder={m.location_visibility()}
      items={[
        { value: 'shared', label: m.location_visibility_shared() },
        { value: 'exclusive', label: m.location_visibility_exclusive() },
      ]}
      variant="ghost"
      triggerClass="h-10 w-auto gap-2 rounded-lg pl-8 pr-3 hover:bg-primary/10"
      onValueChange={nextValue => {
        if (nextValue === 'shared' || nextValue === 'exclusive') onChange(nextValue)
      }}
    />
  </div>
  <!-- biome-ignore format: Keep translated punctuation adjacent to the bold labels. -->
  <SimpleTooltip triggerProps={{ 'aria-label': m.location_visibility(), role: 'button' }}>
    {#snippet trigger()}
      <span class="inline-flex size-8 items-center justify-center text-muted-foreground"
        ><InfoIcon class="size-4" aria-label={m.location_visibility()} /></span
      >
    {/snippet}
    <p class="mb-3 font-semibold">{m.location_visibility_reuse_help()}</p>
    <ul class="list-disc space-y-2 pl-4">
      <li><strong class="font-bold">{m.location_visibility_shared()}</strong>{m.location_visibility_shared_help()}</li>
      <li><strong class="font-bold">{m.location_visibility_exclusive()}</strong>{m.location_visibility_exclusive_help()}</li>
    </ul>
    <p class="mt-3">{m.location_visibility_name_override_help()}</p>
  </SimpleTooltip>
</div>
