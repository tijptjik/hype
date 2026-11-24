declare global {
  namespace App {
    interface PageState {
      recorder?: { sessionId: string; view: 'session' | 'records' | 'map' | 'search' | 'recordMap' | 'edit'; recordId?: string }
    }
  }
}
export {}
