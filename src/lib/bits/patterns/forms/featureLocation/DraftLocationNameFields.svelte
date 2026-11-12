<script lang="ts">
// TRANSLATION REVIEW
import { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import MultilingualReviewPanel from '../translationReview/MultilingualReviewPanel.svelte'
import TranslationSuggestion from '../translationReview/TranslationSuggestion.svelte'
// LINKED FIELD CONTROLS
import LinkedFieldToggle from '../linkedFields/LinkedFieldToggle.svelte'
import { getLinkedFields } from '../linkedFields/linkedFields.svelte.js'
const linkedFields = getLinkedFields()

// SVELTE
import { onDestroy, tick } from 'svelte'
import { flip } from 'svelte/animate'
import { slide } from 'svelte/transition'
import { MediaQuery } from 'svelte/reactivity'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
// COMPONENTS
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
// ADDRESS
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
import {
  normalizeContentLocale,
  normalizeContentLocales,
} from '#lib/content-locales/model.js'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
// TYPES
import type { ProfileLocaleState } from './profileLocales.js'
import type { LocationKind } from '#lib/locations/kinds.js'

const prefersReducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)')
let {
  names,
  kind,
  localeState,
  translations,
  isEditing,
  locked = false,
  recordKey,
  onChange,
  onBlur,
}: {
  names: Record<string, string>
  kind: LocationKind
  localeState?: ProfileLocaleState
  translations: boolean
  isEditing: boolean
  locked?: boolean
  recordKey?: string | null
  onBlur?: () => void
  onChange: (names: Record<string, string>) => void
} = $props()
const editable = $derived(isEditing && !locked)
// Shared Profile choices retain empty draft languages; populated names remain reachable.
const locales = $derived(
  normalizeContentLocales([
    ...(localeState?.selectedLocales ?? [getLocaleKey(), 'en', 'zh-Hant', 'zh-Hans']),
    ...Object.keys(names).filter(tag => names[tag]?.trim()),
  ]).filter(tag => !/^und(?:-|$)/i.test(tag)),
)
let reviewVisible = $state(false)
const shown = $derived(
  reviewVisible
    ? locales
    : displayedLocales(
        {
          selectedLocales: locales,
          visibleLocales: localeState
            ? [
                ...localeState.visibleLocales,
                ...locales.filter(tag => !localeState.selectedLocales.includes(tag)),
              ]
            : locales,
        },
        translations,
      ),
)
const canonicalNames = $derived(
  Object.fromEntries(
    Object.entries(names).map(([tag, name]) => [
      normalizeContentLocale(tag) ?? tag,
      name,
    ]),
  ),
)
const review = new MultilingualReview(
  () =>
    locales.map(locale => ({
      key: `${recordKey ?? ''}:${kind}:${locale}`,
      field: 'name',
      locale,
      value: canonicalNames[locale] ?? '',
      set: (text: string) => onChange({ ...canonicalNames, [locale]: text }),
    })),
  () => editable,
  () => {
    reviewVisible = true
  },
)
let editingLocale = $state<string | null>(null)
let translating = $state<string | null>(null)
let translationError = $state<string | null>(null)
let active = true
onDestroy(() => {
  active = false
})
</script>

<section
  hidden={linkedFields && !linkedFields.visible('names')}
  class="col-span-6 min-w-0 space-y-3 pb-3"
  data-draft-location-name
>
  <MultilingualReviewPanel {review} />
  <div class="flex items-center gap-2">
    <h3 class="text-muted-foreground text-xs font-medium">{locationKindLabel(kind)}</h3>
    {#if locked}
      <span class="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <LockIcon class="size-3" aria-hidden="true" />
        {m.feature_name_locked()}
      </span>
    {/if}
  </div>
  <fieldset class="min-w-0 space-y-2">
    <legend class="mb-1 text-sm font-medium">
      <span class="inline-flex items-center gap-2"
        >{m.field_name()}<LinkedFieldToggle
          field="names"
          label={m.field_name()}
        /></span
      >
    </legend>
    {#each shown as locale (locale)}
      {@const tag = locale}
      {@const reviewKey = `${recordKey ?? ''}:${kind}:${locale}`}
      {@const sources = locales.filter(
        source => source !== locale && canonicalNames[source]?.trim(),
      )}
      <div
        animate:flip={{ duration: prefersReducedMotion.current ? 0 : 200 }}
        transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
        class="flex min-w-0 items-start gap-2"
      >
        {#if translations || reviewVisible}
          <span
            class="text-muted-foreground flex h-10 w-[3em] shrink-0 items-center font-mono text-xs"
            >{shortLocaleLabel(locale)}</span
          >
        {/if}
        <LocationIcon {kind} class="text-muted-foreground mt-1.5 size-7 shrink-0" />
        <div
          class="min-w-0 flex-1 rounded-md {review.started &&
          !canonicalNames[tag]?.trim()
            ? 'outline outline-1 outline-red-600/50'
            : ''}"
        >
          {#if review.current(reviewKey)}
            <TranslationSuggestion
              value={review.proposals[reviewKey].value}
              label={m.field_name()}
              onChange={text => {
                review.proposals[reviewKey].value = text
              }}
              onAccept={edited => review.accept(reviewKey, edited)}
              onReject={() => review.reject(reviewKey)}
            />
          {:else if editingLocale === locale && editable}
            <input
              onblur={() => {
                editingLocale = null
                onBlur?.()
              }}
              id={`draft-location-name-${locale}`}
              aria-label={translations && locale !== shown[0]
                ? `${m.field_name()} · ${tag}`
                : m.field_name()}
              value={canonicalNames[tag] ?? ''}
              maxlength={1000}
              class="border-border bg-panel text-foreground focus-visible:outline-primary h-10 w-full min-w-0 rounded-md border px-3 py-2 text-base font-medium focus-visible:outline-2"
              oninput={event =>
                onChange({ ...canonicalNames, [tag]: event.currentTarget.value })}
            >
          {:else}
            <button
              type="button"
              disabled={!editable}
              class="enabled:hover:bg-foreground/5 min-h-10 w-full rounded-md border border-transparent px-3 py-2 text-left text-base font-medium break-words whitespace-normal"
              onclick={async () => {
                editingLocale = locale
                await tick()
                document.getElementById(`draft-location-name-${locale}`)?.focus()
              }}
            >
              {#if canonicalNames[tag]?.trim()}
                {canonicalNames[tag]}
              {:else}
                <span class="text-muted-foreground font-normal italic"
                  >{m.field_name()}</span
                >
              {/if}
            </button>
          {/if}
          {#if translations &&
            editable &&
            !canonicalNames[tag]?.trim() &&
            sources.length}
            <FormI18nSourceBar
              visible={true}
              label={m.address_translate_from()}
              busy={translating === tag}
              disabled={translating !== null}
              sources={sources.map(source => ({
                locale: source,
                label: shortLocaleLabel(source),
                accessibleLabel: `${m.address_translate_from()} ${source}`,
              }))}
              onTranslate={async source => {
                const target = tag
                const original = canonicalNames[source]
                const originalKey = recordKey
                const originalKind = kind
                translating = target
                translationError = null
                try {
                  const { translateContentField } = await import(
                    '#lib/api/translation.remote.js'
                  )
                  const result = await translateContentField({
                    source,
                    target,
                    text: original,
                  })
                  // Preserve manual edits and never apply a response to another selected identity.
                  if (
                    active &&
                    editable &&
                    result.status === 'translated' &&
                    recordKey === originalKey &&
                    kind === originalKind &&
                    !canonicalNames[target]?.trim() &&
                    canonicalNames[source] === original
                  )
                    onChange({ ...canonicalNames, [target]: result.text })
                  else if (result.status !== 'translated') translationError = target
                } catch {
                  translationError = target
                } finally {
                  translating = null
                }
              }}
            />
            {#if translationError === tag}
              <span role="alert" class="text-destructive text-xs"
                >{m.address_translate_error()}</span
              >
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </fieldset>
</section>
