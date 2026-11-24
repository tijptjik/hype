// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { expect, it, vi } from 'vitest'
import ts from 'typescript'
// SERVICES
import { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'
import { runBulkCommands } from '#lib/client/services/bulkCommands.js'

it.each(['navigation', 'close', 'account'] as const)(
  'owns bulk dispatch independently of %s while respecting account changes',
  async transition => {
    const source = readFileSync(
      'src/lib/bits/patterns/resource/adminFeatureIndex/AdminFeatureIndex.svelte',
      'utf8',
    )
    const start = source.indexOf('async function applyFeatureBulkEdit()')
    expect(start).toBeGreaterThanOrEqual(0)
    const functionSource = source.slice(start)
    const parsed = ts.createSourceFile(
      'bulk-handler.ts',
      functionSource,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    )
    const declaration = parsed.statements[0]
    expect(ts.isFunctionDeclaration(declaration)).toBe(true)
    const handler = functionSource.slice(0, declaration.end)
    let finish!: (value: unknown[]) => void
    const pending = new Promise<unknown[]>(resolve => {
      finish = resolve
    })
    const jobs = new BackgroundJobs()
    const env = {
      jobs,
      patch: vi.fn(),
      reconcile: vi.fn(async () => {}),
      success: vi.fn(),
      update: vi
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue([{ id: 'b', ok: true }]),
    }
    const js = ts.transpileModule(
      `
    const root = { backgroundJobs: env.jobs, account: { revision: 1 }, cacheCtx: { reconcile: env.reconcile } };
    const selectedBulkAction = { field: 'isPublished', state: true, pastTense: 'published' };
    const isBulkApplyDisabled = false, selectedBulkFeatureIds = ['a', 'b'];
    let bulkSelectionRevision = 0, bulkSelectionScope = 'scope', isBulkEditActive = true;
    let bulkSelectedFeatureIds = new Set(['a', 'b']), selectedBulkActionValue = 'publish';
    let bulkRowResultsById, bulkErrorMessagesById, bulkProgress;
    const adminCtx = { view: { getRoleScopeQueryKey: () => 'account' } };
    const toast = { success: env.success, error: () => {}, warning: () => {} };
    const toFeatureBulkChunks = ids => ids.map(id => [id]);
    const updateFeatureBulkState = env.update;
    const recordBulkResult = () => {}, toBulkRemoteFailureResult = id => ({ id, ok: false });
    const patchSuccessfulBulkUpdates = env.patch, showBulkErrorToasts = () => {}, setBulkMode = () => {};
    ${handler}
    return { run: applyFeatureBulkEdit, leave: () => { bulkSelectionRevision++; isBulkEditActive = false }, account: () => { root.account.revision++ } };
  `,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText
    const action = new Function('env', 'runBulkCommands', js)(env, runBulkCommands)
    const running = action.run()
    if (transition === 'account') action.account()
    else action.leave()
    expect(jobs.busy).toBe(true)
    finish([{ id: 'a', ok: true }])
    await running
    expect(env.update).toHaveBeenCalledTimes(transition === 'account' ? 1 : 2)
    expect(env.patch).not.toHaveBeenCalled()
    expect(jobs.jobs[0].status).toBe(transition === 'account' ? 'stopped' : 'complete')
    expect(jobs.busy).toBe(false)
  },
)
