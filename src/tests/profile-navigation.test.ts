// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { Panel } from '#lib/enums.js'
import { PanelController } from '#lib/context/panels.svelte.js'
import { updatePanelUrlParams } from '#lib/navigation/index.js'

vi.mock('#lib/navigation/index.js', () => ({ updatePanelUrlParams: vi.fn() }))

// Exercise the actual adapter handler without constructing the entire application context.
const source = readFileSync(
  'src/lib/adapters/panels/useProfileSectionModel.svelte.ts',
  'utf8',
)
const handler = source.slice(
  source.indexOf('  function handleOpenProfile()'),
  source.indexOf('  async function handleLogout()'),
)
const javascript = ts.transpileModule(handler, {}).outputText

describe('My Profile navigation', () => {
  it.each([
    [true, 'my.name'],
    [true, null],
    [true, undefined],
    [false, 'my.name'],
  ] as const)(
    'opens the profile on its owning surface (admin=%s, username=%s)',
    (admin, username) => {
      const goto = vi.fn()
      vi.mocked(updatePanelUrlParams).mockClear()
      const panels = new PanelController()
      panels.setPanelOpen(Panel.settings, true)
      const togglePanel = vi.spyOn(panels, 'togglePanel')
      const appCtx = {
        isAdmin: () => admin,
        account: { user: { username } },
        panels,
      }
      const open = new Function(
        'appCtx',
        'goto',
        'Panel',
        'isGuestUserSession',
        `${javascript}; return handleOpenProfile;`,
      )(appCtx, goto, Panel, () => false)
      open()
      if (admin) {
        expect(goto).toHaveBeenCalledWith('/admin/users/@me')
        expect(panels.isPanelOpen(Panel.settings)).toBe(false)
        expect(updatePanelUrlParams).not.toHaveBeenCalled()
        expect(goto).toHaveBeenCalledTimes(1)
        expect(togglePanel).not.toHaveBeenCalled()
      } else {
        expect(goto).not.toHaveBeenCalled()
        expect(panels.state.profile.ctx?.username).toBe('my.name')
        expect(panels.isPanelOpen(Panel.profile)).toBe(true)
      }
    },
  )
})
