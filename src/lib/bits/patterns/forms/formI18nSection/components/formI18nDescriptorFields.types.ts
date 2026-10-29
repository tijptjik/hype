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
