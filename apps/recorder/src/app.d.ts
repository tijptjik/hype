declare global {
  namespace App {
    interface PageState {
      recorder?: { sessionId: string; view: 'session' | 'records' | 'map' | 'search' | 'recordMap'; recordId?: string }
    }
  }
}
export {}
