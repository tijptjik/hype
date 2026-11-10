<script lang="ts">
// COMPONENTS
import LocationDisplayChoice from './LocationDisplayChoice.svelte'
// ADDRESS LOCALES
import { addressLocaleLabel } from './addressLocaleLabel.js'
// SVELTE
import { onDestroy, tick } from 'svelte'
// I18N
import { m, translateText, toLocaleKey } from '#lib/i18n.js'
import FormI18nTranslationBar from '../formI18nSection/components/FormI18nTranslationBar.svelte'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import MarkerIcon from 'virtual:icons/lucide/map-pin'
import UnlockIcon from 'virtual:icons/lucide/lock-keyhole-open'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// BITS COMPONENTS
import { reverseTabStop } from '#lib/bits/custom/form/reverseTabStop.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import ScrollableText from '#lib/bits/custom/text/ScrollableText.svelte'
// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { AddressDivision } from '#lib/addresses/divisions.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'

let {
  address,
  locationKind,
  divisions = [],
  locale,
  isEditing,
  stale = false,
  showLocale = false,
  localeLabelOutside = false,
  compact = false,
  alignEnd = false,
  scrollWhenConstrained = false,
  showDisplayChoice = false,
  centered = false,
  availableWidth,
  onChange,
}: {
  address: FeatureAddress
  locationKind?: string
  divisions?: AddressDivision[]
  locale: LocaleKey
  isEditing: boolean
  stale?: boolean
  showLocale?: boolean
  localeLabelOutside?: boolean
  compact?: boolean
  alignEnd?: boolean
  scrollWhenConstrained?: boolean
  showDisplayChoice?: boolean
  centered?: boolean
  availableWidth?: number
  onChange: (address: FeatureAddress) => void
} = $props()
let active = true
onDestroy(() => {
  active = false
})
let editGeneration = 0
$effect(() => {
  // Reopening editing cannot restore ownership to a request from the previous session.
  if (!isEditing) editGeneration += 1
})
const uid = $props.id()
const value = $derived(getAddressDisplay(address, locale, divisions, locationKind))
const unlocked = $derived(
  Object.hasOwn(address.overrides[ADDRESS_LOCALES[locale]] ?? {}, 'formattedAddress'),
)
const custom = $derived(
  unlocked &&
    value !==
      getAddressDisplay(
        setAddressOverride(address, locale, 'formattedAddress', undefined),
        locale,
        divisions,
        locationKind,
      ),
)
let groupWidth = $state(0)
let leftWidth = $state(0)
let rightWidth = $state(0)
const railWidth = $derived(Math.max(leftWidth, rightWidth))
// Choose the responsive layout from the owning toolbar, never our intrinsic width:
// stacking changes that width and would otherwise trap a wide toolbar in its narrow layout.
const layoutWidth = $derived(availableWidth ?? groupWidth)
const stacked = $derived(
  centered && layoutWidth > 0 && layoutWidth < railWidth * 2 + 176,
)
let input = $state<HTMLTextAreaElement>()
</script>

<div
  class="min-w-0 space-y-1 {alignEnd ? 'w-max max-w-full' : 'flex-1'}"
  class:opacity-50={stale}
  class:grayscale={stale}
  style:max-width={centered && availableWidth ? `${availableWidth}px` : undefined}
  data-address-stale={stale}
>
  {#if showLocale}
    <label for={uid} class="sr-only">{locale}</label>
  {/if}
  <div class="flex min-w-0 items-center gap-2">
    {#if showLocale && !localeLabelOutside}
      <span
        aria-hidden="true"
        class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs"
        >{addressLocaleLabel(locale)}</span
      >
    {/if}
    <div
      class={centered
        ? 'grid min-w-0 flex-1 items-center gap-2'
        : 'flex min-w-0 flex-1 items-center gap-2'}
      bind:clientWidth={groupWidth}
      style:grid-template-columns={centered
        ? stacked
          ? `minmax(0,1fr) ${railWidth}px ${rightWidth}px minmax(0,1fr)`
          : `${railWidth}px minmax(0,1fr) ${railWidth}px`
        : undefined}
      data-address-display-group
    >
      <div
        bind:clientWidth={leftWidth}
        class="flex w-max shrink-0 items-center gap-2 justify-self-end {stacked
          ? 'col-start-2 row-start-2'
          : ''}"
      >
        {#if isEditing && showDisplayChoice}
          <LocationDisplayChoice
            value={address.locationDisplayMode}
            onChange={locationDisplayMode =>
              onChange({ ...address, locationDisplayMode })}
          />
        {/if}
        <SimpleTooltip contentProps={{ role: 'tooltip' }}>
          {#snippet trigger()}
            <button
              type="button"
              aria-label={m.feature_address_formattedAddress()}
              class="text-muted-foreground inline-flex shrink-0 rounded"
            >
              <MarkerIcon class={compact ? 'size-5' : 'size-7'} aria-hidden="true" />
            </button>
          {/snippet}
          <span class="block">{m.feature_address_formattedAddress()}</span>
          <span class="block">{m.feature_address_composed_help()}</span>
        </SimpleTooltip>
      </div>
      <div
        style:grid-column={stacked ? '1 / -1' : undefined}
        style:grid-row={stacked ? '1' : undefined}
        style:justify-self={stacked ? 'center' : undefined}
        style:max-width={stacked ? '100%' : undefined}
        data-address-display-text
        class={scrollWhenConstrained
          ? 'grid min-w-0 shrink grid-cols-[minmax(0,1fr)] overflow-hidden'
          : 'flex min-w-0 flex-1'}
      >
        {#if scrollWhenConstrained}
          <!-- Intrinsic text width keeps the icons together; the shared scroller handles overflow. -->
          <span
            aria-hidden="true"
            class="invisible col-start-1 row-start-1 border border-transparent font-medium whitespace-pre {compact
              ? 'px-2 text-sm'
              : 'px-3 text-base'}"
            >{value || ' '}</span
          >
        {/if}
        {#if scrollWhenConstrained && !unlocked}
          <ScrollableText
            text={value}
            title=""
            padding={compact ? 16 : 24}
            class="col-start-1 row-start-1 min-w-0 [contain:inline-size]"
            containerClass={`border border-transparent text-left ${compact ? 'h-8 px-2 py-1.5' : 'h-10 px-3 py-2'}`}
            textClass={`font-medium ${compact ? 'text-sm' : 'text-base'}`}
          />
        {:else}
          <textarea
            bind:this={input}
            rows={1}
            wrap={scrollWhenConstrained ? 'off' : 'soft'}
            id={uid}
            tabindex={isEditing && unlocked ? 0 : -1}
            aria-label={showLocale
              ? `${m.feature_address_formattedAddress()} · ${ADDRESS_LOCALES[locale]}`
              : m.feature_address_formattedAddress()}
            {value}
            readonly={!isEditing || !unlocked}
            class="min-w-0 {scrollWhenConstrained
              ? `col-start-1 row-start-1 ${compact ? 'h-8' : 'h-10'} w-full whitespace-nowrap`
              : alignEnd
                ? 'w-auto flex-initial text-right [field-sizing:content]'
                : 'flex-1 [field-sizing:content]'} resize-none rounded-md border border-border bg-panel text-foreground placeholder:text-muted-foreground read-only:text-inherit {compact
              ? 'px-2 py-1.5 text-sm'
              : 'px-3 py-2 text-base'} font-medium read-only:border-transparent read-only:bg-transparent"
            oninput={event =>
              onChange(
                setAddressOverride(
                  address,
                  locale,
                  'formattedAddress',
                  event.currentTarget.value,
                ),
              )}
          ></textarea>
        {/if}
      </div>
      <div
        bind:clientWidth={rightWidth}
        class="flex w-max shrink-0 items-center justify-self-start {stacked
          ? 'col-start-3 row-start-2'
          : ''}"
      >
        {#if isEditing}
          <button
            use:reverseTabStop={custom}
            type="button"
            aria-label={custom
              ? m.feature_address_reset()
              : unlocked
                ? m.address_display_lock()
                : m.address_display_unlock()}
            aria-pressed={unlocked}
            class="text-muted-foreground hover:text-primary focus-visible:outline-primary -ml-1 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2"
            onclick={async () => {
              const opening = !unlocked
              onChange(
                setAddressOverride(
                  address,
                  locale,
                  'formattedAddress',
                  unlocked ? undefined : value,
                ),
              )
              if (opening) {
                await tick()
                input?.focus()
              }
            }}
          >
            {#if custom}
              <ResetIcon class="size-4" />
            {:else if unlocked}
              <UnlockIcon class="size-4" />
            {:else}
              <LockIcon class="size-4" />
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>

  {#if isEditing && showLocale && !value.trim()}
    {@const sources = (Object.keys(ADDRESS_LOCALES) as LocaleKey[]).filter(
      source =>
        source !== locale &&
        getAddressDisplay(address, source, divisions, locationKind).trim(),
    )}
    {#if sources.length}
      <div class="pl-20">
        <FormI18nTranslationBar
          compact
          targetLocale={ADDRESS_LOCALES[locale]}
          availableLocales={sources.map(source => ADDRESS_LOCALES[source])}
          isEditing={true}
          isVisible={true}
          onTranslate={async (source, target) => {
            const originalAddress = address
            const originalLocale = locale
            const generation = editGeneration
            const original = getAddressDisplay(
              address,
              toLocaleKey(source),
              divisions,
              locationKind,
            )
            const [translated] = await translateText(source, target, [original])
            // A changed address or manual input invalidates this pending translation.
            if (
              active &&
              translated &&
              isEditing &&
              generation === editGeneration &&
              locale === originalLocale &&
              address === originalAddress &&
              !getAddressDisplay(address, locale, divisions, locationKind).trim()
            )
              onChange(
                setAddressOverride(
                  address,
                  originalLocale,
                  'formattedAddress',
                  translated,
                ),
              )
          }}
        />
      </div>
    {/if}
  {/if}
</div>
