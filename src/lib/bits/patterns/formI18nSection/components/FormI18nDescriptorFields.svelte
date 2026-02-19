<script lang="ts">
import { m } from '$lib/i18n'
import { getGenAiState, toggleGenAiField } from '$lib/client/services/form'
import { toIssueMessages } from '$lib/utils/form-schema'
import { TextArea, TextInput } from '$lib/bits/custom/form'
import type { GenAiField, Locale } from '$lib/types'

type DescriptorFieldConfig = {
  key: GenAiField
  label: string
  kind: 'input' | 'textarea'
}

const fieldConfigs: DescriptorFieldConfig[] = [
  { key: 'name', label: m.admin__forms_common_name_full(), kind: 'input' },
  { key: 'nameShort', label: m.admin__forms_common_name_short(), kind: 'input' },
  { key: 'description', label: m.feature__description(), kind: 'textarea' },
]

let {
  form,
  fields,
  formLocale,
  locale,
  isEditing = false,
  isRequiredInPreflight,
}: {
  form: any
  fields: any
  formLocale: string
  locale: Locale
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
} = $props()
</script>

{#each fieldConfigs as config (config.key)}
  {@const field = fields[config.key]}
  {@const attrs = field.as('text')}
  {@const required = isRequiredInPreflight(['data', 'i18n', formLocale, config.key])}
  {@const issues = toIssueMessages(field.issues())}

  {#if config.kind === 'textarea'}
    <TextArea
      label={config.label}
      {locale}
      isTranslated={true}
      {required}
      {isEditing}
      isGenAI={getGenAiState(form, locale, config.key)}
      onToggleGenAI={() => toggleGenAiField(form, locale, config.key)}
      value={(attrs as { value?: string }).value ?? ''}
      {issues}
      textareaAttrs={attrs as Record<string, unknown>}
    />
  {:else}
    <TextInput
      label={config.label}
      {locale}
      isTranslated={true}
      {required}
      {isEditing}
      isGenAI={getGenAiState(form, locale, config.key)}
      onToggleGenAI={() => toggleGenAiField(form, locale, config.key)}
      value={(attrs as { value?: string }).value ?? ''}
      {issues}
      inputAttrs={attrs as Record<string, unknown>}
    />
  {/if}
{/each}
