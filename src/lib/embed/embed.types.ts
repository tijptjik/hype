import type { EmbedConfig } from './config'
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'

export type EmbedNames = Record<string, { name: string }>

export type EmbedLayer = {
  i18n?: EmbedNames
  organisationI18n?: EmbedNames
  projectI18n?: EmbedNames
  id: string
  code: string
  name: string
  projectCode?: string
  organisationCode?: string
  hubCode?: string | null
  projectId: string
  projectName: string
  organisationId: string
  organisationName: string
  hubId: string | null
  hubName: string | null
}
export type EmbedPayload = {
  config: EmbedConfig
  layers: EmbedLayer[]
  page: FeatureQueryPage
}
