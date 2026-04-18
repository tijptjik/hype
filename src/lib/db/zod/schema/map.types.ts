import type { z } from 'zod'

import type {
  MapStyleBase,
  MapStyleI18nBase,
  MapStyleResolved,
  MapStyleRow,
  ProjectMapStyleBase,
} from './map'

export type MapStyleDB = z.infer<typeof MapStyleBase>
export type MapStyleI18nDB = z.infer<typeof MapStyleI18nBase>
export type MapStyleRowDB = z.infer<typeof MapStyleRow>
export type MapStyleResolvedDB = z.infer<typeof MapStyleResolved>
export type ProjectMapStyleDB = z.infer<typeof ProjectMapStyleBase>
