<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/button/index.js'
// ICONS
import LinkIcon from 'virtual:icons/lucide/link'
import PinIcon from 'virtual:icons/proicons/location'
import HistoryIcon from 'virtual:icons/lucide/history'

let {
  value,
  onChange,
}: {
  value: 'associated' | 'placed' | 'past'
  onChange?: (view: 'associated' | 'placed' | 'past') => void
} = $props()

const options = $derived([
  {
    value: 'associated',
    label: m.location_features_associated(),
    icon: LinkIcon,
    description: m.location_features_associated_help(),
  },
  {
    value: 'placed',
    label: m.location_features_placed(),
    icon: PinIcon,
    description: m.location_features_placed_help(),
  },
  {
    value: 'past',
    label: m.location_features_past(),
    icon: HistoryIcon,
    description: m.location_features_past_help(),
  },
] as const)
</script>

<fieldset
  class="flex shrink-0 items-center gap-0"
  aria-label={m.location_features_relationship_filter()}
>
  {#each options as option (option.value)}
    <Button
      size="sm"
      modifier="square"
      class="size-11! shrink-0 p-0!"
      text={option.label}
      iconComponent={option.icon}
      hideLabel
      hideLabelInstantly
      style={value === option.value ? 'soft' : 'ghost'}
      color={value === option.value ? 'primary' : 'neutral'}
      attrs={{
        'aria-pressed': value === option.value,
        'data-tooltip': option.description,
      }}
      onClick={() => onChange?.(option.value)}
    />
  {/each}
</fieldset>
