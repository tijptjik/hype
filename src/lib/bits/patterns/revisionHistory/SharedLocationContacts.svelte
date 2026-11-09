<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  getSharedLocationCorrection,
  saveSharedLocationCorrection,
} from '#lib/api/locationShared.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// TYPES
import type { SharedCorrectionPatch } from '#lib/locations/sharedCorrection.js'
let { featureId, disabled = false }: { featureId: string; disabled?: boolean } =
  $props()
type Workspace = Awaited<ReturnType<typeof getSharedLocationCorrection>>
let workspace = $state<Workspace | null>(null)
let phones = $state(''),
  websites = $state(''),
  socials = $state('')
let busy = $state(false),
  message = $state('')
let token = 0
/** Read current contact evidence without replacing a later Feature's editor. */
async function load(): Promise<void> {
  const id = featureId,
    request = ++token
  try {
    const result = await refreshRemoteQuery(
      getSharedLocationCorrection({ featureId: id }),
    )
    if (id !== featureId || request !== token) return
    workspace = result
    phones = result.facts.phoneNumber.join('\n')
    websites = (result.facts.websites ?? []).join('\n')
    socials = Object.entries(result.facts.socials ?? {})
      .map(([service, url]) => `${service} ${url}`)
      .join('\n')
  } catch (cause) {
    if (request === token)
      message = cause instanceof Error ? cause.message : 'Contacts unavailable'
  }
}
$effect(() => {
  featureId
  untrack(() => {
    workspace = null
    message = ''
    void load()
  })
})
const lines = (text: string): string[] =>
  text
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
/** Save changed fields only; unchanged source values must not become new corrections. */
async function save(reset?: 'phoneNumber' | 'websites' | 'socials'): Promise<void> {
  if (!workspace || busy) return
  const patch: SharedCorrectionPatch = {}
  if (reset) patch[reset] = { mode: 'inherit' }
  else {
    const values = {
      phoneNumber: lines(phones),
      websites: lines(websites),
      socials: Object.fromEntries(
        lines(socials).map(line => {
          const [service, ...url] = line.split(/\s+/)
          return [service, url.join(' ')]
        }),
      ),
    }
    for (const field of ['phoneNumber', 'websites', 'socials'] as const)
      if (
        JSON.stringify(values[field]) !==
        JSON.stringify(workspace.facts[field] ?? (field === 'socials' ? {} : []))
      )
        patch[field] = { mode: 'override', value: values[field] }
  }
  if (!Object.keys(patch).length) return
  busy = true
  message = ''
  const id = featureId
  try {
    await saveSharedLocationCorrection({
      featureId: id,
      sourceRevisionId: workspace.sourceRevisionId,
      expectedRevision: workspace.revision,
      patch,
    })
    if (featureId === id) {
      await load()
      message = 'Shared contacts saved.'
    }
  } catch (cause) {
    if (featureId === id)
      message = cause instanceof Error ? cause.message : 'Could not save contacts'
  } finally {
    busy = false
  }
}
</script>
<section
  class="border-border space-y-3 border-b pb-4"
  aria-label="Hype shared contacts"
>
  <h3 class="font-semibold">Hype shared contacts</h3>
  <p class="text-muted-foreground text-sm">
    Changes apply to this shared Location. Organisation overrides take precedence.
  </p>
  {#if workspace}
    {#each ['phoneNumber', 'websites', 'socials'] as field}
      <div class="space-y-1">
        <label for={`shared-${field}`} class="text-sm font-medium"
          >{field === 'phoneNumber'
            ? 'Phone numbers'
            : field === 'websites'
              ? 'Websites'
              : 'Social profiles'}</label
        >
        <textarea
          id={`shared-${field}`}
          class="border-border w-full rounded border p-2"
          disabled={disabled || busy}
          rows="2"
          value={field === 'phoneNumber'
            ? phones
            : field === 'websites'
              ? websites
              : socials}
          placeholder={field === 'socials'
            ? 'instagram https://instagram.com/example'
            : 'One per line'}
          oninput={event => {
            if (field === 'phoneNumber') phones = event.currentTarget.value
            else if (field === 'websites') websites = event.currentTarget.value
            else socials = event.currentTarget.value
          }}
        ></textarea>
        <p class="text-muted-foreground text-xs">
          Upstream:
          {JSON.stringify(
            workspace.upstream[field as 'phoneNumber' | 'websites' | 'socials'] ??
              'Not provided',
          )}
        </p>
        <button
          type="button"
          class="text-primary text-sm"
          disabled={disabled || busy}
          onclick={() => save(field as 'phoneNumber' | 'websites' | 'socials')}
        >
          Use upstream value
        </button>
      </div>
    {/each}
    <button
      type="button"
      class="bg-primary text-primary-foreground rounded px-3 py-2"
      disabled={disabled || busy}
      onclick={() => save()}
    >
      Save shared contacts
    </button>
    <details>
      <summary class="text-sm">Location correction history</summary>
      <ul class="space-y-2 text-sm">
        {#each workspace.history as row (row.id)}
          <li>
            {row.createdAt}
            · {row.actorId} · {Object.keys(JSON.parse(row.corrections)).join(', ')}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
  {#if message}
    <p role="status" class="text-sm">{message}</p>
  {/if}
</section>
