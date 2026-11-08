<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import {
  LOCATION_TASK_PREVIEW_KINDS,
  LOCATION_TASK_PREVIEWS,
} from '#lib/locations/taskPreview.js'
// TYPES
import type {
  LocationTaskPreviewKind,
  LocationTaskPreviewSelection,
} from '#lib/locations/taskPreview.js'

let {
  surface,
  selection = 'all',
  featureId,
}: {
  surface: 'editor' | 'queue'
  selection?: LocationTaskPreviewSelection
  featureId: string
} = $props()
let notes = $state<Partial<Record<LocationTaskPreviewKind, string>>>({})
let decisions = $state<
  Partial<Record<LocationTaskPreviewKind, 'accepted' | 'rejected'>>
>({})
const cases = $derived(selection === 'all' ? LOCATION_TASK_PREVIEW_KINDS : [selection])
const labels = $derived({
  facts: m.location_task_facts(),
  position: m.location_task_position(),
  identity: m.location_task_identity(),
  merge: m.location_task_merge(),
})
</script>

<section class="min-w-0 space-y-4 py-4" aria-label={m.location_task_preview_title()}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="text-base font-semibold">{m.location_task_preview_title()}</h2>
      <p class="text-muted-foreground mt-1 text-sm">{m.location_task_preview_help()}</p>
    </div>
    {#if surface === 'editor'}
      <a
        class="text-primary text-sm hover:underline"
        href={`/admin/tasks?locationTaskPreview=all&previewFeatureId=${encodeURIComponent(featureId)}`}
        >{m.location_task_preview_queue()}</a
      >
    {/if}
  </div>
  <div class="grid min-w-0 gap-3">
    {#each cases as kind (kind)}
      {@const sample = LOCATION_TASK_PREVIEWS[kind]}
      <article
        class="border-border bg-panel min-w-0 space-y-4 rounded-xl border p-4"
        aria-label={labels[kind]}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-muted-foreground text-xs">
              {m.feature_location_title()}
              · Harbour Bakery
            </p>
            <h3 class="mt-1 font-semibold">{labels[kind]}</h3>
          </div>
          {#if decisions[kind]}
            <span role="status" class="bg-muted rounded-full px-3 py-1 text-xs"
              >{decisions[kind] === 'accepted'
                ? m.location_review_accepted()
                : m.location_review_rejected()}</span
            >
          {:else if surface === 'queue'}
            <a
              class="border-border text-primary hover:bg-muted rounded-md border px-3 py-2 text-sm font-medium"
              href={`/admin/features/${encodeURIComponent(featureId)}?locationTaskPreview=${kind}#location`}
              >{m.location_task_preview_review()}</a
            >
          {/if}
        </div>
        <dl class="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div class="min-w-0">
            <dt class="text-muted-foreground text-xs">{m.location_review_before()}</dt>
            <dd class="mt-1 break-words">{sample.before}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-muted-foreground text-xs">
              {m.location_review_candidate()}
            </dt>
            <dd class="mt-1 break-words">{sample.after}</dd>
          </div>
        </dl>
        {#if surface === 'editor' && !decisions[kind]}
          <label class="block text-sm">
            {m.location_review_reason()}
            <input
              class="border-border bg-background mt-1 block min-h-10 w-full rounded-md border px-3 text-sm"
              bind:value={notes[kind]}
              maxlength="2000"
            >
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="bg-primary text-primary-foreground min-h-10 rounded-md px-4 text-sm font-medium disabled:opacity-40"
              disabled={!notes[kind]?.trim()}
              onclick={() => (decisions[kind] = 'accepted')}
            >
              {m.location_task_preview_accept()}
            </button>
            <button
              type="button"
              class="border-border hover:bg-muted min-h-10 rounded-md border px-4 text-sm disabled:opacity-40"
              disabled={!notes[kind]?.trim()}
              onclick={() => (decisions[kind] = 'rejected')}
            >
              {m.location_task_preview_reject()}
            </button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>
