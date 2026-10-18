<script lang="ts">
// ICONS
import SettingsIcon from 'virtual:icons/proicons/settings'
// BITS
import { Popover } from '#lib/bits/core/popover/index.js'
// DOMAIN
import { divisionClassLabel } from '#lib/divisions/classes.js'

let {
  options,
  onToggle,
}: {
  options: { value: string; visible: boolean }[]
  onToggle: (value: string) => void
} = $props()
</script>

<Popover
  triggerProps={{ 'aria-label': 'Division visibility settings' }}
  triggerClass="shrink-0"
  contentProps={{ align: 'end', collisionPadding: 12 }}
  contentClass="z-[100] max-h-[70dvh] w-60 overflow-y-auto rounded-lg border border-border bg-panel p-3 text-base-content shadow-xl"
>
  {#snippet trigger()}
    <button
      type="button"
      aria-label="Division visibility settings"
      class="flex size-8 cursor-pointer items-center justify-center rounded-md text-base-content/60 hover:bg-base-content/10 hover:text-base-content focus-visible:outline-2 focus-visible:outline-focus"
    >
      <SettingsIcon class="size-4" aria-hidden="true" />
    </button>
  {/snippet}
  <fieldset>
    <legend class="mb-2 text-sm font-medium">Show division classes</legend>
    {#each options as option (option.value)}
      <label
        class="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-base-content/10"
      >
        <input
          type="checkbox"
          checked={option.visible}
          onchange={() => onToggle(option.value)}
          class="size-4 accent-primary"
        >
        {divisionClassLabel(option.value)}
      </label>
    {/each}
  </fieldset>
</Popover>
