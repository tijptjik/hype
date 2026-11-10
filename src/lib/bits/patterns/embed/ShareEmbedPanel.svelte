<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// EMBED
import {
  embedUrl,
  embedMarkup,
  isEmbedCamera,
  embedLanguages,
} from '#lib/embed/config.js'
import { resolveEmbedTargetId } from '#lib/embed/target.js'
import { isMapStyleKey } from '#lib/map/styles/metadata.js'
import {
  SELECTABLE_MAP_STYLE_CATALOG,
  isProjectOnlyMapStyle,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
// COMPONENTS
import FormMapStyleSection from '#lib/bits/patterns/forms/formMapStyleSection/FormMapStyleSection.svelte'
import SelectField from '#lib/bits/custom/form/SelectField.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
import ThemePicker from '#lib/bits/patterns/themePicker/ThemePicker.svelte'
import EmbedResourceRow from './EmbedResourceRow.svelte'
import EmbedCodeField from './EmbedCodeField.svelte'
import EmbedPreview from './EmbedPreview.svelte'
import Checkbox from '#lib/bits/custom/checkbox/Checkbox.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { EmbedLayer } from '#lib/embed/embed.types.js'
import type { EmbedConfig } from '#lib/embed/config.js'
let {
  targetType,
  targetId,
  loadResources,
  initialTheme = 'hype-light',
  initialMapStyle = 'hype-light',
}: {
  initialTheme?: EmbedConfig['theme']
  initialMapStyle?: string
  targetType: string
  targetId: string
  loadResources: () => Promise<EmbedLayer[]>
} = $props()
let rows = $state<EmbedLayer[]>([])
let included = $state<string[]>([])
let active = $state<string[]>([])
let loading = $state(true)
let failure = $state('')
let search = $state('')
let mapStyle = $state<EmbedConfig['mapStyle']>(
  untrack(() =>
    isMapStyleKey(initialMapStyle) && initialMapStyle !== 'hyperAdmin'
      ? initialMapStyle
      : 'hype-light',
  ),
)
let theme = $state<EmbedConfig['theme']>(untrack(() => initialTheme))
let lang = $state<EmbedConfig['lang']>('en')
let languages = $state<NonNullable<EmbedConfig['languages']>>([...embedLanguages])
let follow = $state(false)
let title = $state('Hype map')
let camera = $state<EmbedConfig['camera']>(null)
let previewCamera = $state<EmbedConfig['camera']>(null)
let preview = $state<HTMLIFrameElement>()
let previewUrl = $state('')
const instanceId = $props.id()
const mapStyles = SELECTABLE_MAP_STYLE_CATALOG.filter(
  style => style.key !== 'hyperAdmin' && !isProjectOnlyMapStyle(style.key),
).map(style => ({
  id: style.key,
  code: style.key,
  i18n: getMapStyleCatalogI18n(style.key),
  previewImagePath: getMapStyleRenderAssetPath(style.key),
}))
const resolvedTargetId = $derived(resolveEmbedTargetId(rows, targetType, targetId))
const matchesTarget = (row: EmbedLayer): boolean =>
  resolvedTargetId !== null &&
  (targetType === 'hub'
    ? row.hubId === resolvedTargetId
    : targetType === 'organisation'
      ? row.organisationId === resolvedTargetId
      : targetType === 'project'
        ? row.projectId === resolvedTargetId
        : row.id === resolvedTargetId)
const config = $derived.by((): EmbedConfig => {
  const result: EmbedConfig = {
    hubs: [],
    organisations: [],
    projects: [],
    layers: included,
    active:
      included.length === 1 ? included : active.filter(id => included.includes(id)),
    mapStyle,
    theme,
    lang,
    languages,
    filters: true,
    camera,
  }
  // Following is explicit and applies to the resource this admin page owns.
  if (follow && resolvedTargetId) {
    result.excluded = rows
      .filter(row => matchesTarget(row) && !included.includes(row.id))
      .map(row => row.id)
    result.layers = included.filter(
      id => !rows.some(row => row.id === id && matchesTarget(row)),
    )
    if (targetType === 'hub') result.hubs = [resolvedTargetId]
    else if (targetType === 'organisation') result.organisations = [resolvedTargetId]
    else if (targetType === 'project') result.projects = [resolvedTargetId]
  }
  return result
})
const relativeUrl = $derived(included.length ? embedUrl(config) : '')
const fullUrl = $derived(
  typeof window !== 'undefined' && relativeUrl
    ? new URL(relativeUrl, window.location.origin).href
    : '',
)
const markup = $derived(embedMarkup(fullUrl, title))
const shown = $derived(
  rows.filter(row =>
    `${row.name} ${row.projectName} ${row.organisationName} ${row.hubName ?? ''}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  ),
)
/** Loads the authorized public catalogue and selects this page's descendants.
 * @returns Completion with rows or a retryable error.
 */
async function load(): Promise<void> {
  loading = true
  failure = ''
  try {
    rows = await loadResources()
    included = rows.filter(matchesTarget).map(row => row.id)
    active = [...included]
  } catch {
    failure = 'Unable to load resources. Please retry.'
  } finally {
    loading = false
  }
}
/** Includes or removes an entire resource's manageable descendants.
 * @param ids Layer identities. @returns Nothing.
 */
function toggle(ids: string[]): void {
  if (ids.every(id => included.includes(id))) {
    included = included.filter(id => !ids.includes(id))
    active = active.filter(id => !ids.includes(id))
  } else {
    included = [...new Set([...included, ...ids])]
    active = [...new Set([...active, ...ids])]
  }
}
$effect(() => {
  const url = relativeUrl
  const timer = setTimeout(() => {
    previewUrl = url
    previewCamera = null
  }, 400)
  return () => clearTimeout(timer)
})
onMount(() => {
  void load()
  const receive = (event: MessageEvent): void => {
    if (
      event.origin !== window.location.origin ||
      event.source !== preview?.contentWindow ||
      event.data?.type !== 'hype-embed-camera'
    )
      return
    const value = event.data.camera
    if (isEmbedCamera(value)) previewCamera = value
  }
  window.addEventListener('message', receive)
  return () => window.removeEventListener('message', receive)
})
</script>
<section
  class="bits-theme bg-panel text-foreground flex h-full min-h-0 flex-col"
  aria-label="Share map"
>
  <header class="border-border shrink-0 border-b p-5">
    <h1 class="text-xl font-semibold">Share · Embed map</h1>
    <p class="mt-1 text-sm opacity-75">
      Choose public resources, set the starting view, and copy your embed.
    </p>
  </header>
  <div
    class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]"
  >
    <section class="border-border overflow-y-auto border-r p-5" aria-label="Content">
      <h2 class="mb-3 font-semibold">Content</h2>
      <input
        aria-label="Search resources"
        placeholder="Search resources"
        type="search"
        bind:value={search}
        class="border-border bg-canvas mb-3 w-full rounded border p-2"
      >
      {#if loading}
        <ContentSkeleton label="Loading resources…"
          >{#each ['Hub', 'Organisation', 'Project', 'Layer'] as kind, index}
            <div class="mb-3" style:margin-left={`${Math.max(0, index - 1) * 12}px`}>
              <EmbedResourceRow
                name="Resource name"
                {kind}
                checked={false}
                onToggle={() => {}}
              />
            </div>
          {/each}</ContentSkeleton
        >
      {:else if failure}
        <p role="alert">{failure}</p>
        <button type="button" onclick={load}>Retry</button>
      {:else if !rows.length}
        <p>No public resources are available to share.</p>
      {/if}
      {#each [
        ...new Map(
          shown.filter(row => row.hubId).map(row => [row.hubId, row.hubName]),
        ).entries(),
      ] as [hubId, hubName]}
        {@const ids = rows.filter(row => row.hubId === hubId).map(row => row.id)}
        <div class="mb-3">
          <EmbedResourceRow
            name={`Hub · ${hubName}`}
            kind="Hub"
            checked={ids.every(id => included.includes(id))}
            mixed={ids.some(id => included.includes(id)) &&
              !ids.every(id => included.includes(id))}
            onToggle={() => toggle(ids)}
          />
        </div>
      {/each}
      {#each [
        ...new Map(
          shown.map(row => [row.organisationId, row.organisationName]),
        ).entries(),
      ] as [orgId, orgName]}
        {@const orgRows = rows.filter(row => row.organisationId === orgId)}
        <div class="mb-5">
          <EmbedResourceRow
            name={orgName}
            kind="Organisation"
            checked={orgRows.every(row => included.includes(row.id))}
            mixed={orgRows.some(row => included.includes(row.id)) &&
              !orgRows.every(row => included.includes(row.id))}
            onToggle={() => toggle(orgRows.map(row => row.id))}
          />
          {#each [
            ...new Map(
              shown
                .filter(row => row.organisationId === orgId)
                .map(row => [row.projectId, row.projectName]),
            ).entries(),
          ] as [projectId, projectName]}
            {@const projectRows = rows.filter(row => row.projectId === projectId)}
            <div class="mt-3 ml-3">
              <EmbedResourceRow
                name={projectName}
                kind="Project"
                checked={projectRows.every(row => included.includes(row.id))}
                mixed={projectRows.some(row => included.includes(row.id)) &&
                  !projectRows.every(row => included.includes(row.id))}
                onToggle={() => toggle(projectRows.map(row => row.id))}
              />
            </div>
            {#each shown.filter(row => row.projectId === projectId) as row}
              <div class="mt-3 ml-6">
                <EmbedResourceRow
                  name={row.name}
                  kind="Layer"
                  checked={included.includes(row.id)}
                  onToggle={() => toggle([row.id])}
                  defaultDisabled={!included.includes(row.id) || included.length === 1}
                  defaultOn={included.includes(row.id) &&
                    (included.length === 1 || active.includes(row.id))}
                  onDefault={enabled => {
                    active = enabled
                      ? [...new Set([...active, row.id])]
                      : active.filter(id => id !== row.id)
                  }}
                />
              </div>
            {/each}
          {/each}
        </div>
      {/each}
      {#if targetType !== 'layer' && rows.some(matchesTarget)}
        <div
          class="border-border my-4 flex items-start justify-between gap-3 rounded-lg border p-4"
        >
          <label for={`${instanceId}-follow`} class="min-w-0 text-sm">
            Follow this {targetType}'s future public layers
            <span class="text-muted-foreground mt-1 block text-xs"
              >Keep your current selection. New layers become available but start
              off.</span
            >
          </label>
          <Switch
            id={`${instanceId}-follow`}
            checked={follow}
            onCheckedChange={value => {
              follow = value === true
            }}
            size="sm"
          />
        </div>
      {/if}
    </section>
    <section
      class="flex min-w-0 flex-col gap-4 overflow-y-auto p-5 [&>*]:shrink-0"
      aria-label="Appearance and preview"
    >
      <FormMapStyleSection
        title="Map style"
        availableMapStyles={mapStyles}
        selectedMapStyle={mapStyles.find(style => style.code === mapStyle)}
        allowUserPreference={false}
        onSelectMapStyle={style => {
          if (isMapStyleKey(style.code)) mapStyle = style.code
        }}
      />
      <ThemePicker
        compact
        label="Interface theme"
        value={theme}
        onSelect={value => {
          theme = value
        }}
      />
      <fieldset class="min-w-0">
        <legend
          class="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.18em] uppercase"
        >
          Language
        </legend>
        <div
          class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-4"
        >
          <fieldset class="min-w-0">
            <legend class="text-muted-foreground mb-3 text-xs font-semibold">
              Supported languages
            </legend>
            <div class="flex flex-wrap gap-4">
              {#each embedLanguages as language}
                <Checkbox
                  id={`${instanceId}-${language}`}
                  checked={languages.includes(language)}
                  disabled={languages.length === 1 && languages.includes(language)}
                  rightText={language === 'en'
                    ? 'English'
                    : language === 'zh-Hant'
                      ? '繁體中文'
                      : '简体中文'}
                  onCheckedChange={checked => {
                    languages = checked
                      ? [...languages, language]
                      : languages.filter(item => item !== language)
                    if (!languages.includes(lang)) lang = languages[0]
                  }}
                  size="sm"
                />
              {/each}
            </div>
          </fieldset>
          <SelectField
            label="Primary language"
            id={`${instanceId}-language`}
            value={lang}
            items={[
              { value: 'en', label: 'English' },
              { value: 'zh-Hant', label: '繁體中文' },
              { value: 'zh-Hans', label: '简体中文' },
            ].filter(item => languages.includes(item.value as EmbedConfig['lang']))}
            triggerAttrs={{
              id: `${instanceId}-language`,
              'aria-label': 'Primary language',
            }}
            triggerClass="bg-panel! border-border! shadow-none!"
            onValueChange={value => {
              if (value === 'en' || value === 'zh-Hant' || value === 'zh-Hans')
                lang = value
            }}
          />
        </div>
        <p class="text-muted-foreground mt-2 text-xs">
          Visitors can switch languages in Settings. The primary language is used when
          the map opens.
        </p>
      </fieldset>
      <fieldset class="min-w-0">
        <legend
          class="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.18em] uppercase"
        >
          Sharing Options
        </legend>
        <div class="flex min-w-0 flex-col gap-4">
          <TextInputField
            label="Accessible title"
            id={`${instanceId}-title`}
            bind:value={title}
            controlClass="bg-panel! border-border! shadow-none!"
          />
          <EmbedPreview src={previewUrl} bind:frame={preview}>
            {#snippet perspective()}
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="border-border rounded border px-3 py-2"
                  aria-pressed={!camera}
                  onclick={() => {
                    camera = null
                    preview?.contentWindow?.postMessage(
                      { type: 'hype-embed-fit' },
                      window.location.origin,
                    )
                  }}
                >
                  Fit to active layers
                </button><button
                  type="button"
                  class="border-border rounded border px-3 py-2"
                  disabled={!previewCamera}
                  aria-pressed={!!camera}
                  onclick={() => (camera = previewCamera ? [...previewCamera] : null)}
                >
                  Use current view
                </button>
              </div>
            {/snippet}
          </EmbedPreview>
        </div>
      </fieldset>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EmbedCodeField label="Embed URL" value={fullUrl} />
        <EmbedCodeField
          label="Iframe code"
          value={included.length ? markup : ''}
          html
        />
      </div>
    </section>
  </div>
</section>
