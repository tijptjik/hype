<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// API
import {
  getResearchConfiguration,
  saveResearchConfiguration,
  previewResearchMigration,
  migrateResearchConfiguration,
  getResearchLayers,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// ICONS
import LayersIcon from 'virtual:icons/proicons/layers'
import TagIcon from 'virtual:icons/proicons/tag'
import PropertiesIcon from 'virtual:icons/proicons/tag-multiple'
import CategoricalIcon from 'virtual:icons/proicons/shape-intersect'
import TextIcon from 'virtual:icons/proicons/text'
// COMPONENTS
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
import { Button, Select } from '#lib/bits/core/index.js'
import { isRangeProperty } from '#lib/properties/range.js'
import FeatureFieldLinks from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldLinks.svelte'
import FeatureFieldInterval from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldInterval.svelte'
import FormProjectLayersSection from '#lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'
import DisplayTemplateEditor from '#lib/bits/patterns/forms/displayTemplate/DisplayTemplateEditor.svelte'
import ResearchSessionSkeleton from './ResearchSessionSkeleton.svelte'
import ResearchMultiSelectDefault from './ResearchMultiSelectDefault.svelte'
import * as PropertyCard from '#lib/bits/patterns/cards/layerPropertyCard/components/index.js'
import { Card, Switch } from '#lib/bits/custom/index.js'
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
import type { HeaderCtrl } from '#lib/context/header.svelte.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// DOMAIN
import { validResearchPropertyDefault } from '#lib/fieldResearch/configurationMigration.js'
import {
  resolveResearchConfiguration,
  researchConfigurationVersion,
  researchConfigurationSchema,
  researchPropertyIncluded,
  initialResearchProperties,
  researchFeatureDefaultsSchema,
  researchFieldVisibilitySchema,
  researchLayerOverridesSchema,
} from '#lib/fieldResearch/configuration.js'
import type {
  ResearchConfiguration,
  ResearchLayerOverrides,
} from '#lib/fieldResearch/configuration.js'

type LayerChoice = {
  layerId: string
  isDefault: boolean
  overrides: ResearchLayerOverrides
}
let {
  sessionId,
  section = 'all',
  revision,
  layers,
  disabled: locked,
  allowMigration = false,
  header,
  onSaved,
}: {
  sessionId: string
  section?: 'all' | 'core' | 'fields'
  revision: number
  layers: Awaited<ReturnType<typeof getResearchLayers>>
  disabled: boolean
  allowMigration?: boolean
  header?: HeaderCtrl
  onSaved: () => Promise<void>
} = $props()
let data = $state<Awaited<ReturnType<typeof getResearchConfiguration>> | null>(null)
let settings = $state<ResearchConfiguration | null>(null)
let configured = $state<LayerChoice[]>([])
let active = $state('session')
let busy = $state(false)
let failure = $state('')
let validateCode = $state(false)
let migration = $state<Awaited<ReturnType<typeof previewResearchMigration>> | null>(
  null,
)
const adminCtx = getAdminCtx()
const inputId = $props.id()
const control =
  'min-w-0 max-w-full rounded-lg border border-border/50 bg-transparent px-3 py-2 text-sm text-foreground'
const defaultSelectClass =
  'h-auto! min-h-12 w-full! max-w-full min-w-0 border-0! px-0! [&>div]:gap-2! [&>div]:p-0! [&>div>span]:overflow-visible! [&>div>span]:pl-0! [&>div>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:pl-0! [&>span]:whitespace-normal!'
const editing = $derived(header?.state.isEditing ?? true)
const disabled = $derived(locked || !editing || busy)
const codeIssue = $derived(
  validateCode && !settings?.code.trim() ? 'Enter a session code.' : undefined,
)
let baseline = $state('')
const draft = $derived(JSON.stringify([settings, configured]))
let mounted = false

$effect(() => {
  header?.setFormActions({
    dirty: Boolean(baseline && baseline !== draft),
    canEdit: Boolean(settings) && !locked,
    isSubmitting: busy,
    canPublish: false,
    showPublishAction: false,
    submit: save,
    reset: restore,
  })
})

/** Restore the last loaded configuration and its layer overrides. @returns Nothing. */
function restore(): void {
  if (!baseline) return
  const [defaults, layers]: [ResearchConfiguration, LayerChoice[]] =
    JSON.parse(baseline)
  settings = defaults
  configured = layers
  if (!layers.some(layer => layer.layerId === active)) active = 'session'
  failure = ''
  validateCode = false
}
const labels = {
  isVisitable: 'Visitable',
  isIntangible: 'Tangible',
  isDraft: 'Draft',
  isPendingReview: 'Pending review',
} as const
const flags = ['isVisitable', 'isIntangible', 'isDraft', 'isPendingReview'] as const
const featureFields = ['featureType', ...flags] as const
const selected = $derived(configured.find(layer => layer.layerId === active))
const templateProperties = $derived([
  { path: 'session.code', label: 'Session code' },
  ...(data?.properties ?? []).map(property => ({
    path: `properties.${property.id}`,
    label: property.i18n?.en?.label || property.key,
    code: property.key,
    options:
      property.cardinality !== 'many' && property.values?.length
        ? property.values.map(value => {
            const label = value.i18n?.en?.value || value.value || value.id
            return { value: label, label }
          })
        : undefined,
  })),
])

// Use the same option labels and inherited defaults a new capture will receive.
const previewValues = $derived.by(() => {
  if (!settings) return {}
  const effective = resolveResearchConfiguration(settings, selected?.overrides)
  const values: Record<string, string | number | boolean | null> = {
    'session.code': effective.code,
    'session.sequence': 1,
  }
  for (const property of data?.properties ?? []) {
    const field = effective.properties[property.id]
    const value = field?.defaultValue
    if (!field?.isRecordable || value == null) continue
    const label = (id: string) => {
      const option = property.values?.find(option => option.id === id)
      return option?.i18n?.en?.value || option?.value || id
    }
    values['properties.' + property.id] = Array.isArray(value)
      ? value.map(label).join(', ')
      : property.values?.length
        ? label(String(value))
        : value
  }
  return values
})

/** Load the current configuration without creating one for legacy sessions.
 * @returns Once the authorized session settings are available.
 */
async function load(cacheRevision = revision): Promise<void> {
  try {
    data = await refreshRemoteQuery(
      getResearchConfiguration({ sessionId, revision: cacheRevision }),
    )
    migration = null
    if (data.version !== researchConfigurationVersion) {
      settings = null
      configured = []
      baseline = ''
      return
    }
    settings = data.settings
      ? researchConfigurationSchema.parse(data.settings)
      : {
          code: '',
          properties: {},
          fieldVisibility: researchFieldVisibilitySchema.parse(undefined),
          defaults: {
            ...researchFeatureDefaultsSchema.parse(undefined),
            featureType:
              layers.find(
                layer =>
                  layer.id ===
                  data?.configuredLayers.find(item => item.isDefault)?.layerId,
              )?.suggestedFeatureType ??
              layers[0]?.suggestedFeatureType ??
              data.types.find(type => type.enabled !== false)?.id ??
              'object',
          },
          titleTemplate: '{{session.code}}-{{000}}',
        }
    const savedProperties = data.settings?.properties ?? {}
    settings.properties = initialResearchProperties(
      data.properties,
      Object.fromEntries(
        data.configuredLayers.map(layer => [
          layer.layerId,
          data!.layerPropertyDefaults[layer.layerId] ?? {},
        ]),
      ),
      settings.properties,
    )
    configured = data.configuredLayers.map(layer => ({
      ...layer,
      overrides: researchLayerOverridesSchema.parse({
        ...layer.overrides,
        defaults: {
          ...(!data!.settings &&
          layers.find(item => item.id === layer.layerId)?.suggestedFeatureType
            ? {
                featureType: layers.find(item => item.id === layer.layerId)!
                  .suggestedFeatureType!,
              }
            : {}),
          ...layer.overrides.defaults,
        },
        properties: {
          ...Object.fromEntries(
            data!.properties
              .filter(property => !savedProperties[property.id])
              .map(property => {
                const included =
                  data!.layerPropertyDefaults[layer.layerId]?.[property.id]
                    ?.isVisible ?? false
                return [property.id, { isVisible: included, isRecordable: included }]
              }),
          ),
          ...layer.overrides.properties,
        },
      }),
    }))
    baseline = JSON.stringify([settings, configured])
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
}
/** Include or remove one layer from this session's configuration.
 * @param id Layer identity. @param include Whether to include it. @returns Nothing.
 */
function toggleLayer(id: string, include: boolean): void {
  if (include)
    configured = [
      ...configured,
      {
        layerId: id,
        isDefault: false,
        overrides: researchLayerOverridesSchema.parse({
          defaults: layers.find(layer => layer.id === id)?.suggestedFeatureType
            ? {
                featureType: layers.find(layer => layer.id === id)!
                  .suggestedFeatureType!,
              }
            : {},
          properties: Object.fromEntries(
            (data?.properties ?? []).map(property => {
              const included =
                data?.layerPropertyDefaults[id]?.[property.id]?.isVisible ?? false
              return [property.id, { isVisible: included, isRecordable: included }]
            }),
          ),
        }),
      },
    ]
  else {
    configured = configured.filter(layer => layer.layerId !== id)
    if (active === id) active = 'session'
  }
}
/** Change one layer flag while preserving an explicit false and the inherited state.
 * @param flag Feature flag. @param value Inheritance choice. @returns Nothing.
 */
function setFlag(flag: (typeof flags)[number], value: string): void {
  if (!selected) return
  if (value === 'inherit') delete selected.overrides.defaults[flag]
  else
    selected.overrides.defaults[flag] =
      flag === 'isIntangible' ? value !== 'true' : value === 'true'
}
/** Include a property in recording, or inherit the session choice.
 * @param id Project property. @param value Inclusion or inheritance. @returns Nothing.
 */
function setProperty(id: string, value: boolean | null): void {
  if (!settings) return
  const properties = selected ? selected.overrides.properties : settings.properties
  if (value === null && selected) {
    if (properties[id]) {
      delete selected.overrides.properties[id].isVisible
      delete selected.overrides.properties[id].isRecordable
    }
  } else {
    properties[id] = {
      ...properties[id],
      isVisible: value === true,
      isRecordable: value === true,
    }
  }
}
/** Set a project property's default without changing its inclusion.
 * @param id Property identity. @param value Valid option IDs or scalar value. @returns Nothing.
 */
function setPropertyDefault(
  id: string,
  value: string | number | boolean | string[] | null | undefined,
): void {
  if (!settings) return
  if (selected) {
    selected.overrides.properties[id] ??= {}
    if (value === undefined) delete selected.overrides.properties[id].defaultValue
    else selected.overrides.properties[id].defaultValue = value
  } else {
    settings.properties[id] ??= { isVisible: false, isRecordable: false }
    settings.properties[id].defaultValue = value
  }
}
/** Count explicit value overrides, excluding inherited layer inclusion settings. @param overrides Layer choices. @returns Override count. */
function countOverrides(overrides: ResearchLayerOverrides): number {
  return (
    Object.keys(overrides.defaults).length +
    Number(overrides.titleTemplate !== undefined) +
    Object.values(overrides.properties).reduce(
      (count, property) => count + Number(property.defaultValue !== undefined),
      0,
    )
  )
}
/** Save one coherent session revision.
 * @returns Once the server accepts the configuration and refreshes session state.
 */
async function save(): Promise<void> {
  if (!settings || disabled) return
  failure = ''
  validateCode = true
  if (!settings.code.trim()) return
  busy = true
  try {
    const nextRevision = revision + 1
    for (const choices of [
      settings.properties,
      ...configured.map(layer => layer.overrides.properties),
    ]) {
      for (const [id, choice] of Object.entries(choices)) {
        const property = data?.properties.find(property => property.id === id)
        if (property && !validResearchPropertyDefault(property, choice.defaultValue))
          throw new Error(
            `Choose a valid default for ${property.i18n?.en?.label || property.key}.`,
          )
      }
    }
    const checked = researchConfigurationSchema.safeParse(settings)
    if (!checked.success)
      throw new Error(
        checked.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      )
    await saveResearchConfiguration({
      sessionId,
      revision,
      settings,
      schemaVersion: researchConfigurationVersion,
      layers: configured,
    })
    await onSaved()
    await load(nextRevision)
    validateCode = false
    if (mounted && !failure) header?.setEditing(false)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
/** Preview or apply the exact schema upgrade offered for this session. @returns Once the view refreshes. */
async function upgrade(): Promise<void> {
  if (!data || busy) return
  busy = true
  failure = ''
  const input = {
    sessionId,
    revision,
    from: data.version,
    to: researchConfigurationVersion,
  } as const
  try {
    if (!migration)
      migration = await refreshRemoteQuery(previewResearchMigration(input))
    else {
      await migrateResearchConfiguration({ ...input, token: migration.token })
      await onSaved()
      await load(input.revision + 1)
    }
  } catch (error) {
    migration = null
    failure = error instanceof Error ? error.message : String(error)
    await onSaved()
    await load()
  } finally {
    busy = false
  }
}
onMount(() => {
  mounted = true
  header?.setEditing(false)
  void load()
})
onDestroy(() => {
  mounted = false
  header?.clearFormActions()
  header?.setEditing(false)
})
</script>

{#snippet layerScope()}
  {#if configured.length}
    <Select
      variant="ghost"
      class="min-w-56 [&_span]:visible! [&_span]:opacity-100!"
      triggerAttrs={{ 'aria-label': 'Settings scope' }}
      value={active}
      items={[
        { value: 'session', label: 'Session defaults' },
        ...configured.map(layer => ({
          value: layer.layerId,
          label: layers.find(item => item.id === layer.layerId)?.name ?? layer.layerId,
        })),
      ]}
      onValueChange={value => (active = value)}
    >
      {#snippet itemLabel(value: string)}
        {@const layer = configured.find(item => item.layerId === value)}
        {@const count = layer ? countOverrides(layer.overrides) : 0}
        <span class="inline-flex items-center gap-2">
          <span
            >{value === 'session'
              ? 'Session defaults'
              : (layers.find(item => item.id === value)?.name ?? value)}</span
          >
          {#if count > 0}
            <span
              class="bg-base-300 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
              title={count + ' value overrides'}
              >{count}</span
            >
          {/if}
        </span>
      {/snippet}
    </Select>
  {/if}
{/snippet}

{#snippet configuration()}
  {#if data && data.version !== researchConfigurationVersion}
    <section class="mx-6 my-5 space-y-3" aria-label="Session configuration migration">
      <h2 class="font-semibold">Session configuration version {data.version}</h2>
      {#if data.version > researchConfigurationVersion}
        <p>
          This session requires a newer application. Its settings are read-only here.
        </p>
      {:else}
        <p>
          Migrate to version {researchConfigurationVersion} before editing this session
          or recording Features.
        </p>
        {#if migration}
          {#each [
            ['Settings that could not be carried over', migration.removed],
            ['Settings receiving defaults', migration.defaulted],
            ['Settings updated', migration.changed],
          ] as [title, paths]}
            {#if Array.isArray(paths) && paths.length}
              <h3>{title}</h3>
              <ul class="list-inside list-disc">
                {#each paths as path}
                  <li>{path}</li>
                {/each}
              </ul>
            {/if}
          {/each}
          {#if !migration.removed.length &&
            !migration.defaulted.length &&
            !migration.changed.length}
            <p>All settings can be carried over.</p>
          {/if}
        {/if}
        <Button
          text={migration ? 'Apply migration' : 'Review migration'}
          disabled={busy || Boolean(locked && !allowMigration)}
          onClick={upgrade}
        />
      {/if}
      {#if failure}
        <p role="alert">{failure}</p>
      {/if}
    </section>
  {:else if failure && (!settings || !data)}
    <p role="alert" class="text-error mt-4">{failure}</p>
  {:else if !settings || !data}
    <ResearchSessionSkeleton {section} />
  {:else}
    <div class="min-w-0">
      {#if failure}
        <p role="alert" class="text-error">{failure}</p>
      {/if}
      {#if codeIssue && section === 'fields'}
        <p role="alert" class="text-error">Enter a session code on the Profile tab.</p>
      {/if}
      {#if section !== 'fields'}
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <section class="min-w-0">
            <SectionHeader
              class="relative z-10 shadow-sm"
              title="Session details"
              icon={LayersIcon}
            />
            <div class="grid items-start gap-6 px-6 py-5">
              <TextInput
                id={inputId + '-code'}
                label="Session code"
                variant="resource"
                bind:value={settings.code}
                isEditing={editing}
                trimOnBlur={false}
                required
                issues={codeIssue ? [codeIssue] : undefined}
                errorId={inputId + '-code-error'}
                {disabled}
                inputAttrs={{
                  maxlength: 100,
                  'aria-required': true,
                  'aria-invalid': codeIssue ? 'true' : undefined,
                  'aria-describedby': codeIssue ? inputId + '-code-error' : undefined,
                }}
              />
            </div>
          </section>
          <FormProjectLayersSection
            class="[&>header]:relative [&>header]:z-10 [&>header]:shadow-sm"
            title="Layers"
            items={layers.map(layer => ({
              id: layer.id,
              layerName: layer.name,
              projectNameShort: '',
              isIncluded: configured.some(item => item.layerId === layer.id),
              isDefaultVisible: configured.some(
                item => item.layerId === layer.id && item.isDefault,
              ),
            }))}
            isEditing={!disabled}
            defaultControl="selection"
            onToggleIncluded={toggleLayer}
            onToggleDefault={(id, checked) => {
              for (const item of configured)
                item.isDefault = checked && item.layerId === id
            }}
          />
        </div>
      {/if}
      {#if section !== 'fields'}
        <section>
          <SectionHeader
            class="relative z-10 shadow-sm"
            title="Feature fields"
            icon={TagIcon}
            right={layerScope}
          />
          <div class="mx-6 flex min-w-0 flex-col gap-3 py-5">
            {#each featureFields as key}
              {@const label = key === 'featureType' ? 'Feature type' : labels[key]}
              <ResourceCard.Root
                reserveDragSpace={true}
                class="border-border bg-foreground/4 min-h-14 flex-wrap gap-y-2 rounded-lg border bg-none shadow-none before:hidden"
              >
                <Card.Body title={label} />
                <div
                  class="ml-auto grid w-72 max-w-full min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-2"
                >
                  <span class="text-muted-foreground text-xs">Default</span>
                  {#if key === 'featureType'}
                    <Select
                      variant="ghost"
                      reserveTriggerSpace={true}
                      class={defaultSelectClass}
                      triggerClass="gap-2!"
                      isEditing={editing}
                      triggerAttrs={{ 'aria-label': label + ' default value' }}
                      {disabled}
                      items={[
                        ...(selected
                          ? [
                              {
                                value: 'inherit',
                                label:
                                  'Inherit (' + settings.defaults.featureType + ')',
                              },
                            ]
                          : []),
                        ...(selected
                          ? (layers.find(layer => layer.id === selected.layerId)
                              ?.types ?? [])
                          : data.types
                        )
                          .filter(type => type.enabled !== false)
                          .map(type => ({
                            value: type.id,
                            label: type.label ?? type.id,
                          })),
                      ]}
                      value={selected
                        ? (selected.overrides.defaults.featureType ?? 'inherit')
                        : settings.defaults.featureType}
                      onValueChange={value => {
                        if (selected) {
                          if (value === 'inherit')
                            delete selected.overrides.defaults.featureType
                          else selected.overrides.defaults.featureType = value
                        } else if (settings) settings.defaults.featureType = value
                      }}
                    />
                  {:else}
                    {@const sessionValue =
                      key === 'isIntangible'
                        ? !settings.defaults[key]
                        : settings.defaults[key]}
                    {@const override = selected?.overrides.defaults[key]}
                    <Select
                      variant="ghost"
                      reserveTriggerSpace={true}
                      class={defaultSelectClass}
                      triggerClass="gap-2!"
                      isEditing={editing}
                      triggerAttrs={{ 'aria-label': label + ' default value' }}
                      {disabled}
                      items={[
                        ...(selected
                          ? [
                              {
                                value: 'inherit',
                                label:
                                  'Inherit (' + (sessionValue ? 'Yes' : 'No') + ')',
                              },
                            ]
                          : []),
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' },
                      ]}
                      value={selected
                        ? override === undefined
                          ? 'inherit'
                          : String(key === 'isIntangible' ? !override : override)
                        : String(sessionValue)}
                      onValueChange={value => {
                        if (selected) setFlag(key, value)
                        else if (settings)
                          settings.defaults[key] =
                            key === 'isIntangible' ? value !== 'true' : value === 'true'
                      }}
                    />
                  {/if}
                </div>
                <Card.Actions
                  padding="md"
                  bg="none"
                  class="bits-form__parent-resource-actions-rail border-border/60 w-auto! min-w-0! border-l pr-6!"
                >
                  <label
                    for={inputId + '-visible-' + key}
                    class="bits-form__parent-resource-default"
                  >
                    <span class="text-xs"
                      >Include<span class="sr-only"> · {label}</span></span
                    >
                    <Switch
                      id={inputId + '-visible-' + key}
                      size="sm"
                      {disabled}
                      states={selected ? 3 : 2}
                      checked={selected
                        ? (selected.overrides.fieldVisibility[key] ?? null)
                        : settings.fieldVisibility[key]}
                      onCheckedChange={value => {
                        if (selected) {
                          if (value === null)
                            delete selected.overrides.fieldVisibility[key]
                          else selected.overrides.fieldVisibility[key] = value
                        } else if (settings)
                          settings.fieldVisibility[key] = value === true
                      }}
                    />
                  </label>
                </Card.Actions>
              </ResourceCard.Root>
            {/each}
          </div>
        </section>
      {/if}
      {#if section !== 'core' && (data.properties.length || section === 'fields')}
        <section>
          <SectionHeader
            class="relative z-10 shadow-sm"
            title="Project properties"
            icon={PropertiesIcon}
            right={layerScope}
          />
          <PropertyCard.Wrapper>
            {#each data.properties as property (property.id)}
              {@const own = selected
                ? selected.overrides.properties[property.id]
                : settings.properties[property.id]}
              {@const hubCode = property.hubId
                ? adminCtx.view.cache.hub.get(property.hubId)?.code
                : null}
              {@const scope =
                property.scope === 'organisation'
                  ? 'org'
                  : property.scope === 'hub' && (!hubCode || hubCode === 'core')
                    ? 'global'
                    : property.scope === 'hub'
                      ? 'hub'
                      : 'project'}
              <PropertyCard.Root
                class="grid! min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem_8rem]"
              >
                <PropertyCard.Body
                  name={property.i18n?.en?.label || property.key}
                  scopeLabel={scope}
                  scopeTone={scope}
                  iconComponent={property.type === 'classifier'
                    ? CategoricalIcon
                    : TextIcon}
                  iconTitle={property.type === 'classifier'
                    ? 'Categorical field'
                    : 'Free form field'}
                />
                <div class="flex min-w-0 flex-col gap-1 px-4 text-xs">
                  {#if selected &&
                    !(property.values?.length && property.cardinality !== 'many') &&
                    property.dataType !== 'boolean'}
                    <Select
                      variant="ghost"
                      class={defaultSelectClass}
                      isEditing={editing}
                      {disabled}
                      triggerAttrs={{
                        'aria-label':
                          (property.i18n?.en?.label || property.key) +
                          ' default source',
                      }}
                      value={own?.defaultValue === undefined ? 'session' : 'custom'}
                      items={[
                        { value: 'session', label: 'Session default' },
                        { value: 'custom', label: 'Custom default' },
                      ]}
                      onValueChange={value =>
                        setPropertyDefault(
                          property.id,
                          value === 'session' ? undefined : null,
                        )}
                    />
                  {/if}
                  {#if !selected ||
                    own?.defaultValue !== undefined ||
                    (property.values?.length && property.cardinality !== 'many') ||
                    property.dataType === 'boolean'}
                    <div
                      class="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3"
                    >
                      <label
                        for={`${inputId}-property-default-${property.id}`}
                        class="text-muted-foreground"
                        >Default</label
                      >
                      {#if isRangeProperty(property)}
                        <FeatureFieldInterval
                          definition={property}
                          value={String(own?.defaultValue ?? '')}
                          isEditing={!disabled}
                          onChange={value =>
                            setPropertyDefault(property.id, value || null)}
                        />
                      {:else if property.dataType === 'link'}
                        <FeatureFieldLinks
                          cardinality={property.cardinality}
                          value={String(own?.defaultValue ?? '')}
                          isEditing={!disabled}
                          onChange={value =>
                            setPropertyDefault(property.id, value || null)}
                        />
                      {:else if property.values?.length &&
                        property.cardinality === 'many'}
                        <ResearchMultiSelectDefault
                          id={`${inputId}-property-default-${property.id}`}
                          label={property.i18n?.en?.label || property.key}
                          options={property.values.map(value => ({
                            value: value.id,
                            label: value.i18n?.en?.value || value.value || value.id,
                          }))}
                          value={Array.isArray(own?.defaultValue)
                            ? own.defaultValue
                            : []}
                          {disabled}
                          onChange={value => setPropertyDefault(property.id, value)}
                        />
                      {:else if property.values?.length}
                        <Select
                          variant="ghost"
                          reserveTriggerSpace={true}
                          class={defaultSelectClass}
                          triggerClass="gap-2!"
                          isEditing={editing}
                          triggerAttrs={{
                            id: `${inputId}-property-default-${property.id}`,
                            'aria-label':
                              (property.i18n?.en?.label || property.key) +
                              ' default value',
                          }}
                          {disabled}
                          allowDeselect={true}
                          placeholder="No default"
                          items={[
                            ...(selected
                              ? [{ value: '__session__', label: 'Session default' }]
                              : []),
                            ...property.values.map(value => ({
                              value: value.id,
                              label: value.i18n?.en?.value || value.value || value.id,
                            })),
                          ]}
                          value={selected && own?.defaultValue === undefined
                            ? '__session__'
                            : String(own?.defaultValue ?? '')}
                          onValueChange={value =>
                            setPropertyDefault(
                              property.id,
                              value === '__session__' ? undefined : value || null,
                            )}
                        />
                      {:else if property.dataType === 'boolean'}
                        <Select
                          variant="ghost"
                          reserveTriggerSpace={true}
                          class={defaultSelectClass}
                          triggerClass="gap-2!"
                          isEditing={editing}
                          triggerAttrs={{
                            id: `${inputId}-property-default-${property.id}`,
                            'aria-label':
                              (property.i18n?.en?.label || property.key) +
                              ' default value',
                          }}
                          {disabled}
                          allowDeselect={true}
                          placeholder="No default"
                          items={[
                            ...(selected
                              ? [{ value: '__session__', label: 'Session default' }]
                              : []),
                            { value: 'true', label: 'Yes' },
                            { value: 'false', label: 'No' },
                          ]}
                          value={selected && own?.defaultValue === undefined
                            ? '__session__'
                            : own?.defaultValue == null
                              ? ''
                              : String(own.defaultValue)}
                          onValueChange={value =>
                            setPropertyDefault(
                              property.id,
                              value === '__session__'
                                ? undefined
                                : value === ''
                                  ? null
                                  : value === 'true',
                            )}
                        />
                      {:else if property.type === 'classifier'}
                        <span class="text-muted-foreground py-3 text-sm"
                          >No options configured</span
                        >
                      {:else}
                        <input
                          id={`${inputId}-property-default-${property.id}`}
                          class={control}
                          type={property.dataType === 'number'
                            ? 'number'
                            : property.dataType === 'date'
                              ? 'date'
                              : 'text'}
                          {disabled}
                          value={String(own?.defaultValue ?? '')}
                          onchange={event =>
                            setPropertyDefault(
                              property.id,
                              event.currentTarget.value === ''
                                ? null
                                : property.dataType === 'number'
                                  ? Number(event.currentTarget.value)
                                  : event.currentTarget.value,
                            )}
                        >
                      {/if}
                    </div>
                  {/if}
                </div>
                <div class="[&_label]:text-muted-foreground flex justify-end px-4 py-2">
                  <Switch
                    topText="Include"
                    id={`${inputId}-${property.id}-included`}
                    size="sm"
                    {disabled}
                    states={selected ? 3 : 2}
                    checked={researchPropertyIncluded(own) ?? (selected ? null : false)}
                    onCheckedChange={value => setProperty(property.id, value)}
                  />
                </div>
              </PropertyCard.Root>
            {/each}
          </PropertyCard.Wrapper>
          {#if !data.properties.length}
            <p class="text-muted-foreground px-6 py-5 text-sm">
              This project has no properties to configure.
            </p>
          {/if}
        </section>
      {/if}
      {#if section !== 'fields'}
        <section>
          <SectionHeader
            class="relative z-10 shadow-sm"
            title="Title template"
            icon={TextIcon}
          />
          <div class="min-w-0 space-y-3 px-6 py-5">
            {#if selected}
              <label
                ><input
                  type="checkbox"
                  checked={selected.overrides.titleTemplate !== undefined}
                  {disabled}
                  onchange={e => {
                    if (selected && settings) {
                      if (e.currentTarget.checked)
                        selected.overrides.titleTemplate = settings.titleTemplate
                      else delete selected.overrides.titleTemplate
                    }
                  }}
                >
                Override session template</label
              >
            {/if}
            {#if !selected || selected.overrides.titleTemplate !== undefined}
              <DisplayTemplateEditor
                value={selected?.overrides.titleTemplate ?? settings.titleTemplate}
                onChange={value => {
                  if (selected) selected.overrides.titleTemplate = value
                  else if (settings) settings.titleTemplate = value
                }}
                properties={templateProperties}
                allowSequence={true}
                {previewValues}
                ignoreCase
                isEditing={editing}
                showLLMButton={false}
                {disabled}
              />
            {/if}
          </div>
        </section>
      {/if}
      {#if !header}
        <div class="border-border flex justify-end border-t px-6 py-4">
          <Button
            text="Save session configuration"
            color="primary"
            style="soft"
            {disabled}
            onClick={save}
          />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#if section === 'all'}
  <details
    class="rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm sm:p-6"
  >
    <summary class="cursor-pointer text-lg font-semibold">
      Session configuration
    </summary>
    <div class="mt-5 border-t border-slate-200 pt-5">{@render configuration()}</div>
  </details>
{:else}
  <section aria-label={section === 'fields' ? 'Fields' : 'Profile'}>
    {@render configuration()}
  </section>
{/if}
