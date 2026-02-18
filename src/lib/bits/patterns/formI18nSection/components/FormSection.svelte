<script lang="ts">
import FormI18nTranslationBar from './FormI18nTranslationBar.svelte'
import type { Locale } from '$lib/types'
import type { Snippet } from 'svelte'
import type { FormSectionProps } from '../formI18nSection.types'

let {
  locale,
  cardClass = 'bits-form__i18n-card',
  contentClass = 'bits-form__i18n-card-content',
  footerClass = 'bits-form__i18n-card-footer',
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  onResetLocale,
  isEditing = false,
  showTranslationBar = false,
  children,
  footer,
}: FormSectionProps = $props()

let isTranslationBarVisible = $state(false)
let hoverTimer = $state<ReturnType<typeof setTimeout> | null>(null)
const hasLocale = $derived(locale != null)
const showsTranslationBar = $derived(showTranslationBar && hasLocale)

function clearHoverTimer(): void {
  if (!hoverTimer) return
  clearTimeout(hoverTimer)
  hoverTimer = null
}

function handleMouseEnter(): void {
  if (!isEditing || !showsTranslationBar) return
  clearHoverTimer()
  hoverTimer = setTimeout(() => {
    isTranslationBarVisible = true
    hoverTimer = null
  }, 800)
}

function handleMouseLeave(): void {
  clearHoverTimer()
  isTranslationBarVisible = false
}

function handleFocusIn(): void {
  if (!isEditing || !showsTranslationBar) return
  clearHoverTimer()
  isTranslationBarVisible = true
}

function handleFocusOut(): void {
  clearHoverTimer()
  isTranslationBarVisible = false
}

$effect(() => {
  if (!isEditing || !showsTranslationBar) {
    clearHoverTimer()
    isTranslationBarVisible = false
  }
})

$effect(() => {
  return () => {
    clearHoverTimer()
  }
})
</script>

<article
  class={cardClass}
  data-locale={locale}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <div class={contentClass}>
    {#if hasLocale}
      {@render (children as Snippet<[Locale]>)?.(locale as Locale)}
    {:else}
      {@render (children as Snippet)?.()}
    {/if}
  </div>
  {#if footer}
    <div class={footerClass}>
      {#if hasLocale}
        {@render (footer as Snippet<[Locale]>)?.(locale as Locale)}
      {:else}
        {@render (footer as Snippet)?.()}
      {/if}
    </div>
  {/if}
  {#if showsTranslationBar}
    <FormI18nTranslationBar
      targetLocale={locale as Locale}
      {localeCodeClass}
      {onTranslate}
      {onResetLocale}
      {isEditing}
      isVisible={isTranslationBarVisible}
    />
  {/if}
</article>
