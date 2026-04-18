// BITS
import { cx } from '$lib/bits/utils'

export const FORM_FEATURE_FIELDS_ROOT_CLASS =
  'flex flex-col items-stretch px-6 [&>*]:w-full'

export const FORM_FEATURE_FIELDS_NON_TRANSLATABLE_HEADER_CLASS = 'pt-4'

export const FORM_FEATURE_FIELDS_SECTION_CLASS = 'pb-3'

export const FORM_FEATURE_FIELDS_TRANSLATABLE_SECTION_CLASS = cx(
  'bits-form__i18n-section',
  FORM_FEATURE_FIELDS_SECTION_CLASS,
  'block w-full min-w-full self-stretch',
  '[&_.bits-form__i18n-section]:flex',
  '[&_.bits-form__i18n-section]:w-full',
  '[&_.bits-form__i18n-section]:min-w-full',
  '[&_.bits-form__i18n-section]:self-stretch',
  '[&_.bits-form__i18n-section]:flex-col',
)

export const FORM_FEATURE_FIELDS_TRANSLATABLE_GRID_CLASS = cx(
  'grid w-full grid-cols-3 gap-4',
  'max-[1200px]:grid-cols-2',
  'max-[900px]:grid-cols-1',
)

export const FORM_FEATURE_FIELDS_TRANSLATABLE_CARD_CLASS =
  'bits-form__i18n-card w-full min-w-0 max-w-none'
