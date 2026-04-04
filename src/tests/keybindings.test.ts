// TESTS
import { describe, expect, it, vi } from 'vitest'
// CONTEXT
import {
  consumeEscapeForOpenPanels,
  shouldSkipGlobalKeydown,
} from '$lib/client/keybindings'
import { dismissActiveFeatureNavigation } from '$lib/context/omniNavigation'

describe('shouldSkipGlobalKeydown', () => {
  it('returns true for focused form controls', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')

    editable.setAttribute('contenteditable', 'true')

    expect(shouldSkipGlobalKeydown(input)).toBe(true)
    expect(shouldSkipGlobalKeydown(textarea)).toBe(true)
    expect(shouldSkipGlobalKeydown(select)).toBe(true)
    expect(shouldSkipGlobalKeydown(editable)).toBe(true)
  })

  it('returns false for non-editable elements', () => {
    expect(shouldSkipGlobalKeydown(null)).toBe(false)
    expect(shouldSkipGlobalKeydown(document.createElement('button'))).toBe(false)
  })
})

describe('consumeEscapeForOpenPanels', () => {
  it('consumes Escape when a panel is open', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')

    expect(consumeEscapeForOpenPanels(event, true)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('does not consume non-Escape keys or closed panel state', () => {
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    const otherEvent = new KeyboardEvent('keydown', { key: '1', cancelable: true })

    expect(consumeEscapeForOpenPanels(escapeEvent, false)).toBe(false)
    expect(escapeEvent.defaultPrevented).toBe(false)
    expect(consumeEscapeForOpenPanels(otherEvent, true)).toBe(false)
    expect(otherEvent.defaultPrevented).toBe(false)
  })
})

describe('dismissActiveFeatureNavigation', () => {
  it('closes the card before clearing the active feature', () => {
    const closeCard = vi.fn()
    const resetActiveFeature = vi.fn()
    const resetToSearch = vi.fn()
    const setIntentionallyClosing = vi.fn()

    expect(
      dismissActiveFeatureNavigation({
        hasActiveFeature: true,
        isCardOpen: true,
        closeCard,
        resetActiveFeature,
        resetToSearch,
        setIntentionallyClosing,
      }),
    ).toBe(true)

    expect(closeCard).toHaveBeenCalledTimes(1)
    expect(resetActiveFeature).not.toHaveBeenCalled()
    expect(resetToSearch).not.toHaveBeenCalled()
    expect(setIntentionallyClosing).not.toHaveBeenCalled()
  })

  it('clears the active feature after the card is already closed', () => {
    const closeCard = vi.fn()
    const resetActiveFeature = vi.fn()
    const resetToSearch = vi.fn()
    const setIntentionallyClosing = vi.fn()

    expect(
      dismissActiveFeatureNavigation({
        hasActiveFeature: true,
        isCardOpen: false,
        closeCard,
        resetActiveFeature,
        resetToSearch,
        setIntentionallyClosing,
      }),
    ).toBe(true)

    expect(closeCard).not.toHaveBeenCalled()
    expect(setIntentionallyClosing).toHaveBeenCalledWith(true)
    expect(resetActiveFeature).toHaveBeenCalledTimes(1)
    expect(resetToSearch).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no active feature', () => {
    expect(
      dismissActiveFeatureNavigation({
        hasActiveFeature: false,
        isCardOpen: true,
        closeCard: vi.fn(),
        resetActiveFeature: vi.fn(),
        resetToSearch: vi.fn(),
        setIntentionallyClosing: vi.fn(),
      }),
    ).toBe(false)
  })
})
