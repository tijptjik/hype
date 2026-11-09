<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import Select from '#lib/bits/core/select/Select.svelte'
import LocationAssociationIcon from '#lib/bits/custom/locationAssociationIcon/LocationAssociationIcon.svelte'
// TYPES
import type { AddressAssociation } from '#lib/locations/association.js'

let {
  value,
  enabledMode,
  disabled = false,
  onChange,
}: {
  value: AddressAssociation['mode']
  enabledMode: 'linked' | 'unlinked'
  disabled?: boolean
  onChange: (value: AddressAssociation['mode']) => void
} = $props()
</script>

<div class="bits-theme text-foreground relative max-w-full min-w-0">
  <span
    class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
    aria-hidden="true"
  >
    <LocationAssociationIcon mode={value} />
  </span>
  <Select
    {value}
    {disabled}
    placeholder={m.location_sync()}
    triggerAttrs={{
      'data-sync-mode': value,
      'data-tooltip':
        value === 'manual'
          ? m.location_sync_unsynced()
          : value === 'linked'
            ? m.association_linked()
            : m.association_unlinked(),
    }}
    items={[
      {
        value: enabledMode,
        label:
          enabledMode === 'linked' ? m.association_linked() : m.association_unlinked(),
      },
      { value: 'manual', label: m.location_sync_unsynced() },
    ]}
    variant="ghost"
    triggerClass="group-data-[compact=true]/location-options:w-10! group-data-[compact=true]/location-options:px-0! group-data-[compact=true]/location-options:[&>span]:hidden! group-data-[compact=true]/location-options:[&>svg]:hidden! h-auto min-h-10 w-auto max-w-full gap-2 rounded-lg py-2 pl-8 pr-3 hover:bg-primary/10 [&>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:break-words! [&>span]:text-left!"
    onValueChange={next => {
      if (next !== value && (next === enabledMode || next === 'manual')) onChange(next)
    }}
  />
</div>
