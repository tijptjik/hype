import { describe, expect, it } from 'vitest'
import { ResourceIndexUi } from '#lib/context/resourceIndexUi.svelte.js'
import { HeaderCtrl } from '#lib/context/header.svelte.js'
import Component from './mocks/svelte-component.svelte'
import HistoryIcon from 'virtual:icons/proicons/history'

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

  it('enables entity header search without enabling unrelated index controls', () => {
    const header = new HeaderCtrl()
    header.setHeaderForEntity('Changelog', HistoryIcon, new Map(), { showFilter: true })
    expect(header.state.visibility).toMatchObject({
      showFilter: true,
      showFacets: true,
      showViewActions: false,
    })
    header.setHeaderForEntity('Profile', HistoryIcon, new Map())
    expect(header.state.visibility.showFilter).toBe(false)
  })

  it('retains embedded index controls when the entity profile finishes loading', () => {
    const header = new HeaderCtrl()
    const listUi = new ResourceIndexUi()
    header.setSearch({ indexView: true, listUi, query: '', onFilter: () => {} })
    header.setControlBar(Component, {}, { isVisible: true })
    const controls = header.state.layout.controlBar

    header.setHeaderForEntity('Loaded organisation', Component, new Map())

    expect(header.state.meta.title).toBe('Loaded organisation')
    expect(header.state.layout.controlBar).toBe(controls)
    expect(header.state.search?.listUi).toBe(listUi)
  })

  it('clears the previous index controls when opening an ordinary entity form', () => {
    const header = new HeaderCtrl()
    header.setControlBar(Component, {})
    header.setHeaderForEntity('Organisation profile', Component, new Map())
    expect(header.state.layout.controlBar).toBeNull()
  })
})
