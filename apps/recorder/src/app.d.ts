declare global {
  namespace App {
    interface PageState {
      recorder?: { visit?: string; sessionId: string; view: 'session' | 'records' | 'map' | 'search' | 'recordMap' | 'edit'; recordId?: string; newRecord?: boolean }
    }
  }
}
export {}
