// @vitest-environment jsdom
// TESTING
import { afterEach, describe, expect, it, vi } from 'vitest'
// CONTEXT
import { PanelController } from '#lib/context/panels.svelte.js'
import { SurfaceInteractions } from '#lib/context/surfaceInteractions.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('surface interactions', () => {
  it('registers once, ignores editable focus, and stops handling keys after disposal', () => {
    const panels = new PanelController()
    const interactions = new SurfaceInteractions(
      panels,
      new AccountState(),
      () => false,
      () => true,
    )
    cleanups.push(() => {
      interactions.dispose()
      panels.dispose()
    })
    const toggle = vi.spyOn(panels, 'togglePanel').mockImplementation(() => {})
    const close = vi.spyOn(panels, 'closeAllPanels').mockImplementation(() => {})
    interactions.registerKeydownHandlers()
    interactions.registerKeydownHandlers()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    expect(toggle).toHaveBeenCalledExactlyOnceWith(Panel.prisms)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    expect(toggle).toHaveBeenCalledTimes(1)
    input.blur()
    panels.setPanelOpen(Panel.prisms, true)
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    document.dispatchEvent(escapeEvent)
    expect(close).toHaveBeenCalledOnce()
    expect(escapeEvent.defaultPrevented).toBe(true)
    interactions.dispose()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('invalidates previous profile data and hydrates through explicit effects', async () => {
    const loadProfile = vi.fn(async () => {})
    const invalidateProfile = vi.fn()
    const panels = new PanelController({ loadProfile, invalidateProfile })
    panels.setPanelCtx(Panel.profile, 'username', 'alice')
    const profile = panels.state.profile.ctx
    if (!profile) throw new Error('Expected profile context')
    profile.userData = { username: 'alice' } as never
    panels.setPanelCtx(Panel.profile, 'username', 'bob')
    expect(panels.state.profile.ctx?.userData).toBeNull()
    expect(invalidateProfile).toHaveBeenCalledTimes(2)
    panels.openPanel(Panel.profile, false)
    expect(loadProfile).toHaveBeenCalledOnce()
    panels.dispose()
  })

  it('cancels focus scheduled by a surface that unmounts', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="left-panel"><input /></div>'
    const input = document.querySelector('input')
    if (!input) throw new Error('Expected panel input')
    const focus = vi.spyOn(input, 'focus')
    const panels = new PanelController()
    panels.focusPanel('left')
    panels.dispose()
    vi.runAllTimers()
    expect(focus).not.toHaveBeenCalled()
  })
})
