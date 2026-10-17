// TESTS
import { describe, expect, it, vi } from 'vitest'
// Exercise real dictionary selection rather than the application-wide name stub.
vi.unmock('unique-names-generator')
// USERNAMES
import { USERNAME_ADJECTIVES } from '#lib/utils/username-adjectives'
import {
  generateRandomUsername,
  generateRunnerUsernameFromId,
  generateUsernameFromId,
} from '#lib/utils/username-generator.server'
import { validateUsername } from '#lib/utils/username'

const approved = new Set(USERNAME_ADJECTIVES)

describe('generated username adjective whitelist', () => {
  it('offers at least 1024 distinct, alphabetized, username-safe adjectives', () => {
    expect(approved.size).toBeGreaterThanOrEqual(1024)
    expect(approved.size).toBe(USERNAME_ADJECTIVES.length)
    expect(USERNAME_ADJECTIVES).toEqual([...USERNAME_ADJECTIVES].sort())
    for (const adjective of USERNAME_ADJECTIVES) {
      expect(adjective).toMatch(/^[a-z]{1,24}$/)
    }
  })

  it('excludes negative and derogatory terms from the previous dictionary', () => {
    // Sentiment is reviewed by humans; these are regressions, not a runtime denylist.
    for (const term of [
      'angry',
      'arrogant',
      'awful',
      'boring',
      'clumsy',
      'crazy',
      'creepy',
      'cruel',
      'dirty',
      'disgusted',
      'evil',
      'filthy',
      'foolish',
      'greasy',
      'grumpy',
      'hostile',
      'lazy',
      'miserable',
      'nasty',
      'nutty',
      'obnoxious',
      'repulsive',
      'rotten',
      'rude',
      'selfish',
      'slimy',
      'stupid',
      'toxic',
      'ugly',
      'useless',
      'vicious',
      'violent',
      'wicked',
      'xenophobic',
    ])
      expect(approved.has(term)).toBe(false)
  })

  it('uses only approved adjectives in runner names, including collision retries', () => {
    for (let index = 0; index < 2048; index++) {
      for (const attempt of [0, 1, 25]) {
        const result = generateRunnerUsernameFromId(`runner-fixture-${index}`, attempt)
        const match = /^([A-Z][a-z]+)Runner\d{2}$/.exec(result)
        expect(match).not.toBeNull()
        expect(approved.has(match?.[1].toLowerCase() ?? '')).toBe(true)
        expect(result.length).toBeLessThanOrEqual(32)
        expect(result).toBe(
          generateRunnerUsernameFromId(`runner-fixture-${index}`, attempt),
        )
      }
    }
  })

  it('uses the whitelist for ordinary random and seeded usernames too', () => {
    for (let index = 0; index < 256; index++) {
      const seeded = generateUsernameFromId(`user-fixture-${index}`)
      expect(seeded).toBe(generateUsernameFromId(`user-fixture-${index}`))
      for (const result of [seeded, generateRandomUsername()]) {
        expect(validateUsername(result)).toBe(true)
        expect(USERNAME_ADJECTIVES.some(term => result.startsWith(term))).toBe(true)
      }
    }
  })
})

describe('HYPE adjective-animal-number usernames', () => {
  it('keeps the two digit suffix and dictionary boundaries within the length limit', async () => {
    const { generateDisplayUsernameFromId } = await import(
      '#lib/utils/username-generator.server'
    )
    for (let index = 0; index < 2048; index++) {
      const name = generateDisplayUsernameFromId(`hype-${index}`)
      const match = /^([A-Z][a-z]+)([A-Z][a-z]+)(\d{2})$/.exec(name)
      expect(match).not.toBeNull()
      expect(approved.has(match?.[1].toLowerCase() ?? '')).toBe(true)
      expect(name.length).toBeLessThanOrEqual(32)
      expect(generateUsernameFromId(`hype-${index}`)).toBe(name.toLowerCase())
      expect(generateDisplayUsernameFromId(`hype-${index}`, 1)).not.toBe(name)
    }
  })

  it('does not collapse seeds with the same character sum', () => {
    expect(generateUsernameFromId('abc')).not.toBe(generateUsernameFromId('cba'))
  })
})
