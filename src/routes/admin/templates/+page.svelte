<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ICONS
import Braces from 'virtual:icons/lucide/braces'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import {
  getFeatureDisplayTemplate,
  setFeatureDisplayTemplate,
  getDisplayTemplates,
  publishDisplayTemplate,
} from '#lib/api/displayTemplates.remote.js'
import { getFeatureNameProperties } from '#lib/api/featureIntents.remote.js'
// COMPONENTS
import TemplateConsumers from '#lib/bits/patterns/forms/displayTemplate/TemplateConsumers.svelte'
import OrganisationTemplateDefaults from '#lib/bits/patterns/forms/displayTemplate/OrganisationTemplateDefaults.svelte'
import DisplayTemplateEditor from '#lib/bits/patterns/forms/displayTemplate/DisplayTemplateEditor.svelte'
import { Button } from '#lib/bits/core/index.js'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import {
  DisplayTemplateDefinitionSchema,
  type DisplayTemplateRecord,
  type DisplayTemplateDefinition,
} from '#lib/templates/registry.js'

const admin = getAdminCtx()
const header = getHeaderCtrl()
admin.setResourceType(false)
const featureId = $derived(page.url.searchParams.get('feature'))
let featureState = $state<{
  organisationId: string
  revisionId: string
  version: number
} | null>(null)
const organisationId = $derived(
  featureState?.organisationId ?? page.url.searchParams.get('organisation'),
)
let records = $state<DisplayTemplateRecord[]>([])
let loading = $state(true)
let failed = $state(false)
let busy = $state(false)
let saved = $state(false)
let selected = $state<DisplayTemplateRecord | null>(null)
let draft = $state<DisplayTemplateDefinition | null>(null)
let locale = $state('en')
let refresh = $state(0)
let fieldProperties = $state<{ path: string; label: string }[]>([])
const locationProperties = [
  'source.name',
  'location.name',
  'brand.name',
  'group.name',
  'format.name',
  'branch',
  'address',
  'phoneNumber',
  'website',
].map(path => ({ path, label: path }))
const properties = $derived([
  ...locationProperties,
  ...(draft?.target === 'feature' ? fieldProperties : []),
])
const valid = $derived(
  draft !== null && DisplayTemplateDefinitionSchema.safeParse(draft).success,
)
$effect(() => {
  header.setHeaderForStandAlone(m.display_templates_title(), Braces, {
    showNew: false,
    showFilter: false,
    showFacets: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  header.clearFooter()
})
$effect(() => {
  refresh
  const currentFeatureId = featureId
  const owner = page.url.searchParams.get('organisation')
  let cancelled = false
  loading = true
  failed = false
  selected = null
  draft = null
  featureState = null
  const load = async (): Promise<void> => {
    try {
      if (currentFeatureId) {
        const state = await getFeatureDisplayTemplate({ featureId: currentFeatureId })
        if (!cancelled) {
          featureState = state
          records = state.templates
          const fields = await getFeatureNameProperties({
            type: 'project',
            id: state.projectId,
          })
          if (!cancelled)
            fieldProperties = fields.map(field => ({
              path: `properties.${field.id}`,
              label: field.label,
            }))
        }
      } else {
        const rows = await getDisplayTemplates({ organisationId: owner })
        if (!cancelled) records = rows
      }
    } catch {
      if (!cancelled) failed = true
    } finally {
      if (!cancelled) loading = false
    }
  }
  void load()
  return () => {
    cancelled = true
  }
})
/** Adopt this version for the selected Feature and regenerate its accepted display text.
 * @returns Completion after the atomic assignment or a retained error state.
 */
async function applyTemplate(): Promise<void> {
  if (!featureId || !featureState || !selected || busy) return
  busy = true
  failed = false
  saved = false
  try {
    await setFeatureDisplayTemplate({
      featureId,
      expectedRevisionId: featureState.revisionId,
      expectedVersion: featureState.version,
      reference: { id: selected.id, version: selected.version },
    })
    await getFeatureDisplayTemplate({ featureId }).refresh()
    // Refresh the inspected revision before another adoption can be submitted.
    featureState = await getFeatureDisplayTemplate({ featureId })
    saved = true
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
/** Select an immutable version for editing.
 * @param record Selected version, or null for a new identity. @returns Nothing.
 */
function edit(record: DisplayTemplateRecord | null): void {
  selected = record
  draft = record
    ? {
        name: record.name,
        code: record.code,
        target: record.target,
        locales: { ...record.locales },
      }
    : {
        name: '',
        code: '',
        target: 'feature',
        locales: {
          en: '{{ source.name }}',
          'zh-Hant': '{{ source.name }}',
          'zh-Hans': '{{ source.name }}',
        },
      }
  locale = Object.keys(draft.locales)[0]
  saved = false
}
/** Publish a version without altering existing assignments.
 * @returns Completion after a successful version-fenced save or an actionable error.
 */
async function save(): Promise<void> {
  if (!draft || !valid || busy) return
  busy = true
  saved = false
  failed = false
  try {
    const result = await publishDisplayTemplate({
      organisationId,
      id: selected?.id ?? crypto.randomUUID(),
      expectedVersion: selected?.version ?? 0,
      definition: draft,
    })
    const record = { ...draft, ...result, organisationId }
    selected = record
    records = [...records.filter(item => item.id !== record.id), record]
    saved = true
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<div class="mx-auto grid w-full max-w-6xl gap-8 p-6 md:grid-cols-[16rem_minmax(0,1fr)]">
  <aside class="space-y-3">
    <Button
      type="button"
      style="outline"
      disabled={busy || loading}
      onClick={() => edit(null)}
      text={m.display_templates_new()}
    />
    {#if loading}
      <div
        role="status"
        aria-label={m.display_templates_loading()}
        class="bg-muted h-32 animate-pulse rounded-md"
      ></div>
    {/if}
    {#each records as record (record.id)}
      <button
        type="button"
        disabled={busy}
        onclick={() => edit(record)}
        class="hover:bg-muted w-full rounded-md border p-3 text-left text-sm"
        aria-pressed={selected?.id === record.id}
      >
        <span class="block font-medium break-words">{record.name}</span>
        <span class="text-muted-foreground"
          >{record.code}
          · {m.display_templates_version({ version: String(record.version) })}</span
        >
      </button>
    {/each}
  </aside>
  <div class="grid min-w-0 gap-8">
    {#if organisationId && !featureId && !loading}
      <OrganisationTemplateDefaults {organisationId} templates={records} />
    {/if}
    {#if failed}
      <p role="alert" class="text-destructive text-sm">
        {m.display_templates_failed()}
      </p>
      <Button
        type="button"
        style="outline"
        onClick={() => refresh++}
        text={m.retry()}
      />
    {/if}
    {#if selected && featureState}
      <Button
        text={m.display_templates_apply()}
        style="outline"
        disabled={busy}
        onClick={applyTemplate}
      />
    {/if}
    {#if selected && organisationId && !featureId}
      {#key `${organisationId}:${selected.id}:${selected.version}`}
        <TemplateConsumers {organisationId} template={selected} />
      {/key}
    {/if}
    {#if draft}
      <fieldset
        disabled={busy ||
          (selected !== null && selected.organisationId !== organisationId)}
        class="min-w-0 space-y-4"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1 text-sm"
            >{m.display_templates_name()}<input
              bind:value={draft.name}
              class="border-input bg-background rounded-md border p-2"
            ></label
          >
          <label class="grid gap-1 text-sm"
            >{m.display_templates_code()}<input
              bind:value={draft.code}
              disabled={selected !== null}
              class="border-input bg-background rounded-md border p-2"
            ></label
          >
        </div>
        <label class="grid gap-1 text-sm"
          >{m.display_templates_target()}<select
            bind:value={draft.target}
            class="border-input bg-background rounded-md border p-2"
          >
            <option value="feature">{m.display_templates_feature()}</option>
            <option value="location">{m.display_templates_location()}</option>
          </select></label
        >
        <div class="flex flex-wrap gap-2">
          {#each Object.keys(draft.locales) as tag (tag)}
            <Button
              type="button"
              style={locale === tag ? 'soft' : 'outline'}
              onClick={() => (locale = tag)}
              text={tag}
            />
          {/each}
        </div>
        <DisplayTemplateEditor
          value={draft.locales[locale] ?? ''}
          onChange={source => {
            if (draft)
              draft = { ...draft, locales: { ...draft.locales, [locale]: source } }
            saved = false
          }}
          {properties}
        />
        <Button
          type="button"
          disabled={!valid || busy}
          onClick={save}
          text={m.display_templates_save()}
        />
      </fieldset>
    {/if}
    {#if saved}
      <p role="status" class="text-sm">{m.display_templates_saved()}</p>
    {/if}
  </div>
</div>
