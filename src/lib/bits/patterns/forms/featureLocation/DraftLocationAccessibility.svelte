<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { reverseTabStop } from '#lib/bits/custom/form/reverseTabStop.js'
import AccessibilityFields from './AccessibilityFields.svelte'
// ICONS
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'

let {
  value,
  onChange,
  hideHeading = false,
  onRemove,
}: {
  onRemove?: () => void
  hideHeading?: boolean
  value: AccessibilityDraft
  onChange: (value: AccessibilityDraft) => void
} = $props()
const uid = $props.id()
const changed = $derived(Object.values(value).some(answer => answer !== 'unknown'))
onMount(() => {
  void tick().then(() =>
    document.getElementById(`${uid}-stepFreeEntrance`)?.focus({ preventScroll: true }),
  )
})
</script>

<section class="space-y-3 py-3" aria-label={m.accessibility_title()}>
  {#if !hideHeading}
    <h2 class="text-muted-foreground text-xs font-medium">{m.accessibility_title()}</h2>
  {/if}
  <div class="group/subsection flex items-center gap-2">
    <h3 class="text-sm font-semibold">{m.accessibility_mobility_heading()}</h3>
    <button
      type="button"
      use:reverseTabStop
      aria-label={changed ? m.forms__reset() : m.admin__forms_common_remove()}
      class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/subsection:opacity-100 group-hover/subsection:opacity-100 focus-visible:opacity-100 focus-visible:outline-2"
      onclick={() => {
        if (changed) onChange({})
        onRemove?.()
      }}
    >
      {#if changed}
        <ResetIcon class="size-4" />
      {:else}
        <XIcon class="size-4" />
      {/if}
    </button>
  </div>
  <AccessibilityFields {uid} {value} {onChange} />
</section>
