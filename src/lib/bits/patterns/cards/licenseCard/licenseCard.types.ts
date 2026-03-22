import type { Component } from 'svelte'

export interface LicenseCardCondition {
  key: 'publicDomain' | 'allRightsReserved' | 'BY' | 'SA' | 'NC' | 'ND'
  label: string
  description: string
  icon: Component<Record<string, unknown>>
}

export interface LicenseCardProps {
  mediaLabel: string
  mediaLicense: string
  mediaIcon: Component<Record<string, unknown>>
  attribution?: string | null
  conditions: LicenseCardCondition[]
  showLicenseName?: boolean
  isPublicDomain?: boolean
  isAllRightsReserved?: boolean
  class?: string
}
