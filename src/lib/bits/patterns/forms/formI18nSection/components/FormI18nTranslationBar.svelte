<script lang="ts">
import { fade } from 'svelte/transition'
import { localeCodes, supportedLocales } from '$lib/enums'
import type { Locale } from '$lib/types'
import AlertCircle from 'virtual:icons/lucide/alert-circle'
import Eraser from 'virtual:icons/lucide/eraser'
import Languages from 'virtual:icons/lucide/languages'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
import type { FormSectionProps } from '../formI18nSection.types'

type Props = Pick<
  FormSectionProps,
  'localeCodeClass' | 'onTranslate' | 'onResetLocale' | 'sectionKey'
> & {
  targetLocale: Locale
  isVisible?: boolean
  isEditing?: boolean
}

let {
  targetLocale,
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  onResetLocale,
  sectionKey,
  isVisible = false,
  isEditing = false,
}: Props = $props()

let status = $state<'idle' | 'loading' | 'error'>('idle')
let loadingLocale = $state<Locale | null>(null)
let errorResetTimer = $state<ReturnType<typeof setTimeout> | null>(null)
let resetFlashToken = $state(0)

const sourceLocales = $derived(
  supportedLocales.filter(locale => locale !== targetLocale),
)
const isLoading = $derived(status === 'loading')

function clearErrorTimer(): void {
  if (!errorResetTimer) return
  clearTimeout(errorResetTimer)
  errorResetTimer = null
}

async function handleTranslate(event: MouseEvent, sourceLocale: Locale): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  if (!onTranslate || status === 'loading') return

  clearErrorTimer()
  status = 'loading'
  loadingLocale = sourceLocale

  try {
    const translated = await onTranslate(sourceLocale, targetLocale, sectionKey)
    if (translated === false) {
      resetFlashToken += 1
    }
    status = 'idle'
  } catch {
    status = 'error'
    errorResetTimer = setTimeout(() => {
      status = 'idle'
      errorResetTimer = null
    }, 5000)
  } finally {
    loadingLocale = null
  }
}

async function handleResetLocale(event: MouseEvent): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  if (!onResetLocale || status === 'loading') return
  await onResetLocale(targetLocale, sectionKey)
}

$effect(() => {
  return () => {
    clearErrorTimer()
  }
})
</script>

<div class="bits-form__i18n-translation">
  <div class={localeCodeClass}>
    {#key status}
      {#if status === 'loading'}
        <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
          <LoaderCircle class="bits-form__i18n-translation-status-icon animate-spin" />
        </span>
      {:else if status === 'error'}
        <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
          <AlertCircle
            class="bits-form__i18n-translation-status-icon bits-form__i18n-translation-status-icon--error"
          />
        </span>
      {:else}
        <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
          {localeCodes[targetLocale] ?? targetLocale.toUpperCase()}
        </span>
      {/if}
    {/key}
  </div>

  {#if isEditing && !isLoading}
    <div
      class={`bits-form__i18n-translation-bar ${isVisible ? 'bits-form__i18n-translation-bar--visible' : ''}`}
    >
      <div class="bits-form__i18n-translation-icon"><Languages /></div>
      {#each sourceLocales as sourceLocale (sourceLocale)}
        <button
          type="button"
          class="bits-form__i18n-translation-source"
          disabled={!onTranslate}
          tabindex={isVisible ? 0 : -1}
          onclick={event => handleTranslate(event, sourceLocale)}
        >
          {localeCodes[sourceLocale] ?? sourceLocale.toUpperCase()}
        </button>
      {/each}
      <button
        type="button"
        class="bits-form__i18n-translation-source"
        disabled={!onResetLocale}
        tabindex={isVisible ? 0 : -1}
        onclick={handleResetLocale}
        aria-label={`Reset ${targetLocale} fields`}
      >
        {#key resetFlashToken}
          <Eraser
            class={`bits-form__i18n-translation-source-icon ${resetFlashToken > 0 ? 'bits-form__i18n-translation-source-icon--flash' : ''}`}
          />
        {/key}
      </button>
    </div>
  {/if}
</div>
