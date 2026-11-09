<script lang="ts">
// ICONS
import UnitIcon from 'virtual:icons/lucide/door-open'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import ComplexIcon from 'virtual:icons/lucide/blocks'
import StreetIcon from 'virtual:icons/lucide/signpost'
// LOCALES
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
// ADDRESS
import { addressComponentValue } from '#lib/addresses/presentation.js'
import { formatFloor } from '#lib/addresses/address3d.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { EditableAddressField } from '#lib/addresses/addressExpressions.js'
import type { LocaleKey } from '#lib/types.js'

let {
  address,
  locales,
  primaryLocale,
  additionalValue,
  groups,
  labels,
}: {
  address: FeatureAddress
  locales: { tag: string; key?: LocaleKey }[]
  primaryLocale: string
  additionalValue: (tag: string, field: EditableAddressField) => string
  groups: { fields: EditableAddressField[]; title?: () => string }[]
  labels: Record<EditableAddressField, string>
} = $props()

const icons = {
  unitPortion: UnitIcon,
  buildingName: BuildingIcon,
  phaseExpression: ComplexIcon,
  buildingNumberExpression: StreetIcon,
}

// Use the editor's section order while omitting empty fields and editor-only controls.
const sections = $derived(
  groups.flatMap(group => {
    const key = group.fields[0]
    if (!(key in icons)) return []
    const fields = group.fields.flatMap(field => {
      const values = locales.flatMap(({ tag, key }) => {
        const value = key
          ? field === 'floorExpression' &&
            address.unitDetails &&
            Object.hasOwn(address.unitDetails, 'floorRef')
            ? formatFloor(address.unitDetails, key)
            : addressComponentValue(address, key, field)
          : additionalValue(tag, field)
        return value.trim() ? [{ tag, value }] : []
      })
      return values.length ? [{ field, values }] : []
    })
    return fields.length
      ? [
          {
            key,
            title: group.title?.(),
            Icon: icons[key as keyof typeof icons],
            fields,
          },
        ]
      : []
  }),
)
</script>

{#if sections.length}
  <div
    class="border-border/70 divide-border/60 @container min-w-0 divide-y overflow-hidden rounded-xl border"
    data-address-parts
  >
    {#each sections as section (section.key)}
      <section class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4">
        <section.Icon class="text-muted-foreground mt-0.5 size-4" aria-hidden="true" />
        <div class="min-w-0 space-y-3">
          <h3 class="text-muted-foreground text-xs font-semibold tracking-wide">
            {section.title}
          </h3>
          <dl class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 @min-[24rem]:grid-cols-2">
            {#each section.fields as { field, values } (field)}
              <div class="min-w-0" data-address-part={field}>
                <dt class="text-muted-foreground mb-1 text-xs">{labels[field]}</dt>
                {#each values as { tag, value } (tag)}
                  <dd
                    lang={tag}
                    class="text-foreground flex min-w-0 items-baseline gap-2 text-base leading-relaxed font-medium"
                  >
                    {#if tag !== primaryLocale}
                      <span class="text-muted-foreground shrink-0 font-mono text-xs"
                        >{shortLocaleLabel(tag)}</span
                      >
                    {/if}
                    <span class="min-w-0 break-words whitespace-normal">{value}</span>
                  </dd>
                {/each}
              </div>
            {/each}
          </dl>
        </div>
      </section>
    {/each}
  </div>
{/if}
