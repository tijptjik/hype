import type { Component } from 'svelte'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

export type FeatureStatsProps = {
  feature: Feature
  appCtx: ResourceViewCtx
  showTitle?: boolean
}

export type FeatureStatPipsProps = {
  /** Dense virtual rows use native labels without mounting a tooltip tree per dot. */
  tooltipMode?: 'rich' | 'native'
  title: string
  icon?: Component
  statuses: Record<string, boolean | null>
  showTitle?: boolean
}
