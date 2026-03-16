<script lang="ts">
import { TextInput } from '$lib/bits/custom/form'
import type { CapabilityI18nRoot, CapabilityKey } from '$lib/types'
import type { LocaleKey } from '$lib/types'

type CapabilityLabelField = {
  as: (type: 'text') => Record<string, unknown>
  issues: () => string[]
}

type CapabilityFormFields = Partial<
  Record<
    CapabilityKey,
    {
      i18n?: Partial<Record<keyof CapabilityI18nRoot, CapabilityLabelField>>
    }
  >
>

let {
  fields,
  capabilityKeys = [],
  capabilityLabels = {},
  locale,
  isEditing = false,
  isRequiredInPreflight,
}: {
  fields: CapabilityFormFields
  capabilityKeys: CapabilityKey[]
  capabilityLabels?: Partial<Record<CapabilityKey, CapabilityI18nRoot>>
  locale: LocaleKey
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
} = $props()
</script>

{#each capabilityKeys as capabilityKey (capabilityKey)}
  {@const field = fields?.[capabilityKey]?.i18n?.[locale]}
  {#if field}
    {@const attrs = field.as('text')}
    {@const required = isRequiredInPreflight([
      'data',
      'capabilities',
      capabilityKey,
      'i18n',
      locale,
    ])}
    {@const issues = field.issues()}
    <TextInput
      label={capabilityKey}
      placeholder={capabilityLabels[capabilityKey]?.[locale] ?? ''}
      {locale}
      isTranslated={true}
      {required}
      {isEditing}
      value={(attrs as { value?: string }).value ?? ''}
      {issues}
      inputAttrs={attrs as Record<string, unknown>}
    />
  {/if}
{/each}
