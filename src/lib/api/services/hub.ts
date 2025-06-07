// ═══════════════════════
// HUB DOMAIN MAPPING
// ═══════════════════════

/**
 * Parses host to determine hub identifier without DB lookup
 * Returns hub identifier object for efficient filtering
 */
export function getHubFromDomain(host: string | null): { 
  hubCode?: string; 
  hubDomain?: string; 
  isCore: boolean 
} {
  // Development override
  if (import.meta.env.VITE_HUB_CODE) {
    const hubCode = import.meta.env.VITE_HUB_CODE;
    return { 
      hubCode: hubCode === 'core' ? undefined : hubCode, 
      isCore: hubCode === 'core' 
    };
  }

  // Default to core
  if (!host) return { isCore: true };

  // Remove port number if present
  const domain = host.split(':')[0];

  // localhost -> core (development)
  if (domain === 'localhost') {
    return { isCore: true };
  }

  // hype.hk -> core
  if (domain === 'hype.hk') {
    return { isCore: true };
  }

  // subdomain.hype.hk -> use subdomain as hub code
  if (domain.endsWith('.hype.hk')) {
    const subdomain = domain.replace('.hype.hk', '');
    return { hubCode: subdomain, isCore: false };
  }

  // custom domain -> use full domain as hub domain
  return { hubDomain: domain, isCore: false };
}