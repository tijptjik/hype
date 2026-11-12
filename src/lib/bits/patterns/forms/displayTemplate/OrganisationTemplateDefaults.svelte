<script lang="ts">
// API
import {
  getOrganisationTemplateDefaults,
  setOrganisationTemplateDefault,
} from '#lib/api/displayTemplates.remote.js'
import { getFeatureNamingTemplates } from '#lib/api/featureIntents.remote.js'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// DOMAIN
import { featureTypeLabel } from '#lib/features/intents.js'
import { getLocaleKey } from '#lib/i18n.js'
// TYPES
import type { DisplayTemplateRecord } from '#lib/templates/registry.js'
import type { FeatureIntentPolicy } from '#lib/db/services/featureIntentPolicy.js'

let {
  organisationId,
  templates,
}: {
  organisationId: string
  templates: DisplayTemplateRecord[]
} = $props()
let availableTemplates = $state<DisplayTemplateRecord[]>([])
let policy = $state<FeatureIntentPolicy | null>(null)
let selected = $state<Record<string, string>>({})
let busy = $state(false)
let failed = $state(false)
let refresh = $state(0)
$effect(() => {
  refresh
  templates
  const owner = organisationId
  let cancelled = false
  policy = null
  failed = false
  void Promise.all([
    getOrganisationTemplateDefaults({ organisationId: owner }),
    getFeatureNamingTemplates({ type: 'organisation', id: owner }),
  ])
    .then(([value, available]) => {
      availableTemplates = available
      if (cancelled) return
      policy = value
      selected = Object.fromEntries(
        value.types.map(type => {
          const reference = value.namingRules?.[type.id]?.registry
          return [type.id, reference ? `${reference.id}:${reference.version}` : '']
        }),
      )
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
/** Save one inspected default, preserving all other type defaults.
 * @param featureType Selected type. @returns Completion after the policy refresh.
 */
async function save(featureType: string): Promise<void> {
  if (!policy || busy) return
  busy = true
  failed = false
  const template = availableTemplates.find(
    value => `${value.id}:${value.version}` === selected[featureType],
  )
  try {
    await setOrganisationTemplateDefault({
      organisationId,
      featureType,
      version: policy.version,
      fingerprint: policy.fingerprint,
      reference: template ? { id: template.id, version: template.version } : null,
    })
    await getOrganisationTemplateDefaults({ organisationId }).refresh()
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<section
  class="border-border grid gap-4 rounded-md border p-4"
  aria-label="Organisation naming defaults"
>
  <h2 class="text-sm font-medium">Organisation naming defaults</h2>
  <p class="text-muted-foreground text-sm">
    Used by new features unless the Project or Layer defines its own rule. Existing
    feature names stay unchanged.
  </p>
  {#if failed}
    <p role="alert" class="text-destructive text-sm">
      Unable to save or load defaults. Reload before trying again.
    </p>
    <Button text="Reload" style="outline" onClick={() => refresh++} />
  {/if}
  {#if policy}
    {#each policy.types as type (type.id)}
      {@const pinned = policy.namingRules?.[type.id]?.registry}
      <div
        class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center"
      >
        <label for={`template-default-${type.id}`} class="text-sm break-words"
          >{featureTypeLabel(type, getLocaleKey())}</label
        >
        <select
          id={`template-default-${type.id}`}
          bind:value={selected[type.id]}
          disabled={busy}
          class="border-input bg-background min-w-0 rounded-md border p-2 text-sm"
        >
          <option value="">Inherit Hub default</option>
          {#if pinned &&
            !availableTemplates.some(
              item => item.id === pinned.id && item.version === pinned.version,
            )}
            <option value={`${pinned.id}:${pinned.version}`} disabled>
              Accepted version {pinned.version}
            </option>
          {/if}
          {#each availableTemplates as template (template.id)}
            <option value={`${template.id}:${template.version}`}>
              {template.name}
              · v{template.version}
            </option>
          {/each}
        </select>
        <Button
          text="Save default"
          style="outline"
          disabled={busy ||
            selected[type.id] === (pinned ? `${pinned.id}:${pinned.version}` : '')}
          onClick={() => save(type.id)}
        />
      </div>
    {/each}
  {/if}
</section>
