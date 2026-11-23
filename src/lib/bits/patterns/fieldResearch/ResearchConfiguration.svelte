<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// API
import {
  getResearchConfiguration,
  saveResearchConfiguration,
  getResearchLayers,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// ICONS
import LayersIcon from 'virtual:icons/proicons/layers'
import EyeIcon from 'virtual:icons/proicons/eye'
import TagIcon from 'virtual:icons/proicons/tag'
import PropertiesIcon from 'virtual:icons/proicons/tag-multiple'
import TextIcon from 'virtual:icons/proicons/text'
// COMPONENTS
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
import { Button, Select } from '#lib/bits/core/index.js'
import FormProjectLayersSection from '#lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'
import DisplayTemplateEditor from '#lib/bits/patterns/forms/displayTemplate/DisplayTemplateEditor.svelte'
import * as PropertyCard from '#lib/bits/patterns/cards/layerPropertyCard/components/index.js'
import { Card, Switch } from '#lib/bits/custom/index.js'
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
import type { HeaderCtrl } from '#lib/context/header.svelte.js'
// DOMAIN
import {
  researchConfigurationSchema,
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
  header,
  onSaved,
}: {
  sessionId: string
  section?: 'all' | 'core' | 'fields'
  revision: number
  layers: Awaited<ReturnType<typeof getResearchLayers>>
  disabled: boolean
  header?: HeaderCtrl
  onSaved: () => Promise<void>
} = $props()
let data = $state<Awaited<ReturnType<typeof getResearchConfiguration>> | null>(null)
let settings = $state<ResearchConfiguration | null>(null)
let configured = $state<LayerChoice[]>([])
let active = $state('session')
let busy = $state(false)
let failure = $state('')
const inputId = $props.id()
const control =
  'min-w-0 max-w-full rounded-lg border border-border/50 bg-transparent px-3 py-2 text-sm text-foreground'
const editing = $derived(header?.state.isEditing ?? true)
const disabled = $derived(locked || !editing || busy)
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
    showDeleteAction: false,
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
  })),
])

/** Load the current configuration without creating one for legacy sessions.
 * @returns Once the authorized session settings are available.
 */
async function load(cacheRevision = revision): Promise<void> {
  try {
    data = await refreshRemoteQuery(
      getResearchConfiguration({ sessionId, revision: cacheRevision }),
    )
    settings = data.settings
      ? researchConfigurationSchema.parse(data.settings)
      : {
          code: '',
          properties: {},
          fieldVisibility: researchFieldVisibilitySchema.parse(undefined),
          defaults: {
            ...researchFeatureDefaultsSchema.parse(undefined),
            featureType:
              data.types.find(type => type.enabled !== false)?.id ?? 'object',
          },
          titleTemplate: '{{session.code}}-{{000}}',
        }
    configured = data.configuredLayers.map(layer => ({
      ...layer,
      overrides: researchLayerOverridesSchema.parse(layer.overrides),
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
        overrides: researchLayerOverridesSchema.parse({}),
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
/** Store a property choice on the active scope.
 * @param id Project property. @param key Property setting. @param value Inheritance or boolean choice. @returns Nothing.
 */
function setProperty(
  id: string,
  key: 'isVisible' | 'isRecordable',
  value: string,
): void {
  if (!settings) return
  if (!selected) {
    settings.properties[id] = {
      ...(settings.properties[id] ?? { isVisible: false, isRecordable: false }),
      [key]: value === 'true',
    }
  } else if (value === 'inherit') {
    if (selected.overrides.properties[id]) delete selected.overrides.properties[id][key]
  } else {
    selected.overrides.properties[id] = {
      ...selected.overrides.properties[id],
      [key]: value === 'true',
    }
  }
}
/** Set a project property's default without changing its visibility.
 * @param id Property identity. @param value Valid option IDs or scalar value. @returns Nothing.
 */
function setPropertyDefault(
  id: string,
  value: string | number | boolean | string[] | null,
): void {
  if (!settings) return
  if (selected) {
    selected.overrides.properties[id] ??= {}
    selected.overrides.properties[id].defaultValue = value
  } else {
    settings.properties[id] ??= { isVisible: false, isRecordable: false }
    settings.properties[id].defaultValue = value
  }
}
/** Save one coherent session revision.
 * @returns Once the server accepts the configuration and refreshes session state.
 */
async function save(): Promise<void> {
  if (!settings || disabled) return
  busy = true
  failure = ''
  try {
    const nextRevision = revision + 1
    await saveResearchConfiguration({
      sessionId,
      revision,
      settings,
      layers: configured,
    })
    await onSaved()
    await load(nextRevision)
    if (mounted && !failure) header?.setEditing(false)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
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
    />
  {/if}
{/snippet}

{#snippet configuration()}
  {#if failure && (!settings || !data)}
    <p role="alert" class="text-error mt-4">{failure}</p>
  {:else if !settings || !data}
    <div
      class="bg-base-200 mt-4 h-40 animate-pulse rounded-lg"
      role="status"
      aria-busy="true"
      aria-label="Loading session configuration"
    ></div>
  {:else}
    <div class="min-w-0">
      {#if failure}
        <p role="alert" class="text-error">{failure}</p>
      {/if}
      {#if section !== 'fields'}
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <section class="min-w-0">
            <SectionHeader title="Session details" icon={LayersIcon} />
            <div class="grid items-start gap-6 px-6 py-5">
              <TextInput
                id={inputId + '-code'}
                label="Session code"
                variant="resource"
                bind:value={settings.code}
                isEditing={editing}
                trimOnBlur={false}
                {disabled}
                inputAttrs={{ maxlength: 100 }}
              />
            </div>
          </section>
          <FormProjectLayersSection
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
          <SectionHeader title="Feature fields" icon={TagIcon} right={layerScope} />
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
                      class="h-auto! min-h-12 w-full! max-w-full min-w-0 border-0! px-0! [&>div]:gap-2! [&>div]:p-0! [&>div>span]:overflow-visible! [&>div>span]:pl-0! [&>div>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:pl-0! [&>span]:whitespace-normal!"
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
                      class="h-auto! min-h-12 w-full! max-w-full min-w-0 border-0! px-0! [&>div]:gap-2! [&>div]:p-0! [&>div>span]:overflow-visible! [&>div>span]:pl-0! [&>div>span]:whitespace-normal! [&>span]:overflow-visible! [&>span]:pl-0! [&>span]:whitespace-normal!"
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
                    <span class="bits-form__parent-resource-default-icon [&_svg]:size-4"
                      ><EyeIcon /></span
                    >
                    <span class="bits-form__parent-resource-default-label"
                      >{selected &&
                      selected.overrides.fieldVisibility[key] === undefined
                        ? 'Inherited'
                        : 'Visible'}<span class="sr-only"> · {label}</span></span
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
            title="Project properties"
            icon={PropertiesIcon}
            right={layerScope}
          />
          <PropertyCard.Wrapper>
            {#each data.properties as property (property.id)}
              {@const own = selected
                ? selected.overrides.properties[property.id]
                : settings.properties[property.id]}
              <PropertyCard.Root class="min-w-0 flex-wrap">
                <PropertyCard.Body
                  name={property.i18n?.en?.label || property.key}
                  scopeLabel={property.scope}
                  scopeTone={property.scope === 'organisation'
                    ? 'org'
                    : property.scope === 'hub'
                      ? 'hub'
                      : 'project'}
                />
                <div class="flex flex-wrap gap-2">
                  {#each ['isVisible', 'isRecordable'] as key}
                    <label class="flex flex-col text-xs"
                      >{key === 'isVisible' ? 'Visible' : 'Recordable'}
                      <select
                        class={control}
                        {disabled}
                        value={own?.[key as 'isVisible' | 'isRecordable'] === undefined
                          ? selected
                            ? 'inherit'
                            : 'false'
                          : String(own[key as 'isVisible' | 'isRecordable'])}
                        onchange={e =>
                          setProperty(
                            property.id,
                            key as 'isVisible' | 'isRecordable',
                            e.currentTarget.value,
                          )}
                      >
                        {#if selected}
                          <option value="inherit">Inherit</option>
                        {/if}
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </label>
                  {/each}
                </div>
                <div class="flex flex-col gap-1 text-xs">
                  {#if selected}
                    <label
                      ><input
                        type="checkbox"
                        {disabled}
                        checked={own?.defaultValue !== undefined}
                        onchange={event => {
                          if (selected) {
                            selected.overrides.properties[property.id] ??= {}
                            if (event.currentTarget.checked)
                              selected.overrides.properties[property.id].defaultValue =
                                settings?.properties[property.id]?.defaultValue ?? null
                            else
                              delete selected.overrides.properties[property.id]
                                .defaultValue
                          }
                        }}
                      >
                      Override value</label
                    >
                  {/if}
                  {#if !selected || own?.defaultValue !== undefined}
                    <label for={`${inputId}-property-default-${property.id}`}
                      >Default value
                      {#if property.values?.length && property.cardinality === 'many'}
                        <select
                          id={`${inputId}-property-default-${property.id}`}
                          class={control}
                          multiple
                          {disabled}
                          value={Array.isArray(own?.defaultValue)
                            ? own.defaultValue
                            : []}
                          onchange={event =>
                            setPropertyDefault(
                              property.id,
                              Array.from(
                                event.currentTarget.selectedOptions,
                                option => option.value,
                              ),
                            )}
                        >
                          {#each property.values as value}
                            <option value={value.id}>
                              {value.i18n?.en?.value || value.value}
                            </option>
                          {/each}
                        </select>
                      {:else if property.values?.length}
                        <select
                          id={`${inputId}-property-default-${property.id}`}
                          class={control}
                          {disabled}
                          value={String(own?.defaultValue ?? '')}
                          onchange={event =>
                            setPropertyDefault(
                              property.id,
                              event.currentTarget.value || null,
                            )}
                        >
                          <option value="">No default</option>
                          {#each property.values as value}
                            <option value={value.id}>
                              {value.i18n?.en?.value || value.value}
                            </option>
                          {/each}
                        </select>
                      {:else if property.dataType === 'boolean'}
                        <select
                          id={`${inputId}-property-default-${property.id}`}
                          class={control}
                          {disabled}
                          value={own?.defaultValue == null
                            ? ''
                            : String(own.defaultValue)}
                          onchange={event =>
                            setPropertyDefault(
                              property.id,
                              event.currentTarget.value === ''
                                ? null
                                : event.currentTarget.value === 'true',
                            )}
                        >
                          <option value="">No default</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
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
                    </label>
                  {/if}
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
          <SectionHeader title="Title template" icon={TextIcon} />
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
                previewValues={{ 'session.code': settings.code, 'session.sequence': 1 }}
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
