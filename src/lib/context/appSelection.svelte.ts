// TYPES
import type { ActiveCollection } from './resourceCollection.types.js'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { Id } from '#lib/types.js'

type SelectedFeature = Feature | FeatureFromCollection

/** One public selection, projected into cards and marker presentation. */
export class AppSelection {
  private generation = 0

  /** Invalidates pending selection work after another selection or a clear. */
  get revision(): number {
    return this.generation
  }

  private selectedId: Id | null = $state(null)
  private retainedFeature: SelectedFeature | null = $state.raw(null)
  collection: ActiveCollection | null = $state(null)

  /** @param resolveFeature Reads the freshest retained resource data for an identity. */
  constructor(
    private readonly resolveFeature: (id: Id) => SelectedFeature | undefined,
  ) {}

  get featureId(): Id | null {
    return this.selectedId
  }

  get feature(): SelectedFeature | null {
    if (!this.selectedId) return null
    return (
      this.resolveFeature(this.selectedId) ??
      this.collection?.items.find(item => item.id === this.selectedId) ??
      this.retainedFeature
    )
  }

  /** Selects an identity and retains its preview if query pages are evicted. @param feature Selected resource. @returns Nothing. */
  select(feature: SelectedFeature): void {
    this.generation++
    this.retainedFeature = feature
    this.selectedId = feature.id
  }

  /** Clears feature focus while retaining collection navigation context. @returns Nothing. */
  clearFeature(): void {
    this.generation++
    this.selectedId = null
    this.retainedFeature = null
  }
}
