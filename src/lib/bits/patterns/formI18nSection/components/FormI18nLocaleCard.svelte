<script lang="ts">
import FormI18nTranslationBar from './FormI18nTranslationBar.svelte'
import type { FormI18nLocaleCardProps } from '../formI18nSection.types'

let {
  locale,
  cardClass = 'bits-form__i18n-card',
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  isEditing = false,
  children,
  footer,
}: FormI18nLocaleCardProps = $props()

let isTranslationBarVisible = $state(false)
let hoverTimer = $state<ReturnType<typeof setTimeout> | null>(null)

function clearHoverTimer(): void {
  if (!hoverTimer) return
  clearTimeout(hoverTimer)
  hoverTimer = null
}

function handleMouseEnter(): void {
  if (!isEditing) return
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
  if (!isEditing) return
  clearHoverTimer()
  isTranslationBarVisible = true
}

function handleFocusOut(): void {
  clearHoverTimer()
  isTranslationBarVisible = false
}

$effect(() => {
  if (!isEditing) {
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
  <div class="bits-form__i18n-card-content">{@render children?.(locale)}</div>
  {#if footer}
    <div class="bits-form__i18n-card-footer">{@render footer(locale)}</div>
  {/if}
  <FormI18nTranslationBar
    targetLocale={locale}
    {localeCodeClass}
    {onTranslate}
    {isEditing}
    isVisible={isTranslationBarVisible}
  />
</article>
