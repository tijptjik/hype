<script lang="ts">
import { getLocaleKey, getLocaleOrder } from '$lib/i18n'
import type { FormI18nSectionProps } from './formI18nSection.types'
import * as FormI18nSectionPrimitive from './components'

let {
  title,
  subtitle,
  preferredLocale = getLocaleKey(),
  locales,
  class: className = '',
  gridClass = '',
  cardClass = 'bits-form__i18n-card',
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  onResetLocale,
  sectionKey,
  isEditing = false,
  headerActions,
  flags = [],
  actions = [],
  triggers = [],
  left,
  center,
  right,
  children,
  footer,
}: FormI18nSectionProps = $props()

const orderedLocales = $derived(locales ?? getLocaleOrder(preferredLocale))

const rootClass = $derived(
  ['bits-form__i18n-section', className].filter(Boolean).join(' '),
)

const resolvedGridClass = $derived(
  ['bits-form__i18n-grid', gridClass].filter(Boolean).join(' '),
)
</script>

<section class={rootClass}>
  <FormI18nSectionPrimitive.Header
    {title}
    {subtitle}
    {headerActions}
    {flags}
    {actions}
    {triggers}
    {left}
    {center}
    {right}
  />

  <div class={resolvedGridClass}>
    {#each orderedLocales as locale (locale)}
      <FormI18nSectionPrimitive.FormSection
        {locale}
        {cardClass}
        {localeCodeClass}
        {onTranslate}
        {onResetLocale}
        {sectionKey}
        {isEditing}
        showTranslationBar={true}
        {children}
        {footer}
      />
    {/each}
  </div>
</section>
