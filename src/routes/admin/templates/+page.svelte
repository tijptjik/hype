<script lang="ts">
// SVELTE
import { untrack, onDestroy } from 'svelte'
import { page } from '$app/state'
// ICONS
import Braces from 'virtual:icons/proicons/code'
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
import {
  getFeatureNameFieldsProject,
  getFeatureNameProperties,
} from '#lib/api/featureIntents.remote.js'
// COMPONENTS
import TemplateConsumers from '#lib/bits/patterns/forms/displayTemplate/TemplateConsumers.svelte'
import OrganisationTemplateDefaults from '#lib/bits/patterns/forms/displayTemplate/OrganisationTemplateDefaults.svelte'
import DisplayTemplateEditor from '#lib/bits/patterns/forms/displayTemplate/DisplayTemplateEditor.svelte'
import { Button } from '#lib/bits/core/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
import { SectionHeader, TextInput, SelectField } from '#lib/bits/custom/form/index.js'
import type { TemplateProperty } from '#lib/templates/propertyPresentation.js'
// I18N
import { m } from '#lib/i18n.js'
import { FEATURE_TEMPLATE_FIELDS } from '#lib/templates/namingRule.js'
// DOMAIN
import {
  SYSTEM_DISPLAY_TEMPLATES,
  type SystemDisplayTemplate,
} from '#lib/templates/system.js'
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
let contextProjectId = $state<string | null>(null)
let records = $state<DisplayTemplateRecord[]>([])
let loading = $state(true)
let failed = $state(false)
let scopeLoaded = $state(false)
let busy = $state(false)
let saved = $state(false)
type CatalogueTemplate = DisplayTemplateRecord | SystemDisplayTemplate
let selected = $state<CatalogueTemplate | null>(null)
const catalogue = $derived([...SYSTEM_DISPLAY_TEMPLATES, ...records])
const isSystem = $derived(selected !== null && 'system' in selected)
const canCreate = $derived(
  scopeLoaded && (Boolean(organisationId) || admin.view.isSuperAdmin()),
)
let draft = $state<DisplayTemplateDefinition | null>(null)
let baseline = $state('')
const dirty = $derived(draft !== null && JSON.stringify(draft) !== baseline)
const canEdit = $derived(
  !isSystem &&
    canCreate &&
    (selected === null || selected.organisationId === organisationId),
)
const isEditing = $derived(header.state.isEditing && canEdit)
let locale = $state('en')
let refresh = $state(0)
let fieldProperties = $state<TemplateProperty[]>([])
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
  ...(draft?.target === 'feature'
    ? [...FEATURE_TEMPLATE_FIELDS, ...fieldProperties]
    : locationProperties),
])
const validation = $derived(
  draft ? DisplayTemplateDefinitionSchema.safeParse(draft) : null,
)
const valid = $derived(validation?.success === true)
const issues = $derived(
  validation && !validation.success ? validation.error.issues : [],
)
$effect(() => {
  const title =
    selected?.name ?? (draft ? m.display_templates_new() : m.display_templates_title())
  const newDisabled = busy || !canCreate || dirty
  const controls = {
    dirty,
    isSubmitting: busy,
    disableSave: !valid || !canEdit,
    canEdit: Boolean(draft) && canEdit,
    canPublish: false,
    showPublishAction: false,
    showDeleteAction: false,
    submit: save,
    reset: () => edit(selected),
  }
  untrack(() => {
    header.setHeaderForEntity(title, Braces, new Map(), {
      showFacets: false,
      showNew: true,
    })
    header.setCrumbs([{ name: m.display_templates_title(), href: '/admin/templates' }])
    header.setFormActions(controls)
    header.setCreateAction(
      () => {
        if (!newDisabled) edit(null)
      },
      { label: m.display_templates_new(), disabled: newDisabled },
    )
  })
})
onDestroy(() => header.setCreateAction(null))
$effect(() => {
  refresh
  const currentFeatureId = featureId
  const owner = page.url.searchParams.get('organisation')
  let cancelled = false
  loading = true
  scopeLoaded = false
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
          contextProjectId = state.projectId
          records = state.templates
          const fields = await getFeatureNameProperties({
            type: 'project',
            id: state.projectId,
          })
          if (!cancelled)
            fieldProperties = fields.map(field => ({
              ...field,
              path: `properties.${field.id}`,
              label: field.label,
            }))
        }
      } else {
        const scopeType = page.url.searchParams.get('scope')
        const scopeId = page.url.searchParams.get('scopeId')
        const projectId =
          scopeId && (scopeType === 'layer' || scopeType === 'project')
            ? await getFeatureNameFieldsProject({ type: scopeType, id: scopeId })
            : page.url.searchParams.get('project')
        if (!cancelled) contextProjectId = projectId
        const rows = await getDisplayTemplates({ organisationId: owner, projectId })
        if (!cancelled) records = rows
      }
    } catch {
      if (!cancelled) failed = true
    } finally {
      if (!cancelled) {
        loading = false
        if (!failed) {
          scopeLoaded = true
          edit(
            records.find(item => item.id === page.url.searchParams.get('template')) ??
              SYSTEM_DISPLAY_TEMPLATES[0],
          )
        }
      }
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
  if (!featureId || !featureState || !selected || 'system' in selected || busy) return
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
function edit(record: CatalogueTemplate | null): void {
  selected = record
  fieldProperties = []
  const projectId =
    record && !('system' in record)
      ? (record.projectId ?? contextProjectId)
      : contextProjectId
  const scope = projectId
    ? { type: 'project' as const, id: projectId }
    : organisationId
      ? { type: 'organisation' as const, id: organisationId }
      : null
  if (scope)
    void getFeatureNameProperties(scope)
      .then(fields => {
        if (selected === record)
          fieldProperties = fields.map(field => ({
            ...field,
            path: `properties.${field.id}`,
            label: `Feature property · ${field.label}`,
          }))
      })
      .catch(() => {
        failed = true
      })
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
          en: '{{ feature.name }}',
          'zh-Hant': '{{ feature.name }}',
          'zh-Hans': '{{ feature.name }}',
        },
      }
  locale = Object.keys(draft.locales)[0]
  baseline = JSON.stringify(draft)
  header.setEditing(record === null)
  saved = false
}
/** Publish a version without altering existing assignments.
 * @returns Completion after a successful version-fenced save or an actionable error.
 */
async function save(): Promise<void> {
  if (!draft || !valid || busy || !dirty || !canEdit) return
  busy = true
  saved = false
  failed = false
  try {
    const result = await publishDisplayTemplate({
      organisationId,
      projectId:
        selected && !('system' in selected)
          ? (selected.projectId ?? contextProjectId)
          : contextProjectId,
      id: selected?.id ?? crypto.randomUUID(),
      expectedVersion: selected?.version ?? 0,
      definition: draft,
    })
    const record = {
      ...draft,
      ...result,
      organisationId,
      projectId:
        selected && !('system' in selected)
          ? (selected.projectId ?? contextProjectId)
          : contextProjectId,
    }
    selected = record
    records = [...records.filter(item => item.id !== record.id), record]
    baseline = JSON.stringify(draft)
    header.setEditing(false)
    saved = true
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<Main.Root class="overflow-y-auto! px-0 pt-0">
  <FormSurface>
    <div class="grid min-w-0 gap-8 p-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:p-8">
      <aside class="min-w-0 space-y-3">
        {#if loading}
          <div
            role="status"
            aria-label={m.display_templates_loading()}
            class="bg-muted h-32 animate-pulse rounded-lg"
          ></div>
        {/if}
        {#each catalogue as record (record.id)}
          <button
            type="button"
            disabled={busy || dirty}
            onclick={() => edit(record)}
            class="border-border hover:bg-primary/10 aria-pressed:border-primary/40 aria-pressed:bg-primary/10 w-full rounded-lg border p-4 text-left disabled:cursor-default"
            aria-pressed={selected?.id === record.id}
          >
            <span class="block text-sm font-semibold break-words">{record.name}</span>
            <span class="text-muted-foreground mt-1 block text-xs break-words"
              >{record.code}
              ·
              {'system' in record
                ? m.display_templates_system()
                : m.display_templates_version({
                    version: String(record.version),
                  })}</span
            >
          </button>
        {/each}
      </aside>
      <div class="grid min-w-0 content-start gap-8">
        {#if failed}
          <p role="alert" class="text-destructive text-sm">
            {m.display_templates_failed()}
          </p>
          {#if !draft}
            <Button style="outline" onClick={() => refresh++} text={m.retry()} />
          {/if}
        {/if}
        {#if draft}
          <section
            class="border-border bg-panel min-w-0 overflow-hidden rounded-xl border"
          >
            <SectionHeader
              title={m.display_templates_title()}
              icon={Braces}
              description={isSystem
                ? m.display_templates_system()
                : selected
                  ? m.display_templates_version({ version: String(selected.version) })
                  : m.display_templates_new()}
            />
            <div class="grid gap-6 p-6">
              <div class="grid gap-6 sm:grid-cols-2">
                <TextInput
                  id="template-name"
                  label={m.display_templates_name()}
                  issues={dirty
                    ? issues
                        .filter(issue => issue.path[0] === 'name')
                        .map(issue => issue.message)
                    : []}
                  bind:value={draft.name}
                  {isEditing}
                  disabled={busy}
                  required
                  variant="resource"
                />
                <TextInput
                  id="template-code"
                  label={m.display_templates_code()}
                  issues={dirty
                    ? issues
                        .filter(issue => issue.path[0] === 'code')
                        .map(issue => issue.message)
                    : []}
                  bind:value={draft.code}
                  isEditing={isEditing && !selected}
                  disabled={busy}
                  required
                  variant="resource"
                />
              </div>
              <SelectField
                id="template-target"
                variant="ghost"
                triggerAttrs={{
                  id: 'template-target',
                  'aria-label': m.display_templates_target(),
                }}
                label={m.display_templates_target()}
                bind:value={draft.target}
                {isEditing}
                disabled={busy}
                items={[
                  { value: 'feature', label: m.display_templates_feature() },
                  { value: 'location', label: m.display_templates_location() },
                ]}
              />
            </div>
          </section>
          <section
            class="border-border bg-panel min-w-0 overflow-hidden rounded-xl border"
          >
            <SectionHeader
              title={m.display_templates_expression()}
              icon={Braces}
              showControlLabels
            >
              {#snippet right()}
                <fieldset
                  class="flex min-w-max gap-1"
                  aria-label={m.display_templates_expression()}
                >
                  {#each Object.keys(draft?.locales ?? {}) as tag (tag)}
                    <Button
                      type="button"
                      size="sm"
                      style={locale === tag ? 'soft' : 'ghost'}
                      onClick={() => (locale = tag)}
                      text={tag}
                      attrs={{ 'aria-pressed': locale === tag }}
                    />
                  {/each}
                </fieldset>
              {/snippet}
            </SectionHeader>
            <div class="p-6">
              <p class="text-muted-foreground mb-4 text-sm">
                Feature name and properties, and linked location name and attributes,
                are optional inputs. Project-owned properties restrict a template to
                that project; system fields can be used across projects.
              </p>
              <DisplayTemplateEditor
                value={draft.locales[locale] ?? ''}
                onChange={source => {
                  if (draft)
                    draft = {
                      ...draft,
                      locales: { ...draft.locales, [locale]: source },
                    }
                  saved = false
                }}
                {properties}
                {locale}
                disabled={busy}
                {isEditing}
              />
            </div>
          </section>
        {/if}
        {#if selected && !isSystem && featureState}
          <Button
            text={m.display_templates_apply()}
            style="outline"
            disabled={busy || dirty}
            onClick={applyTemplate}
          />
        {/if}
        {#if saved && !dirty}
          <p role="status" class="text-sm">{m.display_templates_saved()}</p>
        {/if}
        {#if selected && !('system' in selected) && organisationId && !featureId}
          {#key `${organisationId}:${selected.id}:${selected.version}`}
            <TemplateConsumers {organisationId} template={selected} />
          {/key}
        {/if}
        {#if organisationId && !featureId && !loading}
          <OrganisationTemplateDefaults {organisationId} templates={records} />
        {/if}
      </div>
    </div>
  </FormSurface>
</Main.Root>
