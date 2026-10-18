export type SyncMode = 'auto' | 'full'

export type SyncStrategy =
  | 'incremental-upsert-with-key-reconciliation'
  | 'snapshot-replace'

/** Describes one PostgreSQL source column. */
export interface SourceColumn {
  schema: string
  table: string
  name: string
  dataType: string
  udtName: string
  nullable: boolean
  defaultValue: string | null
  ordinalPosition: number
}

/** Describes one PostgreSQL foreign-key constraint. */
export interface SourceForeignKey {
  name: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
}

/** Describes one non-internal PostgreSQL trigger and its function. */
export interface SourceTrigger {
  name: string
  definition: string
  functionName: string
  functionDefinition: string
}

/** Explains how a source table can be mirrored safely. */
export interface IncrementalAssessment {
  strategy: SyncStrategy
  cursorColumn: string | null
  cursorMaintenanceEvidence: string
  reason: string
  capturesHardDeletes: boolean
}

/** Complete schema information needed to mirror one source table. */
export interface SourceTable {
  schema: string
  name: string
  estimatedRows: number
  columns: SourceColumn[]
  primaryKey: string[]
  foreignKeys: SourceForeignKey[]
  triggers: SourceTrigger[]
  incremental: IncrementalAssessment
  schemaFingerprint: string
}

/** Serializable output of the Breadline schema inspector. */
export interface SourceSchemaReport {
  inspectedAt: string
  databaseName: string
  serverVersion: string
  schemas: string[]
  tables: SourceTable[]
}

/** Persisted result of syncing one source table into the local mirror. */
export interface TableSyncResult {
  sourceTable: string
  mirrorTable: string
  strategy: SyncStrategy
  cursorColumn: string | null
  sourceRows: number
  localRows: number
  pulledRows: number
  changedRows: number
  deletedRows: number
  checkpoint: string
}

/** Options accepted by the Breadline mirror synchronizer. */
export interface MirrorSyncOptions {
  mirrorPath: string
  schemas: string[]
  tables: string[]
  mode: SyncMode
  batchSize: number
  overlapSeconds: number
}
