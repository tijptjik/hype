<script lang="ts">
// DOMAIN
import {
  generateFeatureName,
  nameBooleanValue,
  type FeatureNameRule,
} from '#lib/features/locationPolicy.js'
// I18N
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
let {
  rule,
  names,
  titles,
  properties,
  overrides,
  onChange,
}: {
  rule: FeatureNameRule
  names: Record<string, string>
  titles: Record<string, { title?: string }>
  properties: { propertyId: string; value?: string | null }[]
  overrides: Record<string, string>
  onChange: (overrides: Record<string, string>) => void
} = $props()
const values = $derived(
  Object.fromEntries(
    properties.map(row => [row.propertyId, nameBooleanValue(row.value)]),
  ),
)
</script>
<fieldset class="mb-8 grid min-w-0 gap-3 rounded-lg border p-4">
  <legend class="px-1 font-medium">Feature name preview</legend>
  {#each Object.entries(titles) as [locale, row]}
    {@const tag = canonicalContentTag(locale)}
    {@const name = Object.entries(names).find(
      ([key]) => canonicalContentTag(key) === tag,
    )?.[1]}
    {@const overridden = Object.hasOwn(overrides, tag)}
    <div class="grid min-w-0 gap-2">
      <p class="break-words whitespace-normal">
        <span class="text-muted-foreground text-sm">{tag}</span>
        {generateFeatureName({
          rule,
          locale: tag,
          locationName: name,
          featureName: row.title,
          properties: values,
          override: overrides[tag],
        }) || 'Name not yet available'}
      </p>
      <label class="flex items-center gap-2 text-sm"
        ><input
          type="checkbox"
          checked={overridden}
          onchange={() => {
            const next = { ...overrides }
            if (overridden) delete next[tag]
            else
              next[tag] = generateFeatureName({
                rule,
                locale: tag,
                locationName: name,
                featureName: row.title,
                properties: values,
              })
            onChange(next)
          }}
        >Override name for {tag}</label
      >
      {#if overridden}
        <input
          aria-label={`Name override ${tag}`}
          class="min-w-0 rounded border bg-transparent p-2"
          value={overrides[tag]}
          oninput={event =>
            onChange({ ...overrides, [tag]: event.currentTarget.value })}
        >
      {/if}
    </div>
  {/each}
</fieldset>
