<script lang="ts">
import { fade } from 'svelte/transition'
import { localeCodes, supportedLocales } from '$lib/enums'
import type { Locale } from '$lib/types'
import AlertCircle from 'virtual:icons/lucide/alert-circle'
import Languages from 'virtual:icons/lucide/languages'
import LoaderCircle from 'virtual:icons/lucide/loader-circle'
import type { FormSectionProps } from '../formI18nSection.types'

type Props = Pick<FormSectionProps, 'localeCodeClass' | 'onTranslate'> & {
  targetLocale: Locale
  isVisible?: boolean
  isEditing?: boolean
}

let {
  targetLocale,
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  isVisible = false,
  isEditing = false,
}: Props = $props()

let status = $state<'idle' | 'loading' | 'error'>('idle')
let loadingLocale = $state<Locale | null>(null)
let errorResetTimer = $state<ReturnType<typeof setTimeout> | null>(null)

const sourceLocales = $derived(
  supportedLocales.filter(locale => locale !== targetLocale) as Locale[],
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
    await onTranslate(sourceLocale, targetLocale)
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
    </div>
  {/if}
</div>
