export const AUTH_PROVIDER_REGISTRY = [
  { id: 'email', label: 'Email and password', enabled: true },
  { id: 'google', label: 'Google', enabled: true },
  { id: 'facebook', label: 'Facebook', enabled: true },
  { id: 'wechat', label: 'WeChat', enabled: false },
] as const

export type AuthProviderId = (typeof AUTH_PROVIDER_REGISTRY)[number]['id']

/**
 * Resolves a provider's product-level availability.
 *
 * @param providerId - Provider registry identifier.
 * @returns Whether the provider may initiate authentication.
 */
export function isAuthProviderEnabled(providerId: AuthProviderId): boolean {
  return (
    AUTH_PROVIDER_REGISTRY.find(provider => provider.id === providerId)?.enabled ===
    true
  )
}
