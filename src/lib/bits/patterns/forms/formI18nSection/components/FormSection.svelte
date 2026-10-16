<script lang="ts">
import { toLocaleKebab } from '#lib/i18n.js'
import FormI18nTranslationBar from './FormI18nTranslationBar.svelte'
import type { LocaleKey } from '#lib/types.js'
import type { Snippet } from 'svelte'
import type { FormSectionProps } from '../formI18nSection.types'

let {
  locale,
  cardClass = 'bits-form__i18n-card',
  contentClass = 'flex flex-col gap-4 pb-2 pt-2',
  footerClass = 'mt-auto pt-4',
  localeCodeClass = 'absolute right-5.5 top-4 text-2xl font-bold uppercase text-muted-foreground',
  onTranslate,
  onResetLocale,
  sectionKey,
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
      {@render (children as Snippet<[LocaleKey]>)?.(locale as LocaleKey)}
    {:else}
      {@render (children as Snippet)?.()}
    {/if}
  </div>
  {#if footer}
    <div class={footerClass}>
      {#if hasLocale}
        {@render (footer as Snippet<[LocaleKey]>)?.(locale as LocaleKey)}
      {:else}
        {@render (footer as Snippet)?.()}
      {/if}
    </div>
  {/if}
  {#if showsTranslationBar && locale}
    <FormI18nTranslationBar
      targetLocale={toLocaleKebab(locale)}
      {localeCodeClass}
      {onTranslate}
      {onResetLocale}
      {sectionKey}
      {isEditing}
      isVisible={isTranslationBarVisible}
    />
  {/if}
</article>
