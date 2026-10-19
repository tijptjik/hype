// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import { createFeatureQueryEffectRoot } from './fixtures/featureQueryHarness.svelte'
import { useProfileContributionPreferences } from '#lib/adapters/panels/useProfileContributionPreferences.svelte'
import { UserSelfProfileAPI } from '#lib/db/zod/schema/user.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

const api = vi.hoisted(() => ({ save: vi.fn(), error: vi.fn() }))
vi.mock('#lib/api/user.remote.js', () => ({
  updateUserProfile: (input: unknown) => ({ updates: () => api.save(input) }),
  getUser: vi.fn(),
}))
vi.mock('svelte-sonner', () => ({ toast: { error: api.error } }))

function harness(profileContributions?: {
  showAll?: boolean
  observePrisms?: boolean
}) {
  const app = {
    account: {
      revision: 1,
      user: {
        id: 'viewer',
        preferences: {
          fallbackLocales: ['en'],
          theme: { uiTheme: 'hype-light' },
          profileContributions,
        },
      },
    },
    hub: { organisations: [{}, {}] },
    panels: { state: { profile: { ctx: { observePrisms: true } } } },
    refreshUserProfile: vi.fn(),
    getUserPreferences() {
      return this.account.user.preferences
    },
    applyUserProfile(patch: any, revision: number) {
      if (revision === this.account.revision) Object.assign(this.account.user, patch)
    },
  }
  let model!: ReturnType<typeof useProfileContributionPreferences>
  const dispose = createFeatureQueryEffectRoot(() => {
    model = useProfileContributionPreferences(app as unknown as ResourceViewCtx)
  })
  flushSync()
  return { app, model, dispose }
}

describe('profile contribution preferences', () => {
  it('retains explicit false settings through the self profile schema', () => {
    const parsed = UserSelfProfileAPI.shape.preferences.parse(
      JSON.stringify({
        profileContributions: { showAll: false, observePrisms: false },
      }),
    )
    expect(parsed.profileContributions).toEqual({
      showAll: false,
      observePrisms: false,
    })
  })
  it('defaults to published and selected maps', () => {
    const { model, dispose } = harness()
    expect(model.showAll).toBe(false)
    expect(model.observePrisms).toBe(true)
    dispose()
  })
  it('restores saved filters and refreshes the request scope', () => {
    const { app, model, dispose } = harness({ showAll: true, observePrisms: false })
    expect(model.showAll).toBe(true)
    expect(model.observePrisms).toBe(false)
    expect(app.panels.state.profile.ctx.observePrisms).toBe(false)
    expect(app.refreshUserProfile).toHaveBeenCalledOnce()
    dispose()
  })
  it('saves viewer preferences with unrelated settings preserved', async () => {
    api.save.mockResolvedValueOnce({})
    const { app, model, dispose } = harness({ observePrisms: false })
    await model.setShowAll(true)
    const input = api.save.mock.lastCall![0]
    expect(input.id).toBe('viewer')
    expect(JSON.parse(input.data.preferences)).toEqual(app.account.user.preferences)
    expect(app.account.user.preferences.profileContributions).toEqual({
      observePrisms: false,
      showAll: true,
    })
    expect(app.account.user.preferences.fallbackLocales).toEqual(['en'])
    dispose()
  })
  it('rolls back failed saves', async () => {
    api.save.mockRejectedValueOnce(new Error('offline'))
    const { app, model, dispose } = harness({ showAll: false })
    await model.setShowAll(true)
    expect(app.account.user.preferences.profileContributions).toEqual({
      showAll: false,
    })
    expect(api.error).toHaveBeenCalled()
    dispose()
  })
  it('does not roll back a different account after a late failure', async () => {
    let reject!: (error: Error) => void
    api.save.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const { app, model, dispose } = harness({ showAll: false })
    const pending = model.setShowAll(true)
    app.account.revision++
    app.account.user.preferences.profileContributions = {
      showAll: false,
      observePrisms: false,
    }
    reject(new Error('offline'))
    await pending
    expect(app.account.user.preferences.profileContributions).toEqual({
      showAll: false,
      observePrisms: false,
    })
    dispose()
  })
})
