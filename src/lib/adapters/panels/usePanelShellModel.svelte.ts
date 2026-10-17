// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

/**
 * Adapts route-owned visibility and navigation state for a controlled panel shell.
 * @param app - Application context owned by the consuming route.
 * @param panelType - Panel whose visibility is being rendered.
 * @returns Reactive panel props and close intent.
 */
export function usePanelShellModel(app: AppCtx, panelType: Panel) {
  return {
    get panel(): PanelProps {
      return {
        panelType,
        position:
          panelType === Panel.hub || panelType === Panel.stars ? 'left' : 'right',
        scrollable: panelType !== Panel.stars,
        inline: panelType !== Panel.filters && app.isAdmin(),
        isNarrow: false,
        isAdmin: panelType === Panel.profile && app.isAdmin(),
        active: {
          resourceType: app.getActiveResourceType(),
          resourceRef: app.getActiveResourceRef(),
          resourceId: app.getActiveResourceId(),
          facet: app.getActiveFacet(),
        },
      }
    },
    get open() {
      return app.isPanelOpen(panelType) || app.isPanelOpenVisually(panelType)
    },
    onClose: () => app.closePanel(panelType),
  }
}
