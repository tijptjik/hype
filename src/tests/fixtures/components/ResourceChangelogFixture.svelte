<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import ResourceChangelog from '#lib/bits/patterns/revisionHistory/ResourceChangelog.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// PRESENTATION
import { matchesChangelogFilters } from '#lib/revisions/changelogFilters.js'
// TYPES
import type {
  ChangelogCursor,
  ChangelogEntry,
  ChangelogPage,
  ChangelogFilters,
} from '#lib/revisions/changelog.js'

setResponsiveCtx()
let filters = $state<ChangelogFilters>({})
let locale = $state('en')
let scope = $state('first')
let requests = $state<string[]>([])
let failContinuation = new URLSearchParams(window.location.search).has('failure')
const slow = new URLSearchParams(window.location.search).has('slow')
const imageCheck = new URLSearchParams(window.location.search).has('images')
const translation = new URLSearchParams(window.location.search).has('translation')
const sparse = new URLSearchParams(window.location.search).has('sparse')
const boundaries = new URLSearchParams(window.location.search).has('boundaries')
const pageSize = boundaries ? 4 : 25
const total = boundaries ? 12 : 300
const fixtureNow = Date.now()
const checkedMode = new URLSearchParams(window.location.search).get('checked')
const lastCheckedAt =
  checkedMode === 'middle'
    ? new Date(fixtureNow - 2 * 86_400_000).toISOString()
    : checkedMode === 'before-all'
      ? new Date(fixtureNow).toISOString()
      : checkedMode === 'after-all'
        ? new Date(fixtureNow - 1000 * 86_400_000).toISOString()
        : null
/** Spread the boundary preview across populated age groups while other checks stay recent.
 * @param index Stable fixture entry index.
 * @returns Ordered ISO timestamp.
 */
function createdAt(index: number): string {
  if (!boundaries) return '2026-11-06T05:00:00.000Z'
  const ages = [1 / 24, 2 / 24, 23 / 24, 1, 3, 7, 15, 30, 120, 365, 500, 730]
  return new Date(fixtureNow - ages[index] * 86_400_000 - 5000).toISOString()
}
/** Supply inspectable continuations without touching application data.
 * @param before Continuation cursor.
 * @param filters Current view filters.
 * @returns Synthetic attributed changes with long multilingual labels.
 */
async function loadPage(
  before?: ChangelogCursor,
  filters: ChangelogFilters = {},
): Promise<ChangelogPage> {
  const owner = scope
  const selectedLocale = locale
  const index = before ? Number(before.key.split('-').at(-1)) + 1 : 0
  requests = [...requests, `${owner}:${index}`]
  await new Promise(resolve => setTimeout(resolve, slow ? 600 : 80))
  if (before && failContinuation) {
    failContinuation = false
    throw new Error('Synthetic continuation failure')
  }
  const entries: ChangelogEntry[] = Array.from(
    { length: sparse && index === 0 ? 0 : Math.min(pageSize, total - index) },
    (_, i) => ({
      key: `${owner}-${index + i}`,
      resourceType:
        translation && index + i === 0
          ? 'layer'
          : i % 3 === 0
            ? 'feature'
            : i % 3 === 1
              ? 'layer'
              : 'project',
      resourceId: String(index + i),
      name:
        selectedLocale === 'en'
          ? `${owner} ${index + i} · A long localized resource name on Queen's Road Central`
          : `${owner} ${index + i} · 皇后大道中歷史建築及社區資源名稱`,
      category: 'profile',
      createdAt: createdAt(index + i),
      actorId: 'synthetic-editor',
      actorName: 'Example editor',
      actorUsername: i % 3 === 0 ? 'example.editor' : null,
      actorDisplayUsername: i % 3 === 0 ? 'Example.Editor' : null,
      origin:
        translation && index + i === 0
          ? 'system'
          : i % 3 === 0
            ? 'user'
            : i % 3 === 1
              ? 'system'
              : 'migration',
      baselineActor:
        i % 3 === 2
          ? {
              actorId: 'original-user',
              actorName: 'Original contributor',
              actorUsername: 'original.user',
              actorDisplayUsername: 'Original.User',
              role: i % 2 === 0 ? 'reviewer' : 'contributor',
            }
          : null,
      reason:
        translation && index + i === 0
          ? 'Synthetic design preview: add a French translation. Current resource content was not changed.'
          : 'Synthetic changelog layout check',
      initial: false,
      baseline: i % 3 === 2,
      unpublished: false,
      redacted: false,
      changes:
        imageCheck && index + i === 0
          ? [
              {
                path: ['logo'],
                before: { present: false },
                after: {
                  present: true,
                  value: {
                    imageId: 'fixture-image',
                    imageRevisionId: 'fixture-revision',
                  },
                },
              },
              {
                path: ['settings', 'imageId'],
                before: { present: true, value: 'legacy-image' },
                after: { present: true, value: 'fixture-image' },
              },
              {
                path: ['logo', 'imageRevisionId'],
                before: { present: false },
                after: { present: true, value: 'unavailable-revision' },
              },
            ]
          : translation && index + i === 0
            ? [
                {
                  path: ['i18n', 'fr'],
                  before: { present: false },
                  after: {
                    present: true,
                    value: {
                      name: 'Enseignes historiques de Hong Kong',
                      nameShort: 'Enseignes HK',
                      description:
                        'Exemple synthétique pour examiner les changements multilingues.',
                    },
                  },
                },
              ]
            : [
                {
                  path: ['i18n', 'en', 'name'],
                  before: { present: true, value: 'Previous name' },
                  after: { present: true, value: 'Changed name' },
                },
              ],
    }),
  )
  return {
    owner: { id: owner, name: owner },
    entries: entries.filter(entry => matchesChangelogFilters(entry, filters)),
    filterOptions: {
      actors: [
        {
          id: 'synthetic-editor',
          origin: 'user',
          label: '@Example.Editor',
          name: 'Example editor',
          username: 'example.editor',
          displayUsername: 'Example.Editor',
        },
        {
          id: 'original-user',
          origin: 'user',
          label: '@Original.User',
          name: 'Original contributor',
          username: 'original.user',
          displayUsername: 'Original.User',
        },
        { id: 'synthetic-editor', origin: 'system', label: 'System' },
        { id: 'synthetic-editor', origin: 'migration', label: 'Author unknown' },
      ],
      period: {
        from: new Date(fixtureNow - 730 * 86_400_000).toISOString(),
        to: new Date(fixtureNow).toISOString(),
      },
    },
    nextCursor:
      index + pageSize >= total
        ? null
        : {
            key: `${owner}-${index + pageSize - 1}`,
            createdAt: createdAt(index + pageSize - 1),
          },
    unavailable: [],
    checkpoint: { lastCheckedAt, checkedThrough: new Date().toISOString() },
  }
}
</script>

<div
  class="bits-theme bg-background text-foreground h-screen"
  data-requests={JSON.stringify(requests)}
>
  <div class="bits-admin-shell__main flex h-full min-h-0 flex-col">
    <Header
      title={{ text: 'Hong Kong Ghost Signs' }}
      avatar={{ isVisible: false }}
      query={filters.search ?? ''}
      filter={{
        isFilterable: true,
        placeholder: 'Search changes',
        onFilter: value => {
          filters = { ...filters, search: value.slice(0, 200) || undefined }
        },
      }}
    />
    <div class="flex shrink-0 gap-3 p-3">
      <button
        type="button"
        onclick={() => {
          locale = locale === 'en' ? 'zhHant' : 'en'
        }}
      >
        Switch locale
      </button>
      <button
        type="button"
        onclick={() => {
          scope = scope === 'first' ? 'second' : 'first'
        }}
      >
        Switch scope
      </button>
    </div>
    <FormSurface class="mb-0! flex min-h-0 flex-1 flex-col">
      <ResourceChangelog
        identity={scope}
        {locale}
        {loadPage}
        {lastCheckedAt}
        bind:filters
      />
    </FormSurface>
  </div>
</div>
