import { describe, expect, it, vi } from 'vitest'
vi.mock('$app/navigation', () => ({
  beforeNavigate: vi.fn(),
}))
vi.mock('svelte-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
import {
  isPreflightFailureOutcome,
  shouldClearSubmitRequestOnInteraction,
} from '$lib/factories.svelte'
import { revalidateAfterSubmitAttempt } from '$lib/client/services/form'
import type { RemoteFormIssue } from '@sveltejs/kit'

describe('submit-attempt UX', () => {
  it('treats preflight invalid submit as a preflight-failure outcome', () => {
    const issues: RemoteFormIssue[] = [
      { message: 'INVALID: Add at least one Owner', path: ['data', 'userRoles'] },
    ]
    expect(
      isPreflightFailureOutcome({
        success: false,
        issues,
      }),
    ).toBe(true)

    expect(
      isPreflightFailureOutcome({
        success: false,
        result: { type: 'failure' },
        issues,
      }),
    ).toBe(false)

    expect(
      isPreflightFailureOutcome({
        success: true,
      }),
    ).toBe(false)
  })

  it('clears submit-request state only when waiting for post-preflight interaction', () => {
    expect(
      shouldClearSubmitRequestOnInteraction({
        isSubmitRequested: true,
        awaitsPostPreflightInteraction: true,
      }),
    ).toBe(true)

    expect(
      shouldClearSubmitRequestOnInteraction({
        isSubmitRequested: true,
        awaitsPostPreflightInteraction: false,
      }),
    ).toBe(false)

    expect(
      shouldClearSubmitRequestOnInteraction({
        isSubmitRequested: false,
        awaitsPostPreflightInteraction: true,
      }),
    ).toBe(false)
  })

  it('revalidate-on-change runs only after a submit attempt', () => {
    let calls = 0
    const validate = async () => {
      calls += 1
    }

    const beforeAttempt = revalidateAfterSubmitAttempt({
      wasSubmitAttempted: false,
      validate,
    })
    const afterAttempt = revalidateAfterSubmitAttempt({
      wasSubmitAttempted: true,
      validate,
    })

    expect(beforeAttempt).toBe(false)
    expect(afterAttempt).toBe(true)
    expect(calls).toBe(1)
  })
})
