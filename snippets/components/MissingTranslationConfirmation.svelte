<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { Language, CheckCircle } from '@steeze-ui/heroicons'
// LIB
import { translateText } from '$lib/i18n'
import { supportedLocales } from '$lib/enums'
// TYPES
import type { Locale, Resource, Form } from '$lib/types'

interface Props {
  form: Form
  locale: Locale
  fieldRoot: string
  onConfirm: (event: Event) => void
  onTranslate: (event: Event) => void
}

// PROPS
let { locale, fieldRoot, onConfirm, onTranslate, ...barProps }: Props = $props()

// STATE : DERIVED :: FORM
let { form } = barProps.form

// STATE
let loadingTranslation = $state(false)

// FUNCTIONS
async function handleTranslate(event: Event) {
  event.preventDefault()
  try {
    loadingTranslation = true

    // Find the first non-empty value from supported locales
    let sourceValue = ''
    let sourceLocale: Locale = 'en'

    for (const locale of supportedLocales) {
      // @ts-expect-error - waiting for runes version of superform
      const value = $form.i18n?.[locale as Locale]?.[fieldRoot]
      if (value) {
        sourceValue = value
        sourceLocale = locale
        break
      }
    }

    if (!sourceValue) {
      throw new Error('No source value found for translation')
    }

    const translations = await translateText(sourceLocale, locale, [sourceValue])

    form.update(($form: any) => {
      if (!$form.i18n) {
        $form.i18n = {}
      }
      if (!$form.i18n[locale]) {
        $form.i18n[locale] = {}
      }
      $form.i18n[locale][fieldRoot] = translations[0]
      $form.i18n[locale][`${fieldRoot}Gen`] = true
      return $form
    })

    onTranslate(event)
  } catch (error) {
    console.error('Translation failed:', error)
  } finally {
    loadingTranslation = false
  }
}
</script>

<div
  class="bottom-0 left-0 right-0 flex items-center justify-between rounded-b-xl bg-glass-300 px-6 py-3"
>
  <div class="flex items-center gap-4">
    <Icon src={Language} class="h-6 w-6 text-primary" />
    <span class="text-sm text-base-content">{m.blue_smug_marlin_peel()}</span>
  </div>
  <div class="flex gap-2">
    <button
      class="text-md focus:outline-neutral-conten btn btn-circle btn-ghost text-glass-accepted hover:bg-transparent hover:text-glass-accepted/80 focus:border-none focus:outline-none focus:ring-2 focus:ring-primary"
      disabled={loadingTranslation}
      onclick={(e) => onConfirm(e)}
    >
      <Icon src={CheckCircle} class="h-6 w-6" />
    </button>
    <button
      class="text-md btn btn-circle border-none bg-glass-100 font-normal text-base-content hover:bg-glass-100/80 focus:border-none focus:outline-none focus:ring-2 focus:ring-primary"
      disabled={loadingTranslation}
      onclick={(e) => handleTranslate(e)}
    >
      {#if loadingTranslation}
        <span class="loading loading-ring loading-sm"></span>
      {:else}
        EN
      {/if}
    </button>
  </div>
</div>
