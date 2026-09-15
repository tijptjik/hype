// TYPES

/* ----------------- */
// PROJECT LICENSE
/* -------- */

export type ProjectLicenseMediaType = 'all' | 'image' | 'text' | 'data'

export type ProjectLicenseRights = {
  license: string
  isPublicDomain: boolean
  isAllRightsReserved: boolean
  BY: boolean | null
  SA: boolean | null
  NC: boolean | null
  ND: boolean | null
}

type ProjectLicenseMedia = Record<ProjectLicenseMediaType, ProjectLicenseRights>

type ProjectLicenseMeta = {
  allMediaSameRights: boolean
  attribution: string
  isAllRightsReserved: boolean
  isPublicDomain: boolean
  history: ProjectLicenseHistoryEntry[]
}

export type ProjectLicenseHistoryEntry = {
  publishedAt: string
  licenses: Partial<Record<ProjectLicenseMediaType, string>>
  attribution: string
}

export type ProjectLicense = {
  meta: ProjectLicenseMeta
  media: ProjectLicenseMedia
}
