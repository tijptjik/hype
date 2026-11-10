<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import { cubicInOut } from 'svelte/easing'
// COMPONENTS
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
// API
import { translateContentField } from '#lib/api/translation.remote.js'
// TYPES
import type { FeatureType } from '#lib/features/intents.js'
let {
  type = $bindable(),
  locales,
  multilingual,
  disabled = false,
}: {
  type: FeatureType
  locales: string[]
  multilingual: boolean
  disabled?: boolean
} = $props()
let busy = $state<string | undefined>()
let error = $state('')
let beforeEdit = ''
const sources = $derived(
  locales
    .filter(locale => value(locale).trim())
    .map(locale => {
      const record = getContentLocaleRecord(locale, getLocaleKey())
      return {
        locale,
        label: record.autonym,
        accessibleLabel: m.profile_translate_source({ language: record.name }),
      }
    }),
)
/** Resolve a localized display name with the legacy English fallback.
 * @param locale Content language. @returns Current draft text.
 */
function value(locale: string): string {
  return type.labels?.[locale] ?? (locale === 'en' ? type.label : '')
}
/** Update only the selected locale, retaining hidden translations.
 * @param locale Content language. @param text Draft name. @returns Nothing.
 */
function update(locale: string, text: string): void {
  type.labels = { ...type.labels, [locale]: text }
  if (locale === 'en') type.label = text
}
/** Translate empty targets without replacing concurrent edits or a replaced draft.
 * @param source Source language. @returns Completion of the translation batch.
 */
async function translate(source: string): Promise<void> {
  if (disabled || busy) return
  const draft = type
  const text = value(source)
  const targets = locales.filter(locale => locale !== source && !value(locale).trim())
  busy = source
  error = ''
  try {
    // Apply only to the unchanged draft and still-empty destination fields.
    await Promise.all(
      targets.map(async target => {
        const result = await translateContentField({ source, target, text })
        if (
          type !== draft ||
          disabled ||
          value(source) !== text ||
          value(target).trim()
        )
          return
        if (result.status === 'translated') update(target, result.text)
        else error = result.message
      }),
    )
  } catch {
    error = 'Unable to translate display names. Please try again.'
  } finally {
    busy = undefined
  }
}
</script>
<div class="grid min-w-0" data-type-names>
  <Label text="Display name" />
  <FormI18nSourceBar
    visible={multilingual && !disabled && sources.length > 0}
    {sources}
    label={m.profile_translate_from()}
    busy={Boolean(busy)}
    busySource={busy}
    disabled={disabled || Boolean(busy)}
    hasTargets={locales.some(locale => !value(locale).trim())}
    onTranslate={source => void translate(source)}
  />
  <div class="mt-2">
    {#each locales as locale, index (locale)}
      <!-- Include row spacing in the slide so the naming rules move continuously. -->
      <div
        class={index > 0 ? 'pt-2' : ''}
        transition:slide={{
          duration: prefersReducedMotion.current ? 0 : 200,
          easing: cubicInOut,
        }}
      >
        <FormI18nInlineRow
          value={value(locale)}
          label={multilingual ? `Display name ${locale}` : 'Display name'}
          prefix={multilingual ? shortLocaleLabel(locale) : ''}
          editable={!disabled}
          showVerification={false}
          required={false}
          issues={undefined}
          attrs={{
            lang: locale,
            dir: 'auto',
            maxlength: 80,
            oninput: (event: Event) =>
              update(locale, (event.currentTarget as HTMLInputElement).value),
          }}
          onStart={() => (beforeEdit = value(locale))}
          onCancel={() => update(locale, beforeEdit)}
          onClear={() => update(locale, '')}
        />
      </div>
    {/each}
  </div>
  {#if error}
    <p role="alert" class="text-destructive text-xs">{error}</p>
  {/if}
</div>
