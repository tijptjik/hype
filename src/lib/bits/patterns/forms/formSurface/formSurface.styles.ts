import { cx } from '#lib/bits/utils.js'

// Shared by resolved sections and their loading placeholders.
export const formSectionDividerStyles =
  'border-t-[length:var(--admin-form-divider-width,3px)] border-border [border-image:var(--admin-form-divider,linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_45%,var(--form-workspace)),color-mix(in_oklab,var(--color-secondary)_45%,var(--form-workspace)))_1)]'

// The workspace meets the sidebar edge; section padding owns the content inset.
const surface =
  'mb-6 w-full min-w-0 shrink-0 bg-[var(--form-workspace)] text-foreground'

// Section headings establish hierarchy above compact locale columns and metadata.
const sections = cx(
  String.raw`[&_.bits-form\_\_i18n-card.no-i18n]:pt-4`,
  String.raw`[&_.bits-form\_\_section-header_.bits-header--with-icon]:grid-cols-[1.5rem_minmax(0,1fr)] [&_.bits-form\_\_section-header_.bits-header\_\_icon-wrap]:size-6 [&_.bits-form\_\_section-header_.bits-header\_\_title]:tracking-tight`,
  String.raw`[&_.bits-form\_\_section-header_.bits-header\_\_icon-wrap]:text-primary [&_.bits-form\_\_section-header_.bits-header\_\_title]:font-semibold`,
  String.raw`[&_.bits-form\_\_i18n-card[data-locale]]:pt-5`,
  String.raw`[&_.bits-form\_\_section-header-left]:pl-0`,
  String.raw`[&_.bits-form\_\_section-header]:bg-[var(--admin-form-heading,color-mix(in_oklab,var(--color-primary)_12%,var(--form-workspace)))] [&_.bits-form\_\_section-header]:border-b [&_.bits-form\_\_section-header]:border-primary/25`,
  String.raw`[&_.bits-form\_\_section]:rounded-none [&_.bits-form\_\_i18n-section]:rounded-none [&_.bits-form\_\_section]:pb-6`,
  String.raw`[&_.bits-form\_\_section-header]:px-6 [&_.bits-form\_\_section-header]:h-[68px] [&_.bits-form\_\_section-header]:min-h-[68px]`,
  String.raw`[&_.bits-form\_\_section-header_.bits-header\_\_title]:normal-case [&_.bits-form\_\_section-header_.bits-header\_\_title]:text-xl [&_.bits-form\_\_section-header_.bits-header\_\_subtitle]:text-xs [&_.bits-form\_\_section-header_.bits-header\_\_subtitle]:text-muted-foreground`,
  String.raw`[&_.bits-form\_\_i18n-grid]:border-0 [&_.bits-form\_\_i18n-grid]:rounded-none [&_.bits-form\_\_i18n-grid]:bg-transparent`,
  String.raw`[&_.bits-form\_\_i18n-card]:border-0 [&_.bits-form\_\_i18n-card]:rounded-none [&_.bits-form\_\_i18n-card]:bg-transparent [&_.bits-form\_\_i18n-card]:px-6 [&_.bits-form\_\_i18n-card]:pt-0 [&_.bits-form\_\_i18n-card]:pb-2`,
  String.raw`[&_.bits-form\_\_i18n-grid>article+article]:border-l [&_.bits-form\_\_i18n-grid>article+article]:border-border/70`,
  `[&_.no-i18n>div:first-child]:grid [&_.no-i18n>div:first-child]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] [&_.no-i18n>div:first-child]:gap-6`,
)

// Each member has one full-width row, with a stable avatar and role column.
// Plain rows let the dividers separate members without inset colour bands.
const members = cx(
  String.raw`[&_.bits-form\_\_user-card-actions-select_.bits-form\_\_select-label]:text-foreground [&_.bits-form\_\_user-card-actions-select_svg]:text-muted-foreground`,
  String.raw`[&_.bits-form\_\_section:has(.bits-form\_\_user-card-root)]:pb-4 [&_.bits-form\_\_user-card-root:last-child]:border-b-0`,
  String.raw`[&_.bits-form\_\_user-card-actions-slot]:justify-items-end [&_.bits-form\_\_user-card-actions-slot-content]:justify-end`,
  String.raw`[&_.bits-form\_\_user-card-actions-select]:text-foreground [&_.bits-form\_\_user-card-actions-select_.bits-form\_\_select-display]:text-foreground`,
  String.raw`[&_.bits-form\_\_user-card-root]:mx-6 [&_.bits-form\_\_user-card-root]:w-auto [&_.bits-form\_\_user-card-root]:max-w-none [&_.bits-form\_\_user-card-root]:min-h-14 [&_.bits-form\_\_user-card-root]:items-center [&_.bits-form\_\_user-card-root]:rounded-none [&_.bits-form\_\_user-card-root]:border-0 [&_.bits-form\_\_user-card-root]:border-b [&_.bits-form\_\_user-card-root]:bg-transparent [&_.bits-form\_\_user-card-root]:px-3`,
  String.raw`[&_.bits-form\_\_user-card-avatar]:self-center [&_.bits-form\_\_user-card-avatar]:size-8 [&_.bits-form\_\_user-card-avatar]:min-h-0 [&_.bits-form\_\_user-card-avatar]:rounded-full [&_.bits-form\_\_user-card-avatar]:overflow-hidden`,
  String.raw`[&_.bits-card\_\_code]:hidden [&_.bits-card\_\_title-text]:text-[15px] [&_.bits-form\_\_user-card-actions]:min-w-0 [&_.bits-form\_\_user-card-actions]:justify-end [&_.bits-form\_\_user-card-actions]:w-36 [&_.bits-form\_\_user-card-actions]:shrink-0`,
)

// Both modes keep identical field geometry; only borders, fills, and controls change.
const readMode = cx(
  String.raw`[&_.bits-form\_\_control]:text-[15px] [&_.bits-form\_\_control]:leading-[22px] [&_.bits-form\_\_label-text]:text-[color:color-mix(in_oklab,var(--color-foreground)_80%,var(--form-workspace))]`,
  String.raw`[&_.bits-form\_\_field]:gap-1 [&_textarea.bits-form\_\_control]:pt-2`,
  // Match the control's 1px border and two 8px padding insets in both modes.
  String.raw`[&_.bits-form\_\_label]:pl-[17px]`,
  String.raw`[&_.bits-form\_\_control:focus-visible]:shadow-none [&_.bits-form\_\_control:focus-visible]:outline-none [&_input:focus-visible]:ring-0 [&_input:focus-visible]:ring-offset-0 [&_textarea:focus-visible]:ring-0 [&_textarea:focus-visible]:ring-offset-0`,
  String.raw`[&_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--editing,.bits-form\_\_select-display-wrap)]:border-foreground/10 [&_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--editing,.bits-form\_\_select-display-wrap)]:bg-foreground/4 [&_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--editing,.bits-form\_\_select-display-wrap)]:shadow-none`,
  String.raw`[&_.bits-form\_\_control]:font-normal [&_input.bits-form\_\_control]:h-10`,
  String.raw`[&_.bits-form\_\_label-text]:leading-5 [&_.bits-form\_\_label-text]:text-[13px] [&_.bits-form\_\_label-text]:font-semibold`,
)

// Centre status buttons on single-line fields; textareas keep a top-aligned indicator.
const translationStatus = cx(
  // Locale and translation actions share one top-right header; its height never changes.
  String.raw`[&_.bits-form\_\_i18n-translation]:left-auto [&_.bits-form\_\_i18n-translation]:right-6 [&_.bits-form\_\_i18n-translation]:top-[10px] [&_.bits-form\_\_i18n-translation]:flex-row [&_.bits-form\_\_i18n-translation]:items-center [&_.bits-form\_\_i18n-translation]:rounded-md [&_.bits-form\_\_i18n-translation]:border [&_.bits-form\_\_i18n-translation]:border-transparent`,
  '[&_[data-locale-code]]:rounded-md [&_[data-locale-code]]:border [&_[data-locale-code]]:border-primary/20 [&_[data-locale-code]]:bg-primary/10 [&_[data-locale-code]]:text-foreground [&_[data-locale-code]]:text-xs [&_[data-locale-code]]:font-semibold [&_[data-locale-code]]:static [&_[data-locale-code]]:order-2 [&_[data-locale-code]]:flex [&_[data-locale-code]]:h-8 [&_[data-locale-code]]:w-10 [&_[data-locale-code]]:shrink-0 [&_[data-locale-code]]:items-center [&_[data-locale-code]]:justify-center',
  String.raw`[&_.bits-form\_\_i18n-translation:has(.bits-form\_\_i18n-translation-bar--visible)]:border-primary/20 [&_.bits-form\_\_i18n-translation:has(.bits-form\_\_i18n-translation-bar--visible)]:bg-[var(--form-control-edit-fill)]`,
  String.raw`[&_.bits-form\_\_i18n-translation-bar]:static [&_.bits-form\_\_i18n-translation-bar]:order-1 [&_.bits-form\_\_i18n-translation-bar]:mt-0 [&_.bits-form\_\_i18n-translation-bar]:transform-none [&_.bits-form\_\_i18n-translation-bar]:rounded-none [&_.bits-form\_\_i18n-translation-bar]:border-0 [&_.bits-form\_\_i18n-translation-bar]:bg-transparent [&_.bits-form\_\_i18n-translation-bar]:shadow-none`,
  String.raw`[&_.bits-form\_\_control-wrap--editing:focus-within]:border-primary/70 [&_.bits-form\_\_control-wrap--editing:focus-within]:ring-2 [&_.bits-form\_\_control-wrap--editing:focus-within]:ring-primary/20`,
  String.raw`[&_.bits-form\_\_gen-ai-wrap]:flex [&_.bits-form\_\_gen-ai_svg]:mt-0`,
  String.raw`[&_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--textarea)_.bits-form\_\_gen-ai-wrap]:top-1/2 [&_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--textarea)_.bits-form\_\_gen-ai-wrap]:-translate-y-1/2`,
)

// Member lookup uses the same gutters and quiet surfaces as the member list.
const memberSearch = cx(
  '[&_.bits-search-bar_input]:h-10 [&_.bits-search-bar_input:focus-visible]:ring-0 [&_.bits-search-bar_input:focus-visible]:ring-offset-0 [&_.bits-search-bar_input:focus-visible]:outline-none',
  String.raw`[&_.bits-search\_\_results]:mx-0 [&_.bits-search\_\_results]:px-0 [&_.bits-search\_\_results>div]:border [&_.bits-search\_\_results>div]:border-border [&_.bits-search\_\_results>div]:bg-panel [&_.bits-search\_\_results>div]:p-1 [&_.bits-search\_\_results>div]:shadow-lg`,
  '[&_.bits-search-result-item]:min-h-14 [&_.bits-search-result-item]:rounded-md [&_.bits-search-result-item]:py-2 [&_.bits-search-result-item:focus-visible]:ring-0 [&_.bits-search-result-item:focus-visible]:ring-offset-0 [&_.bits-search-result-item:focus-visible]:bg-primary/10',
  String.raw`[&_.bits-search-result-item\_\_avatar]:size-8 [&_.bits-search-result-item\_\_fallback]:size-8 [&_.bits-search-result-item\_\_fallback]:text-sm [&_.bits-search-result-item\_\_image]:size-8`,
)

export const formSurfaceStyles = cx(
  surface,
  sections,
  members,
  readMode,
  translationStatus,
  memberSearch,
  // Project selectors and licence summaries follow the same section gutters.
  String.raw`[&_.bits-form\_\_parent-resource-list]:mx-6 [&_.bits-form\_\_parent-resource-list]:w-auto [&_.bits-form\_\_parent-resource-search]:mx-6 [&_.bits-license\_\_cards]:mx-6`,
)

// Paired resource selections use quiet rows with equal thumbnails and section gutters.
export const formSelectionSectionStyles = cx(
  'h-full',
  String.raw`[&_.bits-form\_\_parent-resource-list]:pt-6`,
  '[&_article]:h-24 [&_article]:min-h-24 [&_article]:flex-nowrap [&_article]:items-center [&_article]:gap-4 [&_article]:rounded-none [&_article]:border-0 [&_article]:bg-transparent [&_article]:bg-none [&_article]:shadow-none [&_article]:backdrop-filter-none [&_article]:before:hidden',
  String.raw`[&_:is(.bits-card\_\_media,.bits-map-style-card\_\_preview)]:size-24 [&_:is(.bits-card\_\_media,.bits-map-style-card\_\_preview)]:min-w-24 [&_:is(.bits-card\_\_media,.bits-map-style-card\_\_preview)]:shrink-0 [&_:is(.bits-card\_\_media,.bits-map-style-card\_\_preview)]:rounded-lg`,
  String.raw`[&_.bits-card\_\_body]:px-0 [&_.bits-card\_\_body]:py-0`,
)
