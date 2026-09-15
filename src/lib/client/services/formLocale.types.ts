// TYPES

/* ----------------- */
// USERS :: JSON TYPE OBJECTS
/* -------- */

// JSON type objects for user preferences and experimental features

type I18nFormInputShape = {
  data: {
    i18n: Record<string, unknown>
  }
}

type FormLocaleKey<TForm extends I18nFormInputShape> = keyof TForm['data']['i18n']

export type FormLocaleInput<TForm extends I18nFormInputShape> =
  TForm['data']['i18n'][FormLocaleKey<TForm>]

export type FormLocaleSource<TForm extends I18nFormInputShape> =
  | Partial<FormLocaleInput<TForm>>
  | null
  | undefined
