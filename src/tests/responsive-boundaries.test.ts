import { describe, expect, it } from 'vitest'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { PanelController } from '#lib/context/panels.svelte.js'
import { SurfaceLayout } from '#lib/context/surfaceLayout.svelte.js'
import { hasElevatedChrome } from '#lib/layout/chrome.js'
import { MOBILE_MAX_WIDTH, PANEL_WIDTH } from '#lib/constants.js'
import { Panel } from '#lib/enums.js'

describe('responsive ownership and geometry', () => {
  it('shares viewport measurements while isolating surface panels and main measurements', () => {
    const viewport = new ResponsiveCtx()
    viewport.setWindowDimensions(1500, 900)
    const app = new SurfaceLayout(viewport)
    const admin = new SurfaceLayout(viewport)
    app.setMainDimensions(1400, 800)
    admin.setMainDimensions(1000, 700)
    app.panels.setPanelOpen(Panel.prisms, true)
    expect(app.getEffectiveAppMainWidth()).toBe(1400 - PANEL_WIDTH)
    expect(app.getAppMainOffsetX()).toBe(PANEL_WIDTH / 2)
    expect(admin.getEffectiveAppMainWidth()).toBe(1000)
    expect(admin.getAppMainOffsetX()).toBe(0)
    expect(admin.panels.isPanelOpen(Panel.prisms)).toBe(false)
    viewport.setWindowDimensions(MOBILE_MAX_WIDTH - 1, 900)
    expect(app.getEffectiveAppMainWidth()).toBe(1400)
    expect(app.getAppMainOffsetX()).toBe(0)
    expect(admin.getEffectiveAppMainWidth()).toBe(1000)
  })

  it('keeps transient panel visibility out of geometry and balances opposing panels', () => {
    const viewport = new ResponsiveCtx()
    viewport.setWindowDimensions(1500, 900)
    const layout = new SurfaceLayout(viewport)
    layout.setMainDimensions(1400, 800)
    layout.panels.setPanelOpenVisually(Panel.prisms, true)
    expect(layout.getEffectiveAppMainWidth()).toBe(1400)
    expect(layout.getAppMainOffsetX()).toBe(0)
    layout.panels.setPanelOpen(Panel.filters, true)
    expect(layout.getAppMainOffsetX()).toBe(-PANEL_WIDTH / 2)
    layout.panels.setPanelOpen(Panel.prisms, true)
    expect(layout.getAppMainOffsetX()).toBe(0)
    expect(layout.getEffectiveAppMainWidth()).toBe(1400 - PANEL_WIDTH * 2)
    layout.setMainDimensions(1, 800)
    expect(layout.getEffectiveAppMainWidth()).toBe(0)
  })

  it('keeps visual viewport changes separate from shell reservation and mobile classification', () => {
    const viewport = new ResponsiveCtx()
    viewport.setWindowDimensions(1500, 900)
    const layout = new SurfaceLayout(viewport)
    layout.setMainDimensions(1400, 800)
    const reserved = layout.menuReservedHeight
    viewport.setViewportDimensions(390, 500, 30, 10)
    expect(viewport.visibleWindowWidth).toBe(390)
    expect(viewport.visibleWindowHeight).toBe(500)
    expect(viewport.keyboardInsetHeight).toBe(370)
    expect(viewport.isMobile).toBe(false)
    expect(layout.menuReservedHeight).toBe(reserved)
    expect(layout.getEffectiveAppMainWidth()).toBe(1400)
    viewport.setViewportDimensions(0, 0)
    expect(viewport.visibleWindowWidth).toBe(1500)
    expect(viewport.visibleWindowHeight).toBe(900)
    expect(viewport.keyboardInsetHeight).toBe(0)
  })

  it('retains admin visual collapse semantics independently of sided panels', () => {
    const panels = new PanelController()
    expect(panels.isPanelNarrow(Panel.admin)).toBe(true)
    panels.setPanelOpenVisually(Panel.admin, true)
    expect(panels.isPanelNarrow(Panel.admin)).toBe(false)
    expect(panels.isLeftPanelOpen()).toBe(false)
    expect(panels.isRightPanelOpen()).toBe(false)
  })

  it.each([
    [479, 900, false],
    [480, 839, false],
    [480, 840, true],
    [767, 839, false],
    [768, 400, true],
    [1280, 400, true],
  ])('preserves chrome behavior at %s × %s', (width, height, expected) => {
    expect(hasElevatedChrome(width, height)).toBe(expected)
  })
})
