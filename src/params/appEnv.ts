import { ImageEnv } from '$lib/enums'

export function match(param: string): boolean {
  return (
    param === ImageEnv.local ||
    param === ImageEnv.preview ||
    param === ImageEnv.production
  )
}
