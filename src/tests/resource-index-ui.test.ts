import { describe, expect, it } from 'vitest'
import { ResourceIndexUi } from '#lib/context/resourceIndexUi.svelte.js'
import { HeaderCtrl } from '#lib/context/header.svelte.js'

describe('resource index presentation ownership', () => {
  it('retains per-resource preferences without sharing them between surfaces', () => {
    const first = new ResourceIndexUi()
    const second = new ResourceIndexUi()
    first.state.layoutMode.feature = 'card'
    first.state.isControlBarVisible.feature = false
    expect(first.state.layoutMode.task).toBe('table')
    expect(second.state.layoutMode.feature).toBe('table')
    expect(second.state.isControlBarVisible.feature).toBe(true)
  })

  it('clears transient header search focus without resetting list preferences', () => {
    const ui = new ResourceIndexUi()
    const header = new HeaderCtrl()
    ui.state.layoutMode.feature = 'card'
    header.isSearchFocused = true
    header.reset()
    expect(header.isSearchFocused).toBe(false)
    expect(ui.state.layoutMode.feature).toBe('card')
  })
})
