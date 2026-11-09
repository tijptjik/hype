<script lang="ts">
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
  showLocale = false,
  alignEnd = false,
  scrollWhenConstrained = false,
  onChange,
}: {
  address: FeatureAddress
  locationKind?: string
  divisions?: AddressDivision[]
  locale: LocaleKey
  isEditing: boolean
  showLocale?: boolean
  alignEnd?: boolean
  scrollWhenConstrained?: boolean
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
let input = $state<HTMLTextAreaElement>()
</script>

<div class="min-w-0 space-y-1 {alignEnd ? 'w-max max-w-full' : 'flex-1'}">
  {#if showLocale}
    <label for={uid} class="sr-only">{locale}</label>
  {/if}
  <div class="flex min-w-0 items-center gap-2">
    {#if showLocale}
      <span
        aria-hidden="true"
        class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs"
        >{addressLocaleLabel(locale)}</span
      >
    {/if}
    <div class="flex min-w-0 flex-1 items-center gap-2" data-address-display-group>
      <SimpleTooltip contentProps={{ role: 'tooltip' }}>
        {#snippet trigger()}
          <button
            type="button"
            aria-label={m.feature_address_formattedAddress()}
            class="text-muted-foreground inline-flex shrink-0 rounded"
          >
            <MarkerIcon class="size-7" aria-hidden="true" />
          </button>
        {/snippet}
        <span class="block">{m.feature_address_formattedAddress()}</span>
        <span class="block">{m.feature_address_composed_help()}</span>
      </SimpleTooltip>
      <div
        class={scrollWhenConstrained
          ? 'grid min-w-0 shrink grid-cols-[minmax(0,1fr)] overflow-hidden'
          : 'flex min-w-0 flex-1'}
      >
        {#if scrollWhenConstrained}
          <!-- Intrinsic text width keeps the icons together; the shared scroller handles overflow. -->
          <span
            aria-hidden="true"
            class="invisible col-start-1 row-start-1 border border-transparent px-3 text-base font-medium whitespace-pre"
            >{value || ' '}</span
          >
        {/if}
        {#if scrollWhenConstrained && !unlocked}
          <ScrollableText
            text={value}
            title=""
            padding={24}
            class="col-start-1 row-start-1 min-w-0 [contain:inline-size]"
            containerClass="h-10 border border-transparent px-3 py-2 text-left"
            textClass="text-base font-medium"
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
              ? 'col-start-1 row-start-1 h-10 w-full whitespace-nowrap'
              : alignEnd
                ? 'w-auto flex-initial text-right [field-sizing:content]'
                : 'flex-1 [field-sizing:content]'} resize-none rounded-md border border-border bg-panel text-foreground placeholder:text-muted-foreground read-only:text-inherit px-3 py-2 text-base font-medium read-only:border-transparent read-only:bg-transparent"
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
      {#if isEditing}
        <button
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
