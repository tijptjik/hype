import type { NavigationFloor } from './types'

/** Independent floor loader with shared in-flight work and retryable failures. */
export class FloorRepository {
  private cache = new Map<string, Promise<NavigationFloor>>()
  constructor(
    readonly ids: readonly string[],
    private readonly loader: (id: string) => Promise<NavigationFloor>,
  ) {}
  /** Loads one floor without loading its neighbours. @param id Floor identity. @returns Validated floor module. */
  load(id: string): Promise<NavigationFloor> {
    if (!this.ids.includes(id)) return Promise.reject(new Error(`Unknown floor: ${id}`))
    const cached = this.cache.get(id)
    if (cached) return cached
    const pending = this.loader(id)
      .then(floor => {
        if (floor.id !== id) throw new Error('Floor identity mismatch')
        return floor
      })
      .catch(error => {
        this.cache.delete(id)
        throw error
      })
    this.cache.set(id, pending)
    return pending
  }
}
