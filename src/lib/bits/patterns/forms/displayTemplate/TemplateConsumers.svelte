<script lang="ts">
// API
import {
  getDisplayTemplateConsumers,
  setFeatureDisplayTemplate,
} from '#lib/api/displayTemplates.remote.js'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// TYPES
import type { DisplayTemplateRecord } from '#lib/templates/registry.js'
import type { DisplayTemplateConsumer } from '#lib/db/services/displayTemplateConsumers.js'

let {
  organisationId,
  template,
}: { organisationId: string; template: DisplayTemplateRecord } = $props()
let consumers = $state<DisplayTemplateConsumer[]>([])
let next = $state<string | null>(null)
let after = $state<string | null>(null)
let loading = $state(true)
let busy = $state(false)
let failed = $state(false)
let refresh = $state(0)
let results = $state<Record<string, 'saved' | 'changed'>>({})
$effect(() => {
  // Changing the selected central identity/version starts a new review, never an implicit write.
  template.id
  template.version
  organisationId
  after = null
  results = {}
})
$effect(() => {
  refresh
  const owner = organisationId
  const templateId = template.id
  const cursor = after
  let cancelled = false
  loading = true
  failed = false
  consumers = []
  results = {}
  void getDisplayTemplateConsumers({ organisationId: owner, templateId, after: cursor })
    .then(page => {
      if (cancelled) return
      consumers = page.consumers
      next = page.next
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
/** Regenerate only the inspected page with a revision fence for each Feature.
 * @returns Completion after every page member has a visible success or retry result.
 * @remarks Per-Feature transactions retain successful work when another consumer changes concurrently.
 */
async function regenerate(): Promise<void> {
  if (busy || loading) return
  const reference = { id: template.id, version: template.version }
  const page = [...consumers]
  busy = true
  try {
    for (const consumer of page) {
      if (results[consumer.featureId] === 'saved') continue
      try {
        await setFeatureDisplayTemplate({
          featureId: consumer.featureId,
          expectedRevisionId: consumer.revisionId,
          expectedVersion: consumer.version,
          reference,
        })
        results = { ...results, [consumer.featureId]: 'saved' }
      } catch {
        results = { ...results, [consumer.featureId]: 'changed' }
      }
    }
  } finally {
    busy = false
  }
}
</script>

<section
  class="border-border grid gap-3 rounded-md border p-4"
  aria-label="Template consumers"
>
  <h2 class="text-sm font-medium">
    Regenerate feature names · version {template.version}
  </h2>
  <p class="text-muted-foreground text-sm">
    Review up to 20 features at a time. Manual names and accepted location values are
    preserved.
  </p>
  {#if failed}
    <p role="alert" class="text-destructive text-sm">
      Unable to load template consumers.
    </p>
  {:else if loading}
    <p role="status" class="text-sm">Loading features…</p>
  {:else if !consumers.length}
    <p class="text-muted-foreground text-sm">
      No features on this page use this template.
    </p>
  {:else}
    <ul class="divide-border divide-y">
      {#each consumers as consumer (consumer.featureId)}
        <li
          class="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm"
        >
          <a
            href={`/admin/features/${consumer.featureId}`}
            class="min-w-0 break-words underline underline-offset-2"
            >{consumer.title || consumer.featureId}</a
          >
          <span class="text-muted-foreground" role="status"
            >{results[consumer.featureId] === 'saved'
              ? 'Regenerated'
              : results[consumer.featureId] === 'changed'
                ? 'Not saved · reload to retry'
                : `Accepted version ${consumer.templateVersion}`}</span
          >
        </li>
      {/each}
    </ul>
    <Button
      text={busy ? 'Regenerating…' : 'Regenerate listed features'}
      style="outline"
      disabled={busy || consumers.every(item => results[item.featureId] === 'saved')}
      onClick={regenerate}
    />
  {/if}
  <div class="flex flex-wrap gap-2">
    <Button
      text="Reload page"
      style="outline"
      disabled={busy || loading}
      onClick={async () => {
        await getDisplayTemplateConsumers({
          organisationId,
          templateId: template.id,
          after,
        }).refresh()
        refresh++
      }}
    />
    {#if next}
      <Button
        text="Next 20 features"
        style="outline"
        disabled={busy || loading}
        onClick={() => {
          after = next
        }}
      />
    {/if}
  </div>
</section>
