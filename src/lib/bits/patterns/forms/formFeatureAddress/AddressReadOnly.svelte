<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { flip } from 'svelte/animate'
import { cubicInOut } from 'svelte/easing'
import { MediaQuery } from 'svelte/reactivity'

// I18N
import { m } from '#lib/i18n.js'

// ICONS
import MarkerIcon from 'virtual:icons/lucide/map-pin'
import UnitIcon from 'virtual:icons/lucide/door-open'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import ComplexIcon from 'virtual:icons/lucide/blocks'
import StreetIcon from 'virtual:icons/lucide/signpost'
// LOCALES
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
// ADDRESS
import { addressComponentValue } from '#lib/addresses/presentation.js'
import {
  primaryBuildingStreet,
  type BuildingStreet,
} from '#lib/locations/buildingStreetAddresses.js'
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
  buildingStreets = [],
  displayRows = [],
  displayStale = false,
}: {
  buildingStreets?: BuildingStreet[]
  displayRows?: { tag: string; value: string }[]
  displayStale?: boolean
  address: FeatureAddress
  locales: { tag: string; key?: LocaleKey }[]
  primaryLocale: string
  additionalValue: (tag: string, field: EditableAddressField) => string
  groups: { fields: EditableAddressField[]; title?: () => string }[]
  labels: Record<EditableAddressField, string>
} = $props()

const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)')

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
    const header = {
      key,
      title: group.title?.(),
      Icon: icons[key as keyof typeof icons],
    }
    if (key === 'buildingNumberExpression' && buildingStreets.length) {
      const primary = primaryBuildingStreet(buildingStreets)
      return [
        {
          ...header,
          rows: buildingStreets.map(street => {
            const names = locales.flatMap(({ tag }) =>
              street.names[tag.toLowerCase()]
                ? [{ tag, value: street.names[tag.toLowerCase()] }]
                : [],
            )
            if (!names.length) {
              const fallback = Object.entries(street.names)[0]
              if (fallback) names.push({ tag: fallback[0], value: fallback[1] })
            }
            return {
              primary: primary === street,
              fields: [
                {
                  field: key,
                  shared: true,
                  values: [{ tag: primaryLocale, value: street.number }],
                },
                {
                  field: 'streetName' as const,
                  shared: false,
                  values: names.filter(
                    (name, index) =>
                      names.findIndex(other => other.value === name.value) === index,
                  ),
                },
              ],
            }
          }),
        },
      ]
    }
    const fields = group.fields.flatMap(field => {
      // Match the editor's shared fields; localized names retain only distinct values.
      const shared =
        field === 'buildingNumberExpression' ||
        field === 'floorExpression' ||
        field === 'unitExpression'
      const seen = new Set<string>()
      const values = locales.flatMap(({ tag, key }) => {
        const value = key
          ? field === 'floorExpression' &&
            address.unitDetails &&
            Object.hasOwn(address.unitDetails, 'floorRef')
            ? formatFloor(address.unitDetails, key)
            : addressComponentValue(address, key, field)
          : additionalValue(tag, field)
        const normalized = value.trim()
        if (!normalized || seen.has(normalized) || (shared && seen.size)) return []
        seen.add(normalized)
        return [{ tag, value }]
      })
      return values.length ? [{ field, values, shared }] : []
    })
    return fields.length
      ? [
          {
            ...header,
            rows: [{ fields, primary: false }],
          },
        ]
      : []
  }),
)
</script>

{#if sections.length || displayRows.length}
  <div
    transition:slide={{ duration: reducedMotion.current ? 0 : 200, easing: cubicInOut }}
    class="border-border/70 divide-border/60 @container min-w-0 divide-y overflow-hidden rounded-xl border"
    data-address-parts
  >
    {#if displayRows.length}
      <section
        transition:slide={{
          duration: reducedMotion.current ? 0 : 200,
          easing: cubicInOut,
        }}
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4"
        data-address-display-values
        class:opacity-50={displayStale}
        class:grayscale={displayStale}
      >
        <MarkerIcon class="text-muted-foreground mt-0.5 size-4" aria-hidden="true" />
        <div class="min-w-0 space-y-3">
          <h3
            class="text-muted-foreground text-xs font-semibold tracking-wide capitalize"
          >
            {m.feature_address_formattedAddress()}
          </h3>
          <div class="flex min-w-0 flex-col gap-1">
            {#each displayRows as { tag, value } (tag)}
              <p
                animate:flip={{ duration: reducedMotion.current ? 0 : 200 }}
                transition:slide={{
                  duration: reducedMotion.current ? 0 : 200,
                  easing: cubicInOut,
                }}
                lang={tag}
                class="flex min-w-0 items-baseline gap-2 text-sm leading-relaxed font-medium"
              >
                {#if tag !== primaryLocale}
                  <span class="text-muted-foreground shrink-0 font-mono text-xs"
                    >{shortLocaleLabel(tag)}</span
                  >
                {/if}
                <span class="min-w-0 break-words whitespace-normal">{value}</span>
              </p>
            {/each}
          </div>
        </div>
      </section>
    {/if}
    {#each sections as section (section.key)}
      <section
        animate:flip={{ duration: reducedMotion.current ? 0 : 200 }}
        transition:slide={{
          duration: reducedMotion.current ? 0 : 200,
          easing: cubicInOut,
        }}
        class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4"
      >
        <section.Icon class="text-muted-foreground mt-0.5 size-4" aria-hidden="true" />
        <div class="min-w-0 space-y-3">
          <h3 class="text-muted-foreground text-xs font-semibold tracking-wide">
            {section.title}
          </h3>
          {#each section.rows as row, index (index)}
            <dl
              class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 @min-[24rem]:grid-cols-2"
            >
              {#each row.fields as { field, values, shared } (field)}
                <div class="min-w-0" data-address-part={field}>
                  <dt class="text-muted-foreground mb-1 text-xs">
                    {labels[field]}
                    {#if row.primary && field === 'buildingNumberExpression'}
                      <span class="text-primary ml-2"
                        >{m.building_street_primary()}</span
                      >
                    {/if}
                  </dt>
                  {#each values as { tag, value } (tag)}
                    <dd
                      animate:flip={{ duration: reducedMotion.current ? 0 : 200 }}
                      transition:slide={{
                        duration: reducedMotion.current ? 0 : 200,
                        easing: cubicInOut,
                      }}
                      lang={tag}
                      class="text-foreground flex min-w-0 items-baseline gap-2 text-base leading-relaxed font-medium"
                    >
                      {#if !shared && tag !== primaryLocale}
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
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}
