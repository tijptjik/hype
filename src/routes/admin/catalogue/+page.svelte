<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { onDestroy, untrack } from 'svelte'
import { toast } from 'svelte-sonner'
import { prefersReducedMotion } from 'svelte/motion'
import { fade, slide } from 'svelte/transition'
import { goto } from '$app/navigation'
// ICONS
import LayoutGrid from 'virtual:icons/lucide/layout-grid'
import List from 'virtual:icons/lucide/list'
import Building from 'virtual:icons/lucide/building-2'
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import FeatureIcon from 'virtual:icons/proicons/location'
import Tags from 'virtual:icons/lucide/tags'
import ListTree from 'virtual:icons/lucide/list-tree'
import Languages from 'virtual:icons/lucide/languages'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
import RetryIcon from 'virtual:icons/lucide/rotate-cw'
import ImageIcon from 'virtual:icons/lucide/image'
import PhotoIcon from 'virtual:icons/proicons/photo'
import Dropzone from '#lib/bits/patterns/images/components/Dropzone.svelte'
import Download from 'virtual:icons/lucide/download'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import {
  importIdentityCatalogue,
  publishIdentityCatalogueLocations,
  findIdentityCatalogue,
  getIdentityCatalogue,
  publishIdentityCatalogue,
  uploadIdentityCatalogueLogo,
} from '#lib/api/identityCatalogue.remote.js'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
import ResourceRow from '#lib/bits/patterns/resource/rows/ResourceRow/ResourceRow.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { placeTaxonomy, type PlaceTaxonomyNode } from '#lib/locations/placeTaxonomy.js'
import { placeCategoryLabel } from '#lib/locations/placeSearchFilters.js'
import { getLocaleKey, m } from '#lib/i18n.js'
// DOMAIN
import {
  catalogueDisplayName,
  catalogueLogoFallbacks,
} from '#lib/locations/cataloguePresentation.js'
import {
  IdentityCatalogueContentSchema,
  seedIdentityCatalogue,
  type IdentityCatalogueRecord,
  type IdentityCatalogueContent,
} from '#lib/locations/identityCatalogue.js'

const admin = getAdminCtx(),
  header = getHeaderCtrl()
admin.setResourceType(false)
let importStatus = $state('')
let kind = $state<'brand' | 'group'>('brand')
let search = $state('')
let catalogueLayout = $state<'list' | 'card'>('list')
let groupSearch = $state('')
let groups = $state<IdentityCatalogueRecord[]>([])
let newGroup = $state<{ id: string; i18n: IdentityCatalogueContent['i18n'] } | null>(
  null,
)
let previousGroupId: string | null = null
let groupNamesBeforeEdit: Record<string, string> = {}
let namesBeforeEdit: Record<string, string> = {}
$effect(() => {
  const query = groupSearch
  const excludeDescendantsOf =
    kind === 'group'
      ? (selected?.id ?? page.url.searchParams.get('id') ?? undefined)
      : undefined
  let cancelled = false
  const linkedId = content?.groupId
  const inlineId = newGroup?.id
  // Resolve the retained selection independently of the bounded search results.
  void Promise.all([
    findIdentityCatalogue({ kind: 'group', search: query, excludeDescendantsOf }),
    linkedId && linkedId !== inlineId
      ? getIdentityCatalogue({ id: linkedId })
      : Promise.resolve(null),
  ])
    .then(([rows, linked]) => {
      if (!cancelled)
        groups =
          linked && !rows.some(group => group.id === linked.id)
            ? [...rows, linked]
            : rows
    })
    .catch(() => {
      if (!cancelled) failed = true
    })

  return () => {
    cancelled = true
  }
})
/** Flatten the existing classification tree for the shared category picker.
 * @param nodes Taxonomy subtree. @returns Exact taxonomy keys.
 */
function categoryKeys(nodes: PlaceTaxonomyNode[]): string[] {
  return nodes.flatMap(node => [node.name, ...categoryKeys(node.children ?? [])])
}
const categoryOptions = categoryKeys(placeTaxonomy)
let records = $state<IdentityCatalogueRecord[]>([])
let selected = $state<IdentityCatalogueRecord | null>(null)
let content = $state<IdentityCatalogueContent | null>(null)
let busy = $state(false),
  failed = $state(false),
  saved = $state(false),
  refresh = $state(0)
const organisationId = $derived(page.url.searchParams.get('organisation') ?? undefined)
let baseline = $state('')
let loading = $state(true)
let loadingDetail = $state(false)
const routeCode = $derived(page.params.code)
const routeKind = $derived(page.params.kind)
const detail = $derived(
  Boolean(routeCode) ||
    page.url.searchParams.has('id') ||
    page.url.searchParams.has('new'),
)
const featuresActive = $derived(
  selected?.kind === 'brand' && page.url.searchParams.get('facet') === 'features',
)
let multilingual = $state(false)
let selectedLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
let visibleLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const shownLocales = $derived(
  displayedLocales({ selectedLocales, visibleLocales }, multilingual),
)
let logoInput: HTMLInputElement | undefined = $state()
let logoFailed = $state(false)
let logoRetry = $state(0)
$effect(() => {
  content?.logo
  logoFailed = false
  logoRetry = 0
})
const dirty = $derived(content !== null && JSON.stringify(content) !== baseline)
const canEdit = $derived(admin.view.isSuperAdmin() || Boolean(organisationId))
const isEditing = $derived(header.state.isEditing && canEdit)
const valid = $derived(
  content !== null &&
    IdentityCatalogueContentSchema.safeParse(content).success &&
    (!newGroup ||
      IdentityCatalogueContentSchema.shape.i18n.safeParse(newGroup.i18n).success),
)
$effect(() => {
  const title = selected
    ? catalogueDisplayName(selected)
    : content
      ? `New ${kind}`
      : 'Entity Catalog'
  const activeKind = kind
  const cards = catalogueLayout === 'card'
  const isDetail = detail
  const isFeatures = featuresActive
  const hasFeatures = selected?.kind === 'brand'
  const controls = {
    content: isFeatures ? null : localeControl,
    dirty,
    isSubmitting: busy,
    disableSave: !valid || !canEdit,
    canEdit: Boolean(content) && canEdit,
    canPublish: false,
    showPublishAction: false,
    showDeleteAction: false,
    submit: save,
    reset: reset,
  }
  untrack(() => {
    if (isDetail) {
      if (!isFeatures) header.setSearch(null)
      header.setHeaderForEntity(title, Tags, new Map(), { showFacets: hasFeatures })
      if (hasFeatures)
        header.setFacets(
          [
            { ref: 'core', label: 'Profile', icon: null },
            { ref: 'features', label: 'Features', icon: FeatureIcon, hideLabel: true },
          ],
          {
            active: isFeatures ? 'features' : 'core',
            onFacetChange: facet => {
              const url = new URL(page.url.href)
              if (facet === 'features') url.searchParams.set('facet', 'features')
              else url.searchParams.delete('facet')
              void goto(url.pathname + url.search)
            },
          },
        )
      header.setCrumbs([
        {
          name: kind === 'brand' ? 'Brands' : 'Groups',
          href: `/admin/catalogue?kind=${kind}${organisationId ? `&organisation=${organisationId}` : ''}`,
        },
      ])
      header.setFormActions(isFeatures ? { ...controls, canEdit: false } : controls)
    } else {
      header.setHeaderForIndex('Entity Catalog', Tags, {
        showNew: canEdit,
        showFacets: true,
        showFilter: true,
        showLayoutToggle: false,
        showViewActions: true,
        showControlBarToggle: false,
      })
      header.setViewActions([
        {
          text: cards ? 'Show rows' : 'Show cards',
          icon: cards ? List : LayoutGrid,
          color: 'neutral',
          style: 'ghost',
          class: 'px-4',
          alwaysHideLabel: true,
          hideLabelInstantly: true,
          onClick: () => {
            catalogueLayout = cards ? 'list' : 'card'
          },
        },
      ])
      header.setCreateAction(() => openRecord(null))
      header.setFacets(
        new Map([
          ['brand', 'Brands'],
          ['group', 'Groups'],
        ]),
        {
          active: activeKind,
          onFacetChange: value => {
            if (value === 'brand' || value === 'group')
              void goto(
                `/admin/catalogue?kind=${value}${organisationId ? `&organisation=${organisationId}` : ''}`,
              )
          },
        },
      )
      header.clearFooter()
    }
  })
})
$effect(() => {
  if (!detail)
    header.setSearch({
      query: search,
      placeholder: kind === 'brand' ? 'Search brands' : 'Search groups',
      onFilter: value => (search = value.slice(0, 200)),
    })
})
onDestroy(() => {
  header.setSearch(null)
  header.setFormActions({ content: null })
})
$effect(() => {
  refresh
  const type = kind,
    query = search
  let cancelled = false
  loading = true
  failed = false
  void findIdentityCatalogue({ kind: type, search: query })
    .then(value => {
      if (!cancelled) {
        records = value
      }
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
$effect(() => {
  refresh
  const id = page.url.searchParams.get('id')
  if (!id && !routeCode) {
    const requested = page.url.searchParams.get('kind')
    if (requested === 'group' || requested === 'brand') kind = requested
    if (page.url.searchParams.has('new')) untrack(() => edit(null))
    else {
      selected = null
      content = null
      baseline = ''
      header.setEditing(false)
    }
    return
  }
  let cancelled = false
  loadingDetail = true
  failed = false
  const lookup: { id: string } | { kind: 'brand' | 'group'; code: string } =
    routeCode && (routeKind === 'brand' || routeKind === 'group')
      ? { kind: routeKind, code: routeCode }
      : { id: id ?? '' }
  void getIdentityCatalogue(lookup)
    .then(record => {
      if (!cancelled) {
        kind = record.kind
        edit(record)
        if (id && record.code) {
          const url = new URL(page.url.href)
          url.pathname = `/admin/catalog/${record.kind}/${encodeURIComponent(record.code)}`
          url.searchParams.delete('id')
          void goto(url.pathname + url.search, { replaceState: true })
        }
      }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loadingDetail = false
    })
  return () => {
    cancelled = true
  }
})
/** Select a catalogue record without mutating its retained revision.
 * @param record Current record or null for creation. @returns Nothing.
 */
function edit(record: IdentityCatalogueRecord | null): void {
  selected = record
  newGroup = null
  groupSearch = ''
  importStatus = ''
  content = record
    ? structuredClone(
        $state.snapshot({
          i18n: record.i18n,
          logo: record.logo,
          code: record.code,
          categories: record.categories,
          groupId: record.groupId,
        }),
      )
    : {
        i18n: Object.fromEntries(
          ['en', 'zh-Hant', 'zh-Hans'].map(code => [code, { name: '' }]),
        ),
        logo: null,
      }
  selectedLocales = Object.keys(content.i18n)
  visibleLocales = [...selectedLocales]
  baseline = JSON.stringify(content)
  header.setEditing(record === null)
  saved = false
}
/** Discard the draft using the selected record, or return to the first entry after creation.
 * @returns Nothing.
 */
function reset(): void {
  if (selected) edit(selected)
  else
    void goto(
      `/admin/catalogue?kind=${kind}${organisationId ? `&organisation=${organisationId}` : ''}`,
    )
}
/** Save an inspected catalogue revision. @returns Completion with visible success/error. */
async function save(): Promise<void> {
  if (!content || busy || !valid || !dirty || !canEdit) return
  busy = true
  failed = false
  try {
    const record = await publishIdentityCatalogue({
      id: selected?.id ?? crypto.randomUUID(),
      kind: selected?.kind ?? kind,
      expectedVersion: selected?.version ?? 0,
      content: $state.snapshot(content),
      organisationId,
      newGroup: newGroup ? $state.snapshot(newGroup) : undefined,
    })
    newGroup = null
    await findIdentityCatalogue({ kind: 'group', search: groupSearch }).refresh()
    await getIdentityCatalogue({ id: record.id }).refresh()
    if (record.code)
      await getIdentityCatalogue({ kind: record.kind, code: record.code }).refresh()
    await findIdentityCatalogue({ kind, search }).refresh()
    selected = record
    if (page.url.searchParams.has('new') || (record.code ?? undefined) !== routeCode)
      void goto(catalogueHref(record), { replaceState: true })
    content = structuredClone({
      i18n: record.i18n,
      logo: record.logo,
      code: record.code,
      categories: record.categories,
      groupId: record.groupId,
    })
    baseline = JSON.stringify(content)
    header.setEditing(false)
    await publishLinks(record.id)
    saved = true
    toast.success(
      record.kind === 'brand' ? m.catalogue_brand_saved() : m.catalogue_group_saved(),
    )
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
/** Decode a chosen image and upload a bounded PNG, leaving attachment explicit until Save.
 * @param file Local image selection. @returns Completion after the logo preview is ready.
 */
async function upload(file?: File): Promise<void> {
  if (!file || !content || busy) return
  busy = true
  failed = false
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('Logo too large')
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas'),
      scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const result = await uploadIdentityCatalogueLogo({
      data: canvas.toDataURL('image/png').split(',')[1],
      organisationId,
    })
    content = { ...content, logo: result.logo }
    saved = false
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Publish all bounded pages, preserving locked or concurrently edited Locations for retry.
 * @param id Catalogue identity. @returns Completion after the final page.
 */
async function publishLinks(id: string): Promise<void> {
  let after: string | null = null
  let changed = 0,
    failures = 0
  do {
    const result: Awaited<ReturnType<typeof publishIdentityCatalogueLocations>> =
      await publishIdentityCatalogueLocations({
        id,
        after,
        organisationId,
      })
    changed += result.linked
    failures += result.failed.length
    after = result.next
    importStatus = failures
      ? `Updated ${changed} locations. ${failures} could not be updated; try again.`
      : ''
  } while (after)
}
/** Import existing source-brand evidence without inventing groups, formats or branches.
 * @returns Completion after the last bounded Location page.
 */
async function importBrands(): Promise<void> {
  if (busy) return
  busy = true
  failed = false
  let after: string | null = null,
    linked = 0,
    failures = 0
  try {
    do {
      const result: Awaited<ReturnType<typeof importIdentityCatalogue>> =
        await importIdentityCatalogue({ after })
      linked += result.linked
      failures += result.failed.length
      after = result.next
      importStatus = failures
        ? `Linked ${linked} locations. ${failures} could not be linked; try again.`
        : busy
          ? `Checking imported brands…`
          : ''
    } while (after)
    importStatus = failures
      ? `${failures} locations could not be linked. Try again.`
      : linked
        ? `Linked brands to ${linked} locations.`
        : 'All imported brands are already linked.'
    await findIdentityCatalogue({ kind, search }).refresh()
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
/** Build a code-based detail URL, retaining an ID fallback for uncoded entries.
 * @param record Catalogue identity. @returns Local detail URL with editing context.
 */
function catalogueHref(record: IdentityCatalogueRecord): string {
  const path = record.code
    ? `/admin/catalog/${record.kind}/${encodeURIComponent(record.code)}`
    : `/admin/catalogue?id=${encodeURIComponent(record.id)}`
  return (
    path +
    (organisationId
      ? `${path.includes('?') ? '&' : '?'}organisation=${encodeURIComponent(organisationId)}`
      : '')
  )
}

/** Open one stable catalogue identity in the standard detail editor.
 * @param record Selected catalogue entry, or null for creation. @returns Nothing.
 */
function openRecord(record: IdentityCatalogueRecord | null): void {
  void goto(
    record
      ? catalogueHref(record)
      : `/admin/catalogue?kind=${kind}&new=1${organisationId ? `&organisation=${organisationId}` : ''}`,
  )
}
</script>

{#snippet localeControl()}
  <LocaleToolbar
    horizontal
    class="mr-3 max-w-[min(26rem,30vw)]"
    options={localeOptions}
    {selectedLocales}
    {visibleLocales}
    contentLocales={Object.keys(content?.i18n ?? {})}
    expanded={multilingual}
    allowAdd={isEditing}
    disabled={busy}
    onExpandedChange={value => (multilingual = value)}
    onChange={change => {
      selectedLocales = change.selectedLocales
      visibleLocales = change.visibleLocales
      if (content && change.action === 'add' && !content.i18n[change.locale])
        content.i18n[change.locale] = { name: '' }
      if (newGroup && change.action === 'add' && !newGroup.i18n[change.locale])
        newGroup.i18n[change.locale] = { name: '' }
    }}
  />
{/snippet}

<Main.Root
  class="px-0 pt-0"
  onDimensionsChange={(width, height) =>
    admin.view.layout.setMainDimensions(width, height)}
>
  {#if !detail}
    <div class="p-6">
      <div
        class={catalogueLayout === 'card'
          ? 'grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4'
          : 'grid gap-1.5'}
      >
        {#each records as record, index (record.id)}
          {#if catalogueLayout === 'card'}
            <IndexCard
              title={catalogueDisplayName(record)}
              description={record.code ?? record.id}
              imageSrc={record.logo ?? catalogueLogoFallbacks(record)[0] ?? ''}
              imageFallbackSrcs={catalogueLogoFallbacks(record)}
              imageAlt={catalogueDisplayName(record)}
              imageLayout="contain"
              onNavigate={() => openRecord(record)}
            />
          {:else}
            <ResourceRow
              {index}
              title={catalogueDisplayName(record)}
              description={record.code ?? record.id}
              imageSrc={record.logo ?? catalogueLogoFallbacks(record)[0] ?? ''}
              imageFallbackSrcs={catalogueLogoFallbacks(record)}
              imageAlt={catalogueDisplayName(record)}
              onNavigate={() => openRecord(record)}
            />
          {/if}
        {/each}
      </div>
      {#if loading && !records.length}
        <div
          role="status"
          aria-label="Loading catalogue"
          class="bg-muted h-40 animate-pulse rounded-xl"
        ></div>
      {/if}
      {#if !loading && !records.length}
        <p class="text-muted-foreground p-6 text-sm">
          {search
            ? 'No matching entries'
            : `No ${kind === 'brand' ? 'brands' : 'groups'} yet`}
        </p>
      {/if}
      {#if kind === 'brand' && admin.view.isSuperAdmin()}
        <div class="flex justify-end pt-4">
          <Button
            text="Link imported brands"
            iconComponent={Download}
            style="ghost"
            size="sm"
            disabled={busy}
            onClick={importBrands}
          />
        </div>
      {/if}
    </div>
  {:else if featuresActive && selected}
    <Main.Facet
      edgeToEdge
      fillHeight
      class="top-0 bottom-0"
      contentClass="h-full overflow-hidden"
    >
      {#key selected.id}
        <ScopedFeatureIndex resourceType="brand" resourceId={selected.id} embedded />
      {/key}
    </Main.Facet>
  {:else}
    <FormSurface>
      <div>
        {#if content}
          <section
            class="bits-form__section border-border mx-auto my-6 max-w-4xl overflow-hidden rounded-xl border pb-0!"
            data-catalogue-card
          >
            <div
              class="grid min-w-0 grid-cols-[12rem_minmax(0,1fr)]"
              data-catalogue-columns
            >
              <section class="grid min-w-0 content-start" aria-label="Brand image">
                <SectionHeader
                  title={kind === 'brand' ? 'Brand' : 'Group'}
                  icon={Tags}
                />
                <div class="grid gap-4 px-6 py-4">
                  <div class="relative size-28" data-catalogue-logo-picker>
                    <Dropzone
                      disabled={!isEditing || busy}
                      uploadSelectionMode="single"
                      showPrompt={false}
                      rounded="rounded-xl"
                      bind:inputElement={logoInput}
                      onFiles={async (files, rejections) => {
                        if (rejections.length) failed = true
                        if (files[0]) await upload(files[0])
                      }}
                    >
                      <div
                        class="border-border bg-muted/30 relative flex size-28 items-center justify-center overflow-hidden rounded-xl border"
                      >
                        {#if content.logo}
                          <img
                            src={`${content.logo}${logoRetry ? `?retry=${logoRetry}` : ''}`}
                            onerror={() => (logoFailed = true)}
                            onload={() => (logoFailed = false)}
                            class:hidden={logoFailed}
                            alt="Catalogue logo"
                            class="size-full object-contain p-2"
                          >
                          {#if logoFailed}
                            <ImageIcon class="text-muted-foreground size-10" />
                          {/if}
                        {:else}
                          <ImageIcon class="text-muted-foreground size-10" />
                        {/if}
                        {#if isEditing}
                          <span
                            class="bg-background/70 pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-sm transition-opacity group-focus-within/gallery-dropzone:opacity-100 group-hover/gallery-dropzone:opacity-100"
                            data-logo-overlay
                          >
                            <PhotoIcon class="size-7" />
                          </span>
                        {/if}
                      </div>
                    </Dropzone>
                    {#if logoFailed}
                      <div class="absolute bottom-1 left-1/2 z-80 -translate-x-1/2">
                        <Button
                          text="Retry image"
                          iconComponent={RetryIcon}
                          hideLabel
                          style="ghost"
                          size="sm"
                          class="size-6! p-0!"
                          disabled={busy}
                          onClick={() => {
                            logoFailed = false
                            logoRetry++
                          }}
                        />
                      </div>
                    {/if}
                  </div>
                </div>
              </section>
              <section class="grid min-w-0 content-start" aria-label="Names">
                <SectionHeader title="Names" icon={Languages} />
                <div class="px-6 py-4">
                  <div class="grid gap-2">
                    {#each shownLocales as locale (locale)}
                      <div
                        transition:slide={{
                          duration: prefersReducedMotion.current ? 0 : 180,
                        }}
                      >
                        <FormI18nInlineRow
                          value={content.i18n[locale].name}
                          label={`Name · ${locale}`}
                          prefix={locale === shownLocales[0]
                            ? ''
                            : shortLocaleLabel(locale)}
                          editable={isEditing && !busy}
                          required={false}
                          issues={undefined}
                          showVerification={false}
                          attrs={{
                            id: `catalogue-name-${locale}`,
                            oninput: (event: Event) => {
                              if (content)
                                content.i18n[locale].name = (
                                  event.currentTarget as HTMLInputElement
                                ).value
                            },
                          }}
                          onStart={() => {
                            namesBeforeEdit[locale] = content?.i18n[locale].name ?? ''
                          }}
                          onCancel={() => {
                            if (content)
                              content.i18n[locale].name = namesBeforeEdit[locale]
                          }}
                          onClear={() => {
                            if (content) content.i18n[locale].name = ''
                          }}
                        />
                      </div>
                    {/each}
                  </div>
                </div>
              </section>
              <section
                class="col-span-2 grid min-w-0 content-start"
                aria-label="Identity"
              >
                <SectionHeader title="Identity" icon={ListTree} />
                <div class="grid grid-cols-2 items-start gap-x-8 gap-y-6 px-6 py-5">
                  <TextInput
                    id="catalogue-code"
                    label="Code"
                    value={content.code ?? ''}
                    onValueChange={value => {
                      if (content) content.code = value || undefined
                    }}
                    {isEditing}
                    disabled={busy}
                    variant="resource"
                    class="gap-1!"
                  />
                  <div class="grid gap-2">
                    <h4 class="text-muted-foreground text-xs font-medium">
                      {kind === 'group' ? 'Parent group (optional)' : 'Group'}
                    </h4>
                    {#if isEditing}
                      {#if !newGroup}
                        <SearchSelect
                          plain
                          selectedDisplay
                          resetOnSelect
                          createLabel="Create group"
                          onCreate={name => {
                            if (!content) return
                            previousGroupId = content.groupId ?? null
                            groupSearch = ''
                            newGroup = {
                              id: crypto.randomUUID(),
                              i18n: seedIdentityCatalogue({ en: name }).i18n,
                            }
                            content.groupId = newGroup.id
                          }}
                          label={kind === 'group'
                            ? 'Search parent groups'
                            : 'Search groups'}
                          value={content.groupId ?? ''}
                          items={groups.map(group => ({
                            value: group.id,
                            label: catalogueDisplayName(group),
                            keywords: group.code,
                            image: group.logo ?? undefined,
                          }))}
                          disabled={busy}
                          onSearch={value => (groupSearch = value)}
                          onSelect={value => {
                            if (content) content.groupId = value || null
                          }}
                        />
                      {/if}
                      {#if newGroup}
                        <fieldset
                          transition:slide={{
                            duration: prefersReducedMotion.current ? 0 : 160,
                          }}
                          class="grid gap-3 py-2"
                          aria-label="New group names"
                        >
                          {#each shownLocales.filter(
                            locale => newGroup?.i18n[locale],
                          ) as locale (locale)}
                            <div
                              transition:fade={{
                                duration: prefersReducedMotion.current ? 0 : 160,
                              }}
                            >
                              <FormI18nInlineRow
                                value={newGroup.i18n[locale].name}
                                label={`Group name · ${locale}`}
                                prefix={locale === shownLocales[0]
                                  ? ''
                                  : shortLocaleLabel(locale)}
                                editable={!busy}
                                required={false}
                                issues={undefined}
                                showVerification={false}
                                attrs={{
                                  id: `catalogue-group-name-${locale}`,
                                  oninput: (event: Event) => {
                                    if (newGroup)
                                      newGroup.i18n[locale].name = (
                                        event.currentTarget as HTMLInputElement
                                      ).value
                                  },
                                }}
                                onStart={() => {
                                  groupNamesBeforeEdit[locale] =
                                    newGroup?.i18n[locale].name ?? ''
                                }}
                                onCancel={() => {
                                  if (newGroup)
                                    newGroup.i18n[locale].name =
                                      groupNamesBeforeEdit[locale]
                                }}
                                onClear={() => {
                                  if (newGroup) newGroup.i18n[locale].name = ''
                                }}
                              />
                            </div>
                          {/each}
                          <Button
                            text="Cancel new group"
                            style="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              if (content) content.groupId = previousGroupId
                              newGroup = null
                            }}
                          />
                        </fieldset>
                      {/if}
                    {:else}
                      {@const group = groups.find(
                        group => group.id === content?.groupId,
                      )}
                      <div class="flex items-center gap-3 px-4 py-2">
                        {#if group?.logo}
                          <img src={group.logo} alt="" class="size-7 object-contain">
                        {:else}
                          <Building class="text-muted-foreground size-5 shrink-0" />
                        {/if}
                        <span class="text-sm"
                          >{group
                            ? catalogueDisplayName(group)
                            : content.groupId || 'None'}</span
                        >
                      </div>
                    {/if}
                  </div>
                  {#if kind === 'brand'}
                    <div class="grid gap-2">
                      <h4 class="text-muted-foreground text-xs font-medium">
                        Categories
                      </h4>
                      {#if isEditing}
                        <SearchSelect
                          label="Add category"
                          plain
                          resetOnSelect
                          items={categoryOptions
                            .filter(key => !content?.categories?.includes(key))
                            .map(key => ({
                              value: key,
                              label: placeCategoryLabel(key),
                            }))}
                          disabled={busy}
                          onSelect={value => {
                            if (value && content)
                              content.categories = [
                                ...new Set([...(content.categories ?? []), value]),
                              ]
                          }}
                        />
                      {/if}
                      <fieldset
                        class="mt-4 flex flex-wrap gap-2 px-4"
                        aria-label="Categories"
                      >
                        {#each content.categories ?? [] as key (key)}
                          {#if isEditing}
                            <Button
                              text={`${placeCategoryLabel(key)} ×`}
                              style="soft"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                if (content)
                                  content.categories = content.categories?.filter(
                                    value => value !== key,
                                  )
                              }}
                            />
                          {:else}
                            <span
                              class="border-border bg-muted/30 rounded-full border px-3 py-1 text-sm"
                              >{placeCategoryLabel(key)}</span
                            >
                          {/if}
                        {:else}
                          {#if !isEditing}
                            <span class="text-muted-foreground text-sm">None</span>
                          {/if}
                        {/each}
                      </fieldset>
                    </div>
                  {/if}
                </div>
              </section>
            </div>
          </section>
        {:else if loadingDetail}
          <div
            role="status"
            aria-label="Loading catalogue details"
            class="bg-muted h-64 animate-pulse rounded-xl"
          ></div>
        {/if}
      </div>
    </FormSurface>
  {/if}
  {#if failed}
    <p role="alert" class="text-destructive px-6 py-3 text-sm">
      Unable to load or save the catalogue. Please try again.
    </p>
  {/if}
  {#if saved && !dirty}
    <p role="status" class="px-6 py-3 text-sm">Catalogue saved</p>
  {/if}
  {#if importStatus}
    <p role="status" class="text-muted-foreground px-6 py-3 text-sm">{importStatus}</p>
  {/if}
</Main.Root>
