// TYPES
import type { Panel, FirstClassResource } from '$lib/enums'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { Id, Code } from '$lib/types'
import type { FacetType } from '$lib/context/facets'

/* ----------------- */
// PANELS :: APP
/* -------- */

export type TitleEnvironmentLabel = 'ᴰᴱⱽ' | 'ᴾᴿᴱⱽᴵᴱᵂ' | 'ᴾᴿᴼᴰ'

export type PanelProps = {
  panelType: Panel
  position: PanelPosition
  scrollable: boolean
  inline: boolean
  isNarrow: boolean
  isAdmin: boolean
  active?: {
    resourceType: FirstClassResource | false
    resourceRef: Id | Code | false
    resourceId: Id | null
    facet: FacetType | false
  }
  adminCtx?: AdminCtx
}

type PanelPosition = 'left' | 'right'
