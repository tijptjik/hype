export type ImportableResource = 'features' | 'users' | 'events' | 'images'

export type DropzoneEvent = {
  acceptedFiles: File[]
  fileRejections?: unknown[]
  type: ImportableResource
  event?: Event
}
