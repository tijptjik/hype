// Event import service - Coming Soon

export interface EventCSVDropEvent {
  acceptedFiles: File[];
  type: 'events';
}

export async function handleEventCSVDrop(
  event: EventCSVDropEvent,
  onFileProcessed: (file: File, data: any) => void
) {
  console.warn('Event CSV import is not yet implemented');
  // TODO: Implement event CSV import logic
}
