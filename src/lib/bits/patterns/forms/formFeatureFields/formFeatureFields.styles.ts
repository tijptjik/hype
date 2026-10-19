// BITS
import { cx } from '#lib/bits/utils.js'

// Fields share the resource workspace: quiet rows, full labels, and themed controls.
export const FORM_FEATURE_FIELDS_ROOT_CLASS = cx(
  'flex flex-col items-stretch [&>*]:w-full',
  String.raw`[&_.bits-feature-fields\_\_grid]:grid-cols-1 [&_.bits-feature-fields\_\_grid]:gap-0`,
  String.raw`[&_.bits-feature-field_.bits-form\_\_control-wrap]:border [&_.bits-feature-field_.bits-form\_\_control-wrap]:border-border/60 [&_.bits-feature-field_.bits-form\_\_select-display-wrap]:border [&_.bits-feature-field_.bits-form\_\_select-display-wrap]:border-border/60 [&_.bits-feature-field_.bits-form\_\_select-display-wrap]:bg-foreground/4`,
  '[&_.bits-feature-field]:rounded-none [&_.bits-feature-field]:border-0 [&_.bits-feature-field]:border-b [&_.bits-feature-field]:border-border/50 [&_.bits-feature-field]:bg-transparent [&_.bits-feature-field]:shadow-none [&_.bits-feature-field]:before:hidden [&_.bits-feature-field:last-child]:border-b-0',
  String.raw`[&_.bits-feature-field\_\_content]:grid-cols-1 @min-[600px]:[&_.bits-feature-field\_\_content]:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)] [&_.bits-feature-field\_\_content]:gap-3 [&_.bits-feature-field\_\_content]:px-0 [&_.bits-feature-field\_\_content]:py-5 [&_.bits-feature-field\_\_content>div:first-child]:max-w-none`,
  String.raw`[&_.bits-feature-field\_\_title]:whitespace-normal [&_.bits-feature-field\_\_title]:text-sm [&_.bits-feature-field\_\_title]:leading-5 [&_.bits-feature-field\_\_subtitle]:text-muted-foreground`,
  String.raw`[&_.bits-feature-field_.bits-form\_\_control-wrap]:shadow-none [&_.bits-feature-field_.bits-form\_\_select-display-wrap]:shadow-none`,
)

export const FORM_FEATURE_FIELDS_NON_TRANSLATABLE_HEADER_CLASS = ''

export const FORM_FEATURE_FIELDS_SECTION_CLASS = 'px-6 pb-6'

export const FORM_FEATURE_FIELDS_TRANSLATABLE_SECTION_CLASS = cx(
  'bits-form__i18n-section',
  'pb-6',
  'block w-full min-w-full self-stretch',
  '[&_.bits-form__i18n-section]:flex',
  '[&_.bits-form__i18n-section]:w-full',
  '[&_.bits-form__i18n-section]:min-w-full',
  '[&_.bits-form__i18n-section]:self-stretch',
  '[&_.bits-form__i18n-section]:flex-col',
)

export const FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS = cx(
  'grid w-full grid-cols-3 gap-0',
  'max-[1200px]:grid-cols-2',
  'max-[900px]:grid-cols-1',
)

export const FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS =
  'bits-form__i18n-card w-full min-w-0 max-w-none'
