/**
 * Creates a short, non-reversible correlation key for authentication diagnostics.
 *
 * @param value - Sensitive or user-specific value that must not be written to logs directly.
 * @returns The first twelve hexadecimal characters of the value's SHA-256 digest.
 * @remarks This is for correlating a single request flow in operational logs; it is not
 * an authentication, authorization, or general-purpose anonymization mechanism.
 */
export async function createAuthDiagnosticId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))

  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}
