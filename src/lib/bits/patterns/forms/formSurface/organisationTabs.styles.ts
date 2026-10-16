import { cx } from '#lib/bits/utils.js'

// Organisation tabs share Profile's workspace without changing other field consumers.
export const organisationTabsStyles = cx(
  String.raw`[&_.bits-form\_\_capabilities-search]:w-[calc(100%-3rem)] [&_.bits-form\_\_capabilities-search]:max-w-3xl`,
  String.raw`[&_.bits-form\_\_capabilities-list]:flex [&_.bits-form\_\_capabilities-list]:flex-col [&_.bits-form\_\_capabilities-list]:gap-0 [&_.bits-form\_\_capabilities-list]:px-6 [&_.bits-form\_\_capabilities-list]:pt-0`,
  String.raw`[&_.bits-form\_\_capabilities-list>div]:min-h-14 [&_.bits-form\_\_capabilities-list>div]:rounded-none [&_.bits-form\_\_capabilities-list>div]:border-0 [&_.bits-form\_\_capabilities-list>div]:border-b [&_.bits-form\_\_capabilities-list>div]:border-border/40 [&_.bits-form\_\_capabilities-list>div:last-child]:border-b-0 [&_.bits-form\_\_capabilities-list>div]:bg-transparent`,
  String.raw`[&_.bits-form\_\_capabilities-list_.bits-card\_\_media]:size-10 [&_.bits-form\_\_capabilities-list_.bits-card\_\_media]:self-center [&_.bits-form\_\_capabilities-list_.bits-card\_\_media]:bg-transparent`,
  String.raw`[&_.bits-project-fields\_\_empty]:px-6 [&_.bits-form\_\_capabilities-empty]:px-6 [&_.bits-project-fields\_\_empty-title]:font-sans [&_.bits-form\_\_capabilities-empty-title]:font-sans [&_.bits-project-fields\_\_empty-title]:text-lg [&_.bits-form\_\_capabilities-empty-title]:text-lg`,
  // Field definitions become flush sections, with a quiet secondary header per field.
  '[&_[id^=property-wrapper-]]:border-b [&_[id^=property-wrapper-]]:border-border/40 [&_[id^=property-wrapper-]:last-child]:border-b-0 [&_section>header+div.flex]:gap-0',
  '[&_.bits-project-field-card]:pb-6',
  String.raw`[&_.bits-project-field-card\_\_i18n-grid]:gap-0 [&_.bits-project-field-card\_\_i18n-grid]:grid-cols-1 md:[&_.bits-project-field-card\_\_i18n-grid]:grid-cols-3 [&_.bits-project-field-card\_\_i18n-card]:shadow-none`,
  '[&_[data-locale-code]]:text-base [&_[data-locale-code]]:font-medium [&_[data-locale-code]]:tracking-normal [&_[data-locale-code]]:text-muted-foreground',
  String.raw`[&_.bits-project-field-card\_\_header]:rounded-none [&_.bits-project-field-card\_\_header]:border-0 [&_.bits-project-field-card\_\_header]:border-b [&_.bits-project-field-card\_\_header]:border-border/40 [&_.bits-project-field-card\_\_header]:bg-primary/3 [&_.bits-project-field-card\_\_header]:px-6`,
  String.raw`[&_.bits-project-field-card\_\_body]:rounded-none [&_.bits-project-field-card\_\_body]:pt-0`,
)
