// TESTING
import { describe, expect, it } from 'vitest'
// PRESENTATION
import { breadlineCardMtr } from '#lib/features/breadlineCard.js'
import { mtrCatalog } from '#lib/routing/mtr.js'

describe('dedicated Breadline transit field', () => {
  const exit = mtrCatalog.exits[0]
  const access = {
    mtrStation: exit.station,
    mtrExit: exit.id,
    mtrDistance: 1000,
    mtrResolution: {
      status: 'ready' as const,
      calculatedAt: '',
      catalogVersion: '',
      graphVersion: '',
      candidatesChecked: 1,
    },
  }
  it('allows the boundary but suppresses stale over-limit, missing and mismatched data', () => {
    expect(breadlineCardMtr(access, 'en')?.metres).toBe(1000)
    expect(breadlineCardMtr({ ...access, mtrDistance: 1001 }, 'en')).toBeNull()
    expect(breadlineCardMtr({ ...access, mtrResolution: null }, 'en')).toBeNull()
    expect(breadlineCardMtr({ ...access, mtrStation: 'missing' }, 'en')).toBeNull()
  })
})
