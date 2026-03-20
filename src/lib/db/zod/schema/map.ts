import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { z } from 'zod'

import { mapStyleI18n, mapStyles, projectMapStyles } from '$lib/db/schema'
import { getLocales } from '$lib/db/zod/constraints'

export const MapStyleBase = createSelectSchema(mapStyles)
export const MapStyleInsert = createInsertSchema(mapStyles)
export const MapStyleUpdate = createUpdateSchema(mapStyles)

export const MapStyleI18nBase = createSelectSchema(mapStyleI18n)
export const MapStyleI18nInsert = createInsertSchema(mapStyleI18n).omit({
  mapStyleId: true,
  locale: true,
})
export const MapStyleI18nUpdate = createUpdateSchema(mapStyleI18n).omit({
  mapStyleId: true,
  locale: true,
})

export const MapStyleRow = MapStyleBase.extend({
  i18n: z.array(MapStyleI18nBase).nullish(),
})

export const MapStyleResolved = MapStyleBase.extend({
  i18n: getLocales(MapStyleI18nBase, ['name']).nullish(),
})

export const ProjectMapStyleBase = createSelectSchema(projectMapStyles)
export const ProjectMapStyleInsert = createInsertSchema(projectMapStyles)
export const ProjectMapStyleUpdate = createUpdateSchema(projectMapStyles)

export const ProjectMapStyleResolved = ProjectMapStyleBase.extend({
  mapStyle: MapStyleResolved.optional(),
})

export const ResolveProjectMapStyleParams = z.object({
  projectId: z.string().min(1),
})
