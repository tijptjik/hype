// VALIDATION
import { z } from 'zod'

export const FeatureOriginSchema = z.enum([
  'app_contribution',
  'admin_contribution',
  'field_research',
])
export type FeatureOrigin = z.infer<typeof FeatureOriginSchema>
export const featureOriginLabels: Record<FeatureOrigin, string> = {
  app_contribution: 'App contribution',
  admin_contribution: 'Admin contribution',
  field_research: 'Field research',
}

/** Origin IDs are interpreted only through this server-owned namespace registry. */
export const featureOriginReferenceTables = {
  app_contribution: 'featureRevisionProposal',
  admin_contribution: null,
  field_research: 'fieldResearchSession',
} as const satisfies Record<FeatureOrigin, string | null>

export const ResearchCoordinatesSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
])
export type ResearchCoordinates = z.infer<typeof ResearchCoordinatesSchema>
export const ResearchUploadMetadataSchema = z.object({
  originalFilename: z.string().min(1).max(1024),
  capturedAt: z.string().max(100).nullable(),
  cameraModel: z.string().max(500).nullable(),
  credit: z.string().max(1000).nullable(),
  coordinates: ResearchCoordinatesSchema.nullable(),
  originalWidth: z.number().int().positive().nullable(),
  originalHeight: z.number().int().positive().nullable(),
})
export type ResearchUploadMetadata = z.infer<typeof ResearchUploadMetadataSchema>

export type ResearchSession = {
  id: string
  name: string
  organisationId: string
  projectId: string
  layerId?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  isArchived?: boolean
  archivedAt?: string | null
  archivedBy?: string | null
  completedAt: string | null
  status: 'uploading' | 'organising' | 'completed'
  revision: number
  west: number | null
  south: number | null
  east: number | null
  north: number | null
}
export type ResearchSessionFilters = {
  archive: 'active' | 'archived' | 'all'
  creatorId: string
  organisationId: string
  projectId: string
  layerId: string
  sortBy: 'createdAt' | 'name'
  sortOrder: 'asc' | 'desc'
}

export type ResearchSessionIndexRow = ResearchSession & {
  photoCount: number
  stackCount: number
  layerName: string | null
  creatorName: string | null
  creatorImage: string | null
}
export type ResearchImage = {
  id: string
  sessionId: string
  stackId: string | null
  state: 'uploading' | 'uploaded'
  filename: string
  longitude: number | null
  latitude: number | null
  capturedAt: string | null
  contentHash: string
  storageKey: string
  env: string
  mediaType: string
  byteSize: number
  metadata: string
  createdAt: string
}
export type ResearchStack = {
  id: string
  sessionId: string
  longitude: number | null
  latitude: number | null
  featureId: string | null
  name?: string | null
  featureType?: string | null
  createdAt: string
}

/** Read valid GPS metadata without treating missing coordinates as zero.
 * @param latitude Extracted latitude. @param longitude Extracted longitude.
 * @returns Valid longitude/latitude pair or null.
 */
export function researchCoordinates(
  latitude: string | null,
  longitude: string | null,
): ResearchCoordinates | null {
  if (!latitude?.trim() || !longitude?.trim()) return null
  const result = ResearchCoordinatesSchema.safeParse([
    Number(longitude),
    Number(latitude),
  ])
  return result.success ? result.data : null
}

/** Suggest bounded-radius groups using a spatial grid, preserving first-image pin locations.
 * @param images Uploaded ungrouped images in stable capture order.
 * @param radiusMetres Maximum distance from the first image of a suggested stack.
 * @returns Suggested groups; images without coordinates remain singletons.
 * @remarks Suggestions never modify capture GPS. Grid neighbours avoid an all-pairs scan.
 */
export function suggestResearchStacks(
  images: Pick<ResearchImage, 'id' | 'longitude' | 'latitude'>[],
  radiusMetres = 20,
): string[][] {
  const groups: string[][] = []
  const cells = new Map<string, { point: number[]; group: string[] }[]>()
  const radius = 6371000
  for (const image of images) {
    if (image.longitude === null || image.latitude === null) {
      groups.push([image.id])
      continue
    }
    const lat = (image.latitude * Math.PI) / 180
    const lng = (image.longitude * Math.PI) / 180
    const point = [
      radius * Math.cos(lat) * Math.cos(lng),
      radius * Math.cos(lat) * Math.sin(lng),
      radius * Math.sin(lat),
    ]
    const cell = point.map(value => Math.floor(value / radiusMetres))
    let nearest: { group: string[]; distance: number } | null = null
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          for (const candidate of cells.get(
            `${cell[0] + x},${cell[1] + y},${cell[2] + z}`,
          ) ?? []) {
            const distance = Math.hypot(
              ...point.map((value, index) => value - candidate.point[index]),
            )
            if (distance <= radiusMetres && (!nearest || distance < nearest.distance))
              nearest = { group: candidate.group, distance }
          }
        }
    if (nearest) nearest.group.push(image.id)
    else {
      const group = [image.id]
      groups.push(group)
      const key = cell.join(',')
      cells.set(key, [...(cells.get(key) ?? []), { point, group }])
    }
  }
  return groups
}
