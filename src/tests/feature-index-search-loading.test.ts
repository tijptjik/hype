// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, untrack } from 'svelte'
import { compileModule } from 'svelte/compiler'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// @ts-expect-error Svelte's compiler runtime is internal and has no public declarations.
import * as client from 'svelte/internal/client'

// Execute the route's actual search effects with Svelte reactivity, without its full admin shell.
const route = readFileSync(
  'src/lib/bits/patterns/resource/adminFeatureIndex/AdminFeatureIndex.svelte',
  'utf8',
)
const section = (start: string, end: string) =>
  route.slice(route.indexOf(start), route.indexOf(end, route.indexOf(start)))
const source = `
function create(getFeatures) {
  const adminCtx = { featureHasMore: false, featurePageError: null, view: {
    isSuperAdmin: () => true, scope: { prisms: {} },
    filters: { sorting: { feature: {} } }, resources: { queryMeta: {} }
  } };
  let normalizedTextQuery = $state('tea');
  let searchSignature = $state('scope-a');
  const indexInitialised = true;
  let isSearchFocused = $state(false);
  const activeSearchResultCap = 2;
  const entities = $derived(remoteMatchedEntities ?? []);
  const toUniqueFeatures = rows => [...new Map(rows.map(row => [row.id, row])).values()];
  ${section('let latestRemoteRequestId', 'let optimisticEntities')}
  ${section('const remoteMatchesCurrentQuery', 'function buildFeatureSearchIndex')}
  debouncedRemoteQuery = 'tea';
  const stop = $effect.root(() => {
    ${section('$effect(() => {\n  const nextQuery = debouncedRemoteQuery.trim()', '$effect(() => {\n  if (normalizedTextQuery')}
  });
  return {
    stop, more: loadMoreFeatureResults,
    focus: value => { isSearchFocused = value; },
    search: value => { normalizedTextQuery = value; debouncedRemoteQuery = value; },
    scope: value => { searchSignature = value; },
    retry: () => { searchRetry++; },
    state: () => ({ ids: remoteMatchesCurrentQuery ? remoteMatchedEntities.map(row => row.id) : [], pending: remotePending, loadingMore: remoteLoadingMore, complete: indexComplete, hasMore: indexHasMore, canLoadMore: indexCanLoadMore, error: remotePageError })
  };
}
`
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const compiled = compileModule(js, {
  filename: 'FeatureIndexSearchCheck.svelte.js',
  generate: 'client',
}).js.code
const create = new Function(
  'client',
  'untrack',
  'refreshRemoteQuery',
  `${compiled.replace(/import \* as \$ from ['"]svelte\/internal\/client['"];?/, 'const $ = client;')}\nreturn create;`,
)(client, untrack, refreshRemoteQuery)
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop()
})

function setup(request: ReturnType<typeof vi.fn>) {
  const state = create(request)
  cleanups.push(state.stop)
  flushSync()
  return state
}

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

async function settle() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve()
    flushSync()
  }
}

const page = (ids: string[], hasMore = false, nextOffset = 0) => ({
  data: ids.map(id => ({ id })),
  totalCount: ids.length,
  hasMore,
  nextOffset,
})

describe('Feature index search loading', () => {
  it('does not refetch a partial first page when publishing results, and appends on demand', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(['a'], true, 1))
      .mockResolvedValueOnce(page(['a', 'b']))
    const state = setup(request)
    expect(state.state().complete).toBe(false)
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
    expect(state.state()).toMatchObject({
      ids: ['a'],
      pending: false,
      hasMore: true,
      complete: false,
    })
    await state.more()
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1][0].pagination).toEqual({ limit: 50, offset: 1 })
    expect(state.state()).toMatchObject({
      ids: ['a', 'b'],
      hasMore: false,
      complete: true,
    })
  })

  it('uses refreshed native query payloads for initial and continuation pages', async () => {
    const first = Object.assign(Promise.resolve(page(['stale'])), {
      current: page(['stale']),
      refresh: vi.fn(async () => {
        first.current = page(['fresh'], true, 1)
      }),
    })
    const second = Object.assign(Promise.resolve(page(['stale-more'])), {
      current: page(['stale-more']),
      refresh: vi.fn(async () => {
        second.current = page(['fresh-more'])
      }),
    })
    const request = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const state = setup(request)
    await settle()
    expect(state.state().ids).toEqual(['fresh'])
    await state.more()
    expect(state.state().ids).toEqual(['fresh', 'fresh-more'])
    expect(first.refresh).toHaveBeenCalledOnce()
    expect(second.refresh).toHaveBeenCalledOnce()
  })

  it.each([
    { ids: ['invalid'], nextOffset: 1 },
    { ids: ['invalid'], nextOffset: 0 },
    { ids: [], nextOffset: 2 },
  ])('retains results and cursor for a malformed continuation %j', async malformed => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(['first'], true, 1))
      .mockResolvedValueOnce(page(malformed.ids, true, malformed.nextOffset))
      .mockResolvedValueOnce(page(['second']))
    const state = setup(request)
    await settle()
    await state.more()
    expect(state.state()).toMatchObject({
      ids: ['first'],
      loadingMore: false,
      hasMore: true,
      error: expect.any(Error),
    })
    await state.more()
    expect(request.mock.calls[2][0].pagination.offset).toBe(1)
    expect(state.state()).toMatchObject({
      ids: ['first', 'second'],
      error: null,
      complete: true,
    })
  })

  it('rejects old search pages and does not let their cleanup reset newer loading', async () => {
    const oldPage = deferred(),
      newPage = deferred()
    const request = vi
      .fn()
      .mockResolvedValueOnce(page(['old'], true, 1))
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise)
    const state = setup(request)
    await settle()
    const oldLoad = state.more()
    state.search('coffee')
    flushSync()
    oldPage.resolve(page(['obsolete']))
    await oldLoad
    await settle()
    expect(state.state()).toMatchObject({ ids: [], pending: true, complete: false })
    newPage.resolve(page(['coffee']))
    await settle()
    expect(state.state()).toMatchObject({
      ids: ['coffee'],
      pending: false,
      complete: true,
    })
  })

  it('discards an old-scope initial response and can retry a failed current request', async () => {
    const oldPage = deferred(),
      newPage = deferred()
    const failure = new Error('network unavailable')
    const request = vi
      .fn()
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newPage.promise)
      .mockResolvedValueOnce(page(['current']))
    const state = setup(request)
    state.scope('scope-b')
    flushSync()
    oldPage.resolve(page(['obsolete']))
    await settle()
    expect(state.state()).toMatchObject({ ids: [], pending: true, complete: false })
    newPage.reject(failure)
    await settle()
    expect(state.state()).toMatchObject({ ids: [], error: failure, complete: false })
    state.retry()
    await settle()
    expect(state.state()).toMatchObject({
      ids: ['current'],
      error: null,
      complete: true,
    })
    expect(request).toHaveBeenCalledTimes(3)
  })
})

it('pauses pagination at the search-focus display cap and resumes after focus leaves', async () => {
  const request = vi.fn().mockResolvedValueOnce(page(['a', 'b'], true, 2))
  const state = setup(request)
  state.focus(true)
  await settle()
  expect(state.state()).toMatchObject({
    hasMore: true,
    canLoadMore: false,
    complete: false,
  })
  state.focus(false)
  flushSync()
  expect(state.state()).toMatchObject({
    hasMore: true,
    canLoadMore: true,
    complete: false,
  })
})
