import type { Component } from 'svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

export type CompletionFooterEntities = Feature[]

export type CompletionFooterSectionKey =
  | 'content'
  | 'translation'
  | 'image'
  | 'category'
  | 'freeform'

export type CompletionFooterSection = {
  icon: Component
  title: string
  tooltip: string
  percentage: number
}

export type CompletionFooterProps = {
  entities: CompletionFooterEntities
}

export type CompletionFooterRootProps = {
  children?: import('svelte').Snippet
}

export type CompletionFooterStatProps = CompletionFooterSection
