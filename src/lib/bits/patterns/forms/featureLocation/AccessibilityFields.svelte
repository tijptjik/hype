<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Select } from '#lib/bits/core/index.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import WheelchairIcon from 'virtual:icons/lucide/accessibility'
import EntranceIcon from 'virtual:icons/lucide/door-open'
import LiftIcon from 'virtual:icons/lucide/arrow-up-down'
import ToiletIcon from 'virtual:icons/lucide/toilet'
import InfoIcon from 'virtual:icons/lucide/info'
// DOMAIN
import {
  ACCESSIBILITY_FIELDS,
  UNKNOWN_ACCESSIBILITY,
} from '#lib/locations/accessibility.js'
// TYPES
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'

let {
  value,
  onChange,
  uid,
  disabled = false,
}: {
  value: AccessibilityDraft
  onChange: (value: AccessibilityDraft) => void
  uid: string
  disabled?: boolean
} = $props()
const icons = {
  wheelchair: WheelchairIcon,
  stepFreeEntrance: EntranceIcon,
  lift: LiftIcon,
  toilet: ToiletIcon,
}
const labels = $derived({
  wheelchair: m.accessibility_wheelchair(),
  stepFreeEntrance: m.accessibility_step_free(),
  lift: m.accessibility_lift(),
  toilet: m.accessibility_toilet(),
})
const help = $derived({
  wheelchair: m.accessibility_wheelchair_help(),
  stepFreeEntrance: m.accessibility_step_free_help(),
  lift: m.accessibility_lift_help(),
  toilet: m.accessibility_toilet_help(),
})
const choices = $derived({
  unknown: m.accessibility_unknown(),
  yes: m.accessibility_yes(),
  no: m.accessibility_no(),
  limited: m.accessibility_limited(),
  not_needed: m.accessibility_not_needed(),
})
</script>

<div class="@container">
  <div class="grid min-w-0 grid-cols-1 items-start gap-4 @min-[500px]:grid-cols-2">
    {#each ACCESSIBILITY_FIELDS as field}
      {@const Icon = icons[field]}
      <fieldset {disabled} class="min-w-0 space-y-2">
        <legend class="mb-1 flex min-h-7 w-full items-center gap-2 text-sm font-medium">
          <Icon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <label class="flex-1" for={`${uid}-${field}`}>{labels[field]}</label>
          <SimpleTooltip>
            {#snippet trigger()}
              <button
                type="button"
                aria-label={labels[field]}
                aria-describedby={`${uid}-${field}-help`}
                class="text-muted-foreground hover:text-foreground focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2"
              >
                <InfoIcon class="size-4" />
              </button>
            {/snippet}
            {help[field]}
          </SimpleTooltip>
        </legend>
        <span id={`${uid}-${field}-help`} class="sr-only">{help[field]}</span>
        <Select
          triggerClass="w-full! bg-transparent!"
          value={value[field] ?? UNKNOWN_ACCESSIBILITY[field]}
          {disabled}
          triggerAttrs={{
            id: `${uid}-${field}`,
            'aria-label': labels[field],
            'aria-describedby': `${uid}-${field}-help`,
          }}
          items={(field === 'stepFreeEntrance'
            ? ['unknown', 'yes', 'no']
            : field === 'lift'
              ? ['unknown', 'yes', 'no', 'not_needed']
              : ['unknown', 'yes', 'limited', 'no']
          ).map(option => ({
            value: option,
            label: choices[option as keyof typeof choices],
          }))}
          onValueChange={next => onChange({ ...value, [field]: next })}
        />
      </fieldset>
    {/each}
  </div>
</div>
