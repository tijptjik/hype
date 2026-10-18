import { cx } from '#lib/bits/utils.js'

// Resource tabs share Profile's workspace without changing other field consumers.
export const resourceTabsStyles = cx(
  String.raw`[&_.bits-form\_\_capabilities-search]:w-[calc(100%-3rem)] [&_.bits-form\_\_capabilities-search]:max-w-3xl`,
  String.raw`[&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)]:flex [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)]:flex-col [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)]:gap-0 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)]:px-6 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)]:pt-0`,
  String.raw`[&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:min-h-14 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:rounded-none [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:border-0 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:border-b [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:border-border/40 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article):last-child]:border-b-0 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)>:is(div,article)]:bg-transparent`,
  String.raw`[&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)_.bits-card\_\_media]:size-10 [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)_.bits-card\_\_media]:self-center [&_:is(.bits-form\_\_capabilities-list,.bits-project-capabilities\_\_list)_.bits-card\_\_media]:bg-transparent`,
  String.raw`[&_.bits-project-fields\_\_empty]:px-6 [&_.bits-form\_\_capabilities-empty]:px-6 [&_.bits-project-fields\_\_empty-title]:font-sans [&_.bits-form\_\_capabilities-empty-title]:font-sans [&_.bits-project-fields\_\_empty-title]:text-lg [&_.bits-form\_\_capabilities-empty-title]:text-lg`,
  String.raw`[&_.bits-project-capabilities\_\_list>.bits-card]:bg-none [&_.bits-project-capabilities\_\_list>.bits-card]:before:hidden [&_.bits-project-capabilities\_\_list>.bits-card]:shadow-none [&_.bits-project-capabilities\_\_list>.bits-card]:outline-none`,
  // Field definitions become flush sections, with a quiet secondary header per field.
  '[&_[id^=property-wrapper-]]:border-b [&_[id^=property-wrapper-]]:border-border/40 [&_[id^=property-wrapper-]:last-child]:border-b-0 [&_section>header+div.flex]:gap-0',
  '[&_.bits-project-field-card]:pb-6',
  String.raw`[&_.bits-project-field-card\_\_i18n-grid]:gap-0 [&_.bits-project-field-card\_\_i18n-grid]:grid-cols-1 md:[&_.bits-project-field-card\_\_i18n-grid]:grid-cols-3 [&_.bits-project-field-card\_\_i18n-card]:shadow-none`,
  '[&_[data-locale-code]]:text-base [&_[data-locale-code]]:font-medium [&_[data-locale-code]]:tracking-normal [&_[data-locale-code]]:text-muted-foreground',
  String.raw`[&_.bits-project-field-card\_\_header]:rounded-none [&_.bits-project-field-card\_\_header]:border-0 [&_.bits-project-field-card\_\_header]:border-b [&_.bits-project-field-card\_\_header]:border-border/40 [&_.bits-project-field-card\_\_header]:bg-primary/3 [&_.bits-project-field-card\_\_header]:px-6`,
  String.raw`[&_.bits-project-field-card\_\_body]:rounded-none [&_.bits-project-field-card\_\_body]:pt-0`,
)
