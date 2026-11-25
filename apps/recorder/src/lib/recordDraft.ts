// TYPES
import type { RecorderEditor } from '../../../../src/lib/fieldResearch/recorderEditor'

export type PendingPhoto = { id: string; file: File; selected: boolean }
export type RecordDraft = {
  record: RecorderEditor
  saved: string
  photos: PendingPhoto[]
}
