import { describe, expect, it } from 'vitest'
import { PanelController } from '#lib/context/panels.svelte.js'
import { DUAL_PANEL_MIN_WIDTH } from '#lib/constants.js'
import { Panel } from '#lib/enums.js'

describe('panel viewport guard', () => {
  it.each([
    [Panel.prisms, Panel.filters],
    [Panel.filters, Panel.prisms],
  ])('closes %s and preserves the later opening %s', (older, newer) => {
    const ctx = new PanelController()
    ctx.setPanelOpen(older, true)
    ctx.setPanelOpen(newer, true)
    expect(ctx.getPanelsToCloseForViewport(DUAL_PANEL_MIN_WIDTH)).toEqual([])
    expect(ctx.getPanelsToCloseForViewport(DUAL_PANEL_MIN_WIDTH - 1)).toEqual([older])
    ctx.setPanelOpen(older, false)
    expect(ctx.getPanelsToCloseForViewport(DUAL_PANEL_MIN_WIDTH - 1)).toEqual([])
    expect(ctx.getPanelsToCloseForViewport(DUAL_PANEL_MIN_WIDTH + 1)).toEqual([])
    expect(ctx.isPanelOpen(older)).toBe(false)
    expect(ctx.isPanelOpen(newer)).toBe(true)
  })

  it('does not let repeated open-state synchronization change recency', () => {
    const ctx = new PanelController()
    ctx.setPanelOpen(Panel.prisms, true)
    ctx.setPanelOpen(Panel.settings, true)
    ctx.setPanelOpen(Panel.prisms, true)
    expect(ctx.getPanelsToCloseForViewport(800)).toEqual([Panel.prisms])
    ctx.setPanelOpen(Panel.prisms, false)
    ctx.setPanelOpen(Panel.prisms, true)
    expect(ctx.getPanelsToCloseForViewport(800)).toEqual([Panel.settings])
  })

  it('ignores an unmeasured viewport and visual-only panel openings', () => {
    const ctx = new PanelController()
    ctx.setPanelOpen(Panel.prisms, true)
    ctx.setPanelOpenVisually(Panel.filters, true)
    expect(ctx.getPanelsToCloseForViewport(800)).toEqual([])
    ctx.setPanelOpen(Panel.filters, true)
    expect(ctx.getPanelsToCloseForViewport(0)).toEqual([])
  })
})
