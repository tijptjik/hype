<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// ICONS
import RemoveIcon from 'virtual:icons/lucide/x'

let {
  names,
  disabled = false,
  onChange,
}: {
  names: Record<string, string>
  disabled?: boolean
  onChange: (names: Record<string, string>) => void
} = $props()
const uid = $props.id()
const languages = [
  { value: 'en', label: 'English' },
  { value: 'zh-hant', label: '繁體中文' },
  { value: 'zh-hans', label: '简体中文' },
]
const available = $derived(languages.filter(item => !Object.hasOwn(names, item.value)))

/** Move a name to another language without replacing an existing translation.
 * @param locale Current language tag. @param next Unused replacement language tag.
 * @returns Nothing; the parent owns the draft and persistence.
 */
function changeLocale(locale: string, next: string): void {
  if (!next || next === locale || Object.hasOwn(names, next)) return
  onChange(
    Object.fromEntries(
      Object.entries(names).map(([key, name]) => [key === locale ? next : key, name]),
    ),
  )
}

/** Remove one translation while retaining at least one name field.
 * @param locale Language tag to remove. @returns Nothing; removal remains a draft until Save.
 */
function remove(locale: string): void {
  if (Object.keys(names).length < 2) return
  onChange(Object.fromEntries(Object.entries(names).filter(([key]) => key !== locale)))
}
</script>

<fieldset {disabled} class="@container min-w-0 space-y-4" data-location-name-fields>
  <legend class="mb-3 text-sm font-semibold">{m.location_review_names()}</legend>
  {#each Object.entries(names) as [locale, name] (locale)}
    {@const language = languages.find(item => item.value === locale) ?? {
      value: locale,
      label: locale,
    }}
    <div
      class="grid min-w-0 items-end gap-2 @min-[500px]:grid-cols-[10rem_minmax(0,1fr)_2.5rem]"
      lang={locale}
    >
      <SelectField
        id={`${uid}-${locale}-locale`}
        label={m.locale()}
        placeholder={`${m.locale()} · ${language.label}`}
        value={locale}
        items={[language, ...available]}
        {disabled}
        class="min-w-0 flex-1"
        onValueChange={next => changeLocale(locale, next)}
      />
      <TextInput
        id={`${uid}-${locale}-name`}
        name=""
        label={`${m.admin__forms_common_name_full()} · ${language.label}`}
        value={name}
        {disabled}
        required={true}
        inputAttrs={{ maxlength: 1000 }}
        onValueChange={value => onChange({ ...names, [locale]: value })}
      />
      {#if Object.keys(names).length > 1}
        <button
          type="button"
          class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-primary flex size-10 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2"
          aria-label={`${m.admin__forms_common_remove()} · ${language.label}`}
          {disabled}
          onclick={() => remove(locale)}
        >
          <RemoveIcon class="size-4" aria-hidden="true" />
        </button>
      {/if}
    </div>
  {/each}
  {#if available.length}
    {#key Object.keys(names).join('|')}
      <SelectField
        id={`${uid}-add-language`}
        class="max-w-52"
        placeholder={m.location_name_add_language()}
        value=""
        items={available}
        {disabled}
        onValueChange={locale => {
          if (available.some(item => item.value === locale))
            onChange({ ...names, [locale]: '' })
        }}
      />
    {/key}
  {/if}
  {#if !Object.values(names).length || Object.values(names).some(name => !name.trim())}
    <p role="alert" class="text-destructive text-sm">
      {m.admin__validation_name_is_required()}
    </p>
  {/if}
</fieldset>
