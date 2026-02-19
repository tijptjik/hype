import { describe, expect, it, vi } from 'vitest'
vi.mock('$app/navigation', () => ({
  beforeNavigate: vi.fn(),
}))
vi.mock('svelte-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
import { revalidateAfterSubmitAttempt } from '$lib/client/services/form'

describe('submit-attempt UX', () => {
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
