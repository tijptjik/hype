// ENVIRONMENT
import { BROWSER } from 'esm-env'

/**
 * Creates a versioned, development-only, tab-scoped draft store.
 * @param key Account- and form-specific storage key.
 * @returns Best-effort read, write and clear operations.
 * @remarks Production and SSR never access storage. Callers own the payload format;
 * change the key version when its shape changes. Session storage survives refreshes
 * and isolates tabs/windows; duplicated tabs may start with a copy, then diverge.
 * Storage failures never block editing.
 */
export function createDevFormDraft<T extends object>(
  key: string,
): {
  read: () => T | null
  write: (value: T) => void
  clear: () => void
} {
  return {
    read: () => {
      if (!BROWSER || !import.meta.env.DEV) return null
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null')
        return stored?.version === 1 && stored.value && typeof stored.value === 'object'
          ? (stored.value as T)
          : null
      } catch {
        return null
      }
    },
    write: value => {
      if (!BROWSER || !import.meta.env.DEV) return
      try {
        sessionStorage.setItem(key, JSON.stringify({ version: 1, value }))
      } catch {
        // Full or disabled storage must not interrupt form input.
      }
    },
    clear: () => {
      if (!BROWSER || !import.meta.env.DEV) return
      try {
        sessionStorage.removeItem(key)
      } catch {
        // Private browsing can make even removal unavailable.
      }
    },
  }
}
