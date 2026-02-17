<script lang="ts">
import { getLocale, getLocaleOrder } from '$lib/i18n'
import type { Locale } from '$lib/types'
import type { FormI18nSectionProps } from './formI18nSection.types'
import * as FormI18nSectionPrimitive from './components'

let {
  title,
  subtitle,
  preferredLocale = getLocale(),
  locales,
  class: className = '',
  gridClass = '',
  cardClass = 'bits-form__i18n-card',
  localeCodeClass = 'bits-form__i18n-locale-code',
  onTranslate,
  isEditing = false,
  headerActions,
  flags = [],
  actions = [],
  triggers = [],
  left,
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
    {right}
  />

  <div class={resolvedGridClass}>
    {#each orderedLocales as locale (locale)}
      <FormI18nSectionPrimitive.FormSection
        locale={locale as Locale}
        {cardClass}
        {localeCodeClass}
        {onTranslate}
        {isEditing}
        showTranslationBar={true}
        {children}
        {footer}
      />
    {/each}
  </div>
</section>
