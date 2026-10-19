<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
import { getGenAiState, toggleGenAiField } from '#lib/client/services/form.js'
import { TextArea, TextInput } from '#lib/bits/custom/form/index.js'
import type { FormBooleanValue, GenAiField } from '#lib/client/services/form.types.js'
import type { LocaleKey } from '#lib/types.js'

type DescriptorFieldConfig = {
  key: GenAiField
  label: string
  kind: 'input' | 'textarea'
}

type FormFieldControl = {
  as(type: 'text'): Record<string, unknown>
  as(type: 'hidden', value: string): Record<string, unknown>
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}

type DescriptorFormFields = Partial<
  Record<GenAiField | `${GenAiField}Gen`, FormFieldControl>
>
type DescriptorForm = {
  fields: {
    value: () => {
      data?: {
        i18n?: Record<
          string,
          Partial<Record<GenAiField, string | null>> &
            Partial<Record<`${GenAiField}Gen`, FormBooleanValue>>
        >
      }
    }
    set: (value: {
      data?: {
        i18n?: Record<
          string,
          Partial<Record<GenAiField, string | null>> &
            Partial<Record<`${GenAiField}Gen`, FormBooleanValue>>
        >
      }
    }) => void
  }
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
  afterField,
  besideShortName,
}: {
  form: DescriptorForm
  fields: DescriptorFormFields
  locale: LocaleKey
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  fieldConfigs?: DescriptorFieldConfig[]
  afterField?: Snippet<[GenAiField]>
  besideShortName?: Snippet
} = $props()
</script>

{#each fieldConfigs as config (config.key)}
  {@const field = fields[config.key]}
  {#if field}
    {@const genField = fields[`${config.key}Gen`]}
    {@const attrs = field.as('text')}
    {@const genValue = getGenAiState(form, locale, config.key)}
    {@const genAttrs = genField?.as('hidden', genValue ? 'true' : 'false')}
    {@const required = isRequiredInPreflight(['data', 'i18n', locale, config.key])}
    {@const issues = field.issues()}

    {#if genAttrs}
      <input {...genAttrs}>
    {/if}

    {#if config.kind === 'textarea'}
      <TextArea
        renderHtml={config.key === 'description'}
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
      <div
        class={besideShortName && config.key === 'nameShort'
          ? 'flex items-end gap-3'
          : 'contents'}
      >
        <TextInput
          class={besideShortName && config.key === 'nameShort' ? 'min-w-0 flex-1' : ''}
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
        {#if config.key === 'nameShort' && besideShortName}
          <div class="flex h-12 shrink-0 items-center whitespace-nowrap">
            {@render besideShortName()}
          </div>
        {/if}
      </div>
    {/if}
    {@render afterField?.(config.key)}
  {/if}
{/each}
