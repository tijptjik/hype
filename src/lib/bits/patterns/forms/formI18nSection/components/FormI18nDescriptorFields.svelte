<script lang="ts" generics="T extends DescriptorData">
import { unverifiedAcceptance } from '#lib/i18n/automaticSchema.js'
// SVELTE
import type { Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
import { getGenAiState, toggleGenAiField } from '#lib/client/services/form.js'
import { TextArea, TextInput } from '#lib/bits/custom/form/index.js'
import type {
  GenAiField,
  FormDataUpdaterForm,
} from '#lib/client/services/form.types.js'
import FormI18nInlineRow from './FormI18nInlineRow.svelte'
import type {
  DescriptorData,
  DescriptorFieldConfig,
} from './formI18nDescriptorFields.types'

type FormFieldControl = {
  as(type: 'text'): Record<string, unknown>
  as(type: 'hidden', value: string): Record<string, unknown>
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}

type DescriptorFormFields = Partial<
  Record<GenAiField | `${GenAiField}Gen`, FormFieldControl>
>

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
  inline = false,
  onEditStart,
  toolbarActions,
  renderValue,
}: {
  form: FormDataUpdaterForm<T>
  fields: object
  locale: string
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  fieldConfigs?: DescriptorFieldConfig[]
  toolbarActions?: Snippet
  afterField?: Snippet<[GenAiField]>
  inline?: boolean
  onEditStart?: (field: GenAiField) => void
  besideShortName?: Snippet
  renderValue?: Snippet<[GenAiField, string]>
} = $props()
// Dynamic remote-form maps expose an opaque proxy; field configs supply its known keys.
const controls = $derived(
  fields as DescriptorFormFields & {
    autoTranslated: Record<string, FormFieldControl>
    translationProvenance: Record<string, FormFieldControl>
  },
)
// Capture only this field and its provenance; Escape must preserve other concurrent edits.
let beforeEdit:
  | {
      field: GenAiField
      value: string | null | undefined
      gen: boolean | 'true' | 'false' | undefined
      provenance: string | undefined
    }
  | undefined
function startEdit(field: GenAiField): void {
  const row = form.fields.value().data?.i18n?.[locale]
  beforeEdit = {
    field,
    value: row?.[field],
    gen: row?.[`${field}Gen`],
    provenance: row?.translationProvenance?.[field],
  }
  onEditStart?.(field)
}
function toggleInline(field: GenAiField): void {
  const current = form.fields.value()
  const data = current.data
  if (!data) return
  // Verification changes preserve accepted copy and its original translation receipt.
  if (data.i18n?.[locale]) {
    toggleGenAiField(form, locale, field)
    return
  }
  // A newly selected empty locale has no stored bucket until its first edit or verification choice.
  form.fields.set({
    ...current,
    data: {
      ...data,
      i18n: { ...data.i18n, [locale]: { [field]: '', [`${field}Gen`]: true } },
    },
  })
}
/** Clear only this field and mark the change as a manual edit. */
function clearInline(field: GenAiField): void {
  const current = form.fields.value()
  const data = current.data
  if (!data) return
  onEditStart?.(field)
  form.fields.set({
    ...current,
    data: {
      ...data,
      i18n: {
        ...data.i18n,
        [locale]: {
          ...data.i18n?.[locale],
          [field]: '',
          [`${field}Gen`]: false,
        },
      },
    },
  })
}
function cancelEdit(): void {
  if (!beforeEdit) return
  const current = form.fields.value()
  const data = current.data
  if (!data) return
  const provenance = { ...data.i18n?.[locale]?.translationProvenance }
  if (beforeEdit.provenance === undefined) delete provenance[beforeEdit.field]
  else provenance[beforeEdit.field] = beforeEdit.provenance
  form.fields.set({
    ...current,
    data: {
      ...data,
      i18n: {
        ...data.i18n,
        [locale]: {
          ...data.i18n?.[locale],
          [beforeEdit.field]: beforeEdit.value ?? '',
          [`${beforeEdit.field}Gen`]: beforeEdit.gen ?? false,
          translationProvenance: provenance,
        },
      },
    },
  })
}
</script>

{#each fieldConfigs as config (config.key)}
  {@const field = controls[config.key]}
  {@const automatic =
    form.fields.value().data?.i18n?.[locale]?.autoTranslated?.[config.key]}
  {@const provenance =
    form.fields.value().data?.i18n?.[locale]?.translationProvenance?.[config.key]}
  {#if automatic}
    <input {...controls.autoTranslated[config.key].as('hidden', automatic)}>
  {/if}
  {#if provenance}
    <input {...controls.translationProvenance[config.key].as('hidden', provenance)}>
  {/if}
  {#if field}
    {@const genField = controls[`${config.key}Gen`]}
    {@const attrs = {
      ...field.as('text'),
      ...(config.ariaLabel ? { 'aria-label': config.ariaLabel } : {}),
    } as Record<string, unknown>}
    {@const genValue = getGenAiState(form, locale, config.key)}
    {@const storedGen = form.fields.value().data?.i18n?.[locale]?.[`${config.key}Gen`]}
    {@const genAttrs = genField?.as(
      'hidden',
      storedGen === true || storedGen === 'true' ? 'true' : 'false',
    )}
    {@const required = isRequiredInPreflight(['data', 'i18n', locale, config.key])}
    {@const issues = field.issues()}

    {#if genAttrs}
      <input {...genAttrs}>
    {/if}

    {#if inline}
      <FormI18nInlineRow
        showPreview={Boolean(renderValue)}
        value={(attrs as { value?: string }).value ?? ''}
        label={config.ariaLabel ?? config.label}
        prefix={config.label}
        toolbarActions={config.markdown ? toolbarActions : undefined}
        markdown={config.markdown}
        multiline={config.kind === 'textarea'}
        editable={isEditing && !config.readonly}
        isGenAI={genValue ||
          unverifiedAcceptance(provenance, (attrs as { value?: string }).value)}
        {issues}
        {required}
        renderHtml={config.renderHtml ?? config.kind === 'textarea'}
        attrs={{
          ...attrs,
          oninput: (event: Event) => {
            if (typeof attrs.oninput === 'function') attrs.oninput(event)
            onEditStart?.(config.key)
            if (getGenAiState(form, locale, config.key))
              toggleGenAiField(form, locale, config.key, false)
          },
        }}
        onToggle={() => toggleInline(config.key)}
        onStart={() => startEdit(config.key)}
        onCancel={cancelEdit}
        onClear={() => clearInline(config.key)}
      >
        {#snippet preview()}
          {@render renderValue?.(config.key, (attrs as { value?: string }).value ?? '')}
        {/snippet}
      </FormI18nInlineRow>
    {:else if config.kind === 'textarea'}
      <TextArea
        renderHtml={config.key === 'description'}
        label={config.label}
        locale={locale as import('#lib/types.js').LocaleKey}
        isTranslated={true}
        {required}
        isEditing={isEditing && !config.readonly}
        isGenAI={genValue ||
          unverifiedAcceptance(provenance, (attrs as { value?: string }).value)}
        onToggleGenAI={() => toggleInline(config.key)}
        onValueChange={() => toggleGenAiField(form, locale, config.key, false)}
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
          locale={locale as import('#lib/types.js').LocaleKey}
          isTranslated={true}
          {required}
          isEditing={isEditing && !config.readonly}
          isGenAI={genValue ||
            unverifiedAcceptance(provenance, (attrs as { value?: string }).value)}
          onToggleGenAI={() => toggleInline(config.key)}
          onValueChange={() => toggleGenAiField(form, locale, config.key, false)}
          value={(attrs as { value?: string }).value ?? ''}
          {issues}
          inputAttrs={attrs as Record<string, unknown>}
        />
        {#if config.key === 'nameShort' && besideShortName}
          <div
            class="flex shrink-0 items-end whitespace-nowrap [&_.bits-checkbox-field]:gap-1 [&_.bits-checkbox-row]:h-[42px] [&_label]:text-[13px] [&_label]:leading-5 [&_label]:font-semibold"
          >
            {@render besideShortName()}
          </div>
        {/if}
      </div>
    {/if}
    {@render afterField?.(config.key)}
  {/if}
{/each}
