// User import service - Coming Soon

export interface UserCSVDropEvent {
  acceptedFiles: File[]
  type: 'users'
}

export async function handleUserCSVDrop(
  event: UserCSVDropEvent,
  onFileProcessed: (file: File, data: any) => void,
) {
  console.warn('User CSV import is not yet implemented')
  // TODO: Implement user CSV import logic
}
