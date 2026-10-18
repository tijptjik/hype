// Event import service - Coming Soon

export interface EventCSVDropEvent {
  acceptedFiles: File[]
  type: 'events'
}

export async function handleEventCSVDrop(
  _event: EventCSVDropEvent,
  _onFileProcessed: (file: File, data: unknown) => void,
) {
  console.warn('Event CSV import is not yet implemented')
  // TODO: Implement event CSV import logic
}
