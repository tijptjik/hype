// TYPES
import type { ConversionStage } from './lib/pipeline'

// Register reviewed stages in dependency order: users, features, schedules, events.
// Each stage must preserve source identity in offline records, be idempotent, and reconcile its writes.
// No Breadline rows may be imported until the proposed schema and mappings are reviewed.
export const conversionStages: readonly ConversionStage[] = []
