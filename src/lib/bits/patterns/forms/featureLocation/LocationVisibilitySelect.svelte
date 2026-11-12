<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Select from '#lib/bits/core/select/Select.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import CommunityIcon from '#lib/bits/custom/icon/CommunityIcon.svelte'
import ExclusiveIcon from 'virtual:icons/lucide/lock-keyhole'
import InfoIcon from 'virtual:icons/lucide/info'

let {
  value = 'shared',
  disabled = false,
  showInfo = true,
  onChange,
}: {
  value?: 'shared' | 'exclusive' | null
  disabled?: boolean
  showInfo?: boolean
  onChange: (value: 'shared' | 'exclusive') => void
} = $props()
</script>

<div class="bits-theme text-foreground flex max-w-full min-w-0 items-center gap-2">
  <div class="relative max-w-full min-w-0">
    <span
      class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      aria-hidden="true"
    >
      {#if value !== 'exclusive'}
        <CommunityIcon class="size-4" />
      {:else}
        <ExclusiveIcon class="size-4" />
      {/if}
    </span>
    <Select
      value={value ?? ''}
      {disabled}
      placeholder={m.location_visibility()}
      triggerAttrs={{
        'data-tooltip':
          value === 'exclusive'
            ? m.location_visibility_exclusive()
            : value === 'shared'
              ? m.location_visibility_shared()
              : m.location_visibility(),
      }}
      items={[
        { value: 'shared', label: m.location_visibility_shared() },
        { value: 'exclusive', label: m.location_visibility_exclusive() },
      ]}
      variant="ghost"
      triggerClass="group-data-[compact=true]/location-options:w-10! group-data-[compact=true]/location-options:px-0! group-data-[compact=true]/location-options:[&>span]:hidden! group-data-[compact=true]/location-options:[&>svg]:hidden! h-auto min-h-10 w-auto max-w-full gap-2 rounded-lg py-2 pl-8 pr-3 hover:bg-primary/10 [&>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:break-words! [&>span]:text-left!"
      onValueChange={nextValue => {
        if (nextValue === 'shared' || nextValue === 'exclusive') onChange(nextValue)
      }}
    />
  </div>
  {#if showInfo}
    <!-- biome-ignore format: Keep translated punctuation adjacent to the bold labels. -->
    <SimpleTooltip triggerProps={{ 'aria-label': m.location_visibility(), role: 'button' }}>
      {#snippet trigger()}
        <span class="text-muted-foreground inline-flex size-8 items-center justify-center"
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
  {/if}
</div>
