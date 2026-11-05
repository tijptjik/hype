// TYPES
import type { FormBooleanValue, GenAiField } from '#lib/client/services/form.types.js'

/** Partial remote-form snapshots can omit any dynamically selected locale. */
export type DescriptorData = {
  i18n?: Partial<
    Record<
      string,
      Partial<Record<GenAiField, string | null>> &
        Partial<Record<`${GenAiField}Gen`, FormBooleanValue>>
    >
  >
}

/** Configure a translated profile or policy field using the shared inline editor. */
export type DescriptorFieldConfig = {
  key: GenAiField
  label: string
  kind: 'input' | 'textarea'
  markdown?: boolean
  readonly?: boolean
  ariaLabel?: string
  renderHtml?: boolean
}
