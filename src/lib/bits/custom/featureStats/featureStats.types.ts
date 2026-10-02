import type { Component } from 'svelte'
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

export type FeatureStatsProps = {
  feature: Feature
  appCtx: AppCtx
  showTitle?: boolean
}

export type FeatureStatPipsProps = {
  title: string
  icon?: Component
  statuses: Record<string, boolean | null>
  showTitle?: boolean
}
