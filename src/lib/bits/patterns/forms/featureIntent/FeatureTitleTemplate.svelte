<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// API
import { getFeatureNameProperties } from '#lib/api/featureIntents.remote.js'
// I18N
import { m } from '#lib/i18n.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'

let {
  rule,
  scopeId,
  locale,
}: { rule: FeatureNameRule; scopeId: string; locale: string } = $props()
let labels = $state<Record<string, string>>({})
let loading = $state(true)
let failed = $state(false)
onMount(() => {
  if (!rule.conditions.length) {
    loading = false
    return
  }
  let cancelled = false
  // Resolve human-readable field names without exposing schema identifiers in the explanation.
  void getFeatureNameProperties({ type: 'layer', id: scopeId })
    .then(rows => {
      if (!cancelled) labels = Object.fromEntries(rows.map(row => [row.id, row.label]))
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})
</script>

<div class="grid min-w-0 gap-4 text-sm" data-title-template>
  <p>
    {m.feature_title_template_base()}:
    <strong
      >{rule.base === 'location'
        ? m.feature_use_location_name_prompt()
        : m.feature_title_base_feature()}</strong
    >
  </p>
  {#if failed}
    <p role="status" class="text-muted-foreground">
      {m.feature_title_fields_unavailable()}
    </p>
  {/if}
  {#each rule.conditions as condition, index}
    {@const text = Object.entries(condition.locales).find(
      ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
    )?.[1]}
    <section class="border-border grid min-w-0 gap-2 border-t pt-3">
      <h4 class="font-medium">
        {index + 1}.
        {labels[condition.propertyId] ??
          (loading ? m.loading_property_data() : m.feature_title_field_unavailable())}
      </h4>
      {#if text}
        <p class="text-muted-foreground">
          {text.placement === 'prefix'
            ? m.feature_title_add_before()
            : m.feature_title_add_after()}
          · {m.feature_title_separator()}:
          <code class="whitespace-pre-wrap">“{text.separator}”</code>
        </p>
        <dl class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          {#each ['true', 'false', 'null'] as state}
            {#if condition.test !== 'hasValue' || state !== 'null'}
              <dt class="text-muted-foreground">
                {condition.test === 'hasValue'
                  ? state === 'true'
                    ? m.feature_title_has_value()
                    : m.feature_title_no_value()
                  : state === 'true'
                    ? m.feature_title_true()
                    : state === 'false'
                      ? m.feature_title_false()
                      : m.feature_title_unset()}
              </dt>
              <dd class="min-w-0 break-words whitespace-pre-wrap">
                {condition.test === 'hasValue' && state === 'true'
                  ? m.feature_title_field_value()
                  : text[state as 'true' | 'false' | 'null'].trim() ||
                    m.feature_title_no_text()}
              </dd>
            {/if}
          {/each}
        </dl>
      {:else}
        <p>{m.feature_title_no_locale_rule()}</p>
      {/if}
    </section>
  {/each}
</div>
