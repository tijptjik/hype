<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// COMPONENTS
import LocationAssociationIcon from '#lib/bits/custom/locationAssociationIcon/LocationAssociationIcon.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// ICONS
import SearchIcon from 'virtual:icons/lucide/search'
import ClockIcon from 'virtual:icons/lucide/clock'
// TYPES
import type { AddressAssociation } from '#lib/locations/association.js'
let { value }: { value: AddressAssociation } = $props()
</script>

<ul
  class="text-muted-foreground list-none space-y-1 pt-2 pl-0 text-[10px] leading-4"
  data-association-status
>
  <li>
    <span
      class="inline-flex items-center gap-1.5"
      data-tooltip={m.association_found_via({
        kind: locationKindLabel(value.originKind),
      })}
      ><SearchIcon class="size-3" />
      <span
        >{m.association_found_via({ kind: locationKindLabel(value.originKind) })}</span
      ></span
    >
  </li>
  <li>
    <span
      class="inline-flex items-center gap-1.5"
      data-tooltip={m.association_locating_at({ kind: locationKindLabel(value.kind) })}
      ><LocationIcon kind={value.kind} class="size-3" />
      <span
        >{m.association_locating_at({ kind: locationKindLabel(value.kind) })}</span
      ></span
    >
  </li>
  <li>
    <span
      class="inline-flex items-center gap-1.5"
      data-tooltip={m.association_mode_help()}
      ><LocationAssociationIcon mode={value.mode} class="size-3" />
      <span
        >{value.mode === 'manual'
          ? m.association_manual()
          : value.mode === 'linked'
            ? m.association_linked()
            : m.association_unlinked()}</span
      ></span
    >
  </li>
  {#if value.lookup === 'failed' || value.lookup === 'deferred'}
    <li>
      <span class="inline-flex items-center gap-1.5"
        ><ClockIcon class="size-3" /><span>{m.association_pending()}</span></span
      >
    </li>
  {/if}
</ul>
