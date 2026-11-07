// BITS
import { cx } from '#lib/bits/utils.js'

// Fields share the resource workspace: three columns with regular form labels and the shared resource control appearance.
export const FORM_FEATURE_FIELDS_ROOT_CLASS = cx(
  'flex flex-col items-stretch [&>*]:w-full',
  String.raw`[&_.bits-feature-fields\_\_grid]:grid-cols-1 @min-[640px]:[&_.bits-feature-fields\_\_grid]:grid-cols-2 @min-[1050px]:[&_.bits-feature-fields\_\_grid]:grid-cols-3 [&_.bits-feature-fields\_\_grid]:gap-0`,
  '[&_.bits-feature-field]:rounded-none [&_.bits-feature-field]:border-0 [&_.bits-feature-field]:border-b [&_.bits-feature-field]:border-border/50 [&_.bits-feature-field]:bg-transparent [&_.bits-feature-field]:shadow-none [&_.bits-feature-field]:before:hidden',
  // Carry column dividers through the full field.
  '@min-[640px]:@max-[1050px]:[&_.bits-feature-field:nth-child(odd)]:border-r @min-[1050px]:[&_.bits-feature-field:not(:nth-child(3n))]:border-r',
  String.raw`[&_.bits-feature-field\_\_subtitle]:hidden`,
  // Match inline resource fields in both modes; the parent owns the label spacing.
  String.raw`[&_.bits-feature-field_.bits-form\_\_control-wrap]:bg-transparent! [&_.bits-feature-field_.bits-form\_\_control-wrap]:min-h-10 [&_.bits-feature-field_.bits-form\_\_control-wrap]:rounded-md! [&_.bits-feature-field_.bits-form\_\_control-wrap]:shadow-none! [&_.bits-feature-field_.bits-form\_\_control-wrap--editing]:border-border/30 [&_.bits-feature-field_.bits-form\_\_control-wrap--editing:hover]:border-border/60 [&_.bits-feature-field_.bits-form\_\_control-wrap--editing:focus-within]:border-primary/70`,
  String.raw`[&_.bits-feature-field_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--editing)]:border-transparent! [&_.bits-feature-field_.bits-form\_\_control-wrap:not(.bits-form\_\_control-wrap--editing)]:ring-0!`,
  String.raw`[&_.bits-feature-field_.bits-form\_\_control--input]:h-10 [&_.bits-feature-field_.bits-form\_\_field]:gap-0 [&_.bits-feature-field_.bits-form\_\_select-display]:min-h-10 [&_.bits-feature-field_.bits-form\_\_select-display]:py-2`,
)

export const FORM_FEATURE_FIELDS_SECTION_CLASS = 'pb-12'

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
  // Locale cards keep separators when their grid wraps to two or one columns.
  '[&>article]:border-0 [&>article]:border-border',
  'min-[1200px]:[&>article:not(:nth-child(3n+1))]:border-l min-[1200px]:[&>article:nth-child(n+4)]:border-t',
  'min-[900px]:max-[1200px]:[&>article:nth-child(even)]:border-l min-[900px]:max-[1200px]:[&>article:nth-child(n+3)]:border-t',
  'max-[900px]:[&>article+article]:border-t',
)

export const FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS =
  'bits-form__i18n-card w-full min-w-0 max-w-none'
