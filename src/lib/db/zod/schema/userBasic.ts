// ZOD
import { z } from 'zod'

/** Public user identity shared by browser and server resource profiles. */
export const UserBasic = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayUsername: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  attribution: z.string().nullable(),
})
