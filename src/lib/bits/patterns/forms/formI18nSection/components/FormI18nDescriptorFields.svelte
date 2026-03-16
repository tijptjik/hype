<script lang="ts">
import { m } from '$lib/i18n'
import { getGenAiState, toggleGenAiField } from '$lib/client/services/form'
import { TextArea, TextInput } from '$lib/bits/custom/form'
import type { GenAiField, LocaleKey } from '$lib/types'

type DescriptorFieldConfig = {
  key: GenAiField
  label: string
  kind: 'input' | 'textarea'
}

const defaultFieldConfigs: DescriptorFieldConfig[] = [
  { key: 'name', label: m.admin__forms_common_name_full(), kind: 'input' },
  { key: 'nameShort', label: m.admin__forms_common_name_short(), kind: 'input' },
  { key: 'description', label: m.feature__description(), kind: 'textarea' },
]

let {
  form,
  fields,
  locale,
  isEditing = false,
  isRequiredInPreflight,
  fieldConfigs = defaultFieldConfigs,
}: {
  form: any
  fields: any
  locale: LocaleKey
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  fieldConfigs?: DescriptorFieldConfig[]
} = $props()
</script>

{#each fieldConfigs as config (config.key)}
  {@const field = fields[config.key]}
  {@const genField = fields[`${config.key}Gen`]}
  {@const attrs = field.as(config.kind === 'textarea' ? 'textarea' : 'text')}
  {@const genValue = getGenAiState(form, locale, config.key)}
  {@const genAttrs = genField?.as('hidden', genValue ? 'true' : 'false')}
  {@const required = isRequiredInPreflight(['data', 'i18n', locale, config.key])}
  {@const issues = field.issues()}

  {#if genAttrs}
    <input {...genAttrs}>
  {/if}

  {#if config.kind === 'textarea'}
    <TextArea
      label={config.label}
      {locale}
      isTranslated={true}
      {required}
      {isEditing}
      isGenAI={genValue}
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
      isGenAI={genValue}
      onToggleGenAI={() => toggleGenAiField(form, locale, config.key)}
      value={(attrs as { value?: string }).value ?? ''}
      {issues}
      inputAttrs={attrs as Record<string, unknown>}
    />
  {/if}
{/each}
