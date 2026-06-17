// CONFIG
export const NEW_TITLE = 'New'
export const NEW_REF = NEW_TITLE.toLowerCase()
export const ADMIN_PATH = '/admin'
export const API_PATH = '/api'

export const ADMIN_MIN_WIDTH = 1200
export const MOBILE_MAX_WIDTH = 768
export const PANEL_WIDTH = 420
export const DUAL_PANEL_MIN_WIDTH = 1320

export const isMobile = (): boolean =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_MAX_WIDTH

export const HUB_ORIGINS = ['hype.hk', 'hkghostsigns.com', 'breadline.hk'] as const
