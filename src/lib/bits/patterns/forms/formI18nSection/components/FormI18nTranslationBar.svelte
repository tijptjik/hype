<script lang="ts">
import LocaleSourceStrip from '#lib/bits/custom/localeControls/LocaleSourceStrip.svelte'
import { fade } from 'svelte/transition'
import { localeCodes, supportedLocales } from '#lib/enums.js'
import type { Locale } from '#lib/types.js'
import AlertCircle from 'virtual:icons/proicons/alert-circle'
import Eraser from 'virtual:icons/proicons/eraser'
import Languages from 'virtual:icons/tabler/language'
import LoaderCircle from 'virtual:icons/proicons/spinner'
import { m, toLocaleKey } from '#lib/i18n.js'
import type { FormSectionProps } from '../formI18nSection.types'

type Props = Pick<
  FormSectionProps,
  'localeCodeClass' | 'onTranslate' | 'onResetLocale' | 'sectionKey'
> & {
  compact?: boolean
  availableLocales?: Locale[]
  targetLocale: Locale
  isVisible?: boolean
  isEditing?: boolean
  positionStyle?: string
}

let {
  compact = false,
  availableLocales = supportedLocales,
  targetLocale,
  localeCodeClass = 'absolute right-5.5 top-4 text-2xl font-bold uppercase text-muted-foreground',
  onTranslate,
  onResetLocale,
  sectionKey,
  isVisible = false,
  isEditing = false,
  positionStyle = '',
}: Props = $props()

let status = $state<'idle' | 'loading' | 'error'>('idle')
let loadingLocale = $state<Locale | null>(null)
let errorResetTimer = $state<ReturnType<typeof setTimeout> | null>(null)
let resetFlashToken = $state(0)

const sourceLocales = $derived(
  availableLocales.filter(locale => locale !== targetLocale),
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

{#if compact}
  <div
    class="text-muted-foreground flex min-h-12 min-w-0 items-center gap-2 text-xs"
    aria-busy={isLoading}
  >
    <Languages class="size-4 shrink-0" />
    <span class="shrink-0">{m.address_translate_from()}</span>
    <LocaleSourceStrip>
      {#each sourceLocales as sourceLocale}
        <button
          type="button"
          class="hover:bg-primary/10 hover:text-primary focus-visible:outline-primary rounded px-1.5 py-1 font-mono focus-visible:outline-2"
          aria-label={`Translate from ${sourceLocale} to ${targetLocale}`}
          disabled={!onTranslate || isLoading}
          onclick={event => handleTranslate(event, sourceLocale)}
        >
          {sourceLocale === 'zh-hant'
            ? '繁中'
            : sourceLocale === 'zh-hans'
              ? '简中'
              : 'EN'}
        </button>
      {/each}
    </LocaleSourceStrip>
    {#if isLoading}
      <LoaderCircle class="size-4 animate-spin" />
    {/if}
    {#if status === 'error'}
      <span role="alert">{m.address_translate_error()}</span>
    {/if}
  </div>
{:else}
  <div class="bits-form__i18n-translation max-w-full" style={positionStyle}>
    <div data-locale-code class={localeCodeClass}>
      {#key status}
        {#if status === 'loading'}
          <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
            <LoaderCircle
              class="bits-form__i18n-translation-status-icon animate-spin"
            />
          </span>
        {:else if status === 'error'}
          <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
            <AlertCircle
              class="bits-form__i18n-translation-status-icon bits-form__i18n-translation-status-icon--error"
            />
          </span>
        {:else}
          <span in:fade={{ duration: 250 }} out:fade={{ duration: 250 }}>
            {localeCodes[toLocaleKey(targetLocale)]}
          </span>
        {/if}
      {/key}
    </div>

    {#if isEditing && !isLoading}
      <div
        class={`bits-form__i18n-translation-bar max-w-full min-w-0 ${isVisible ? 'bits-form__i18n-translation-bar--visible' : ''}`}
      >
        <div
          class="text-muted-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center text-sm"
        >
          <Languages />
        </div>
        <LocaleSourceStrip>
          {#each sourceLocales as sourceLocale (sourceLocale)}
            <button
              type="button"
              class="bits-form__i18n-translation-source focus-override focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
              aria-label={`Translate from ${sourceLocale} to ${targetLocale}`}
              title={`Translate from ${sourceLocale} to ${targetLocale}`}
              disabled={!onTranslate}
              tabindex={isVisible ? 0 : -1}
              onclick={event => handleTranslate(event, sourceLocale)}
            >
              {localeCodes[toLocaleKey(sourceLocale)] ?? sourceLocale.toUpperCase()}
            </button>
          {/each}
        </LocaleSourceStrip>
        <button
          type="button"
          class="bits-form__i18n-translation-source focus-override focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
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
{/if}
