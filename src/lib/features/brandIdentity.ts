/** Public brand identities shared by inherited and directly stored feature properties. */
export const BRAND_IDENTITIES = [
  {
    code: '7eleven',
    name: '7-Eleven',
    badge: '7',
    color: '#28664d',
    aliases: ['7-eleven', '7 eleven', '7-11'],
  },
  {
    code: 'maxims',
    name: 'Maxim’s Cakes',
    badge: '美心',
    color: '#714737',
    aliases: [
      "maxim's",
      "maxim's cakes",
      'maxim’s',
      'maxim’s cakes',
      '美心',
      '美心西餅',
    ],
  },
  {
    code: 'arome',
    name: 'arôme',
    badge: '東海堂',
    color: '#767d3c',
    aliases: ['arôme', 'arome bakery', '東海堂'],
  },
  {
    code: 'honore',
    name: 'Saint Honore',
    badge: 'SH',
    color: '#b87755',
    aliases: ['saint honore', 'saint honoré', 'st honore', '聖安娜'],
  },
  {
    code: 'yamazaki',
    name: 'Yamazaki',
    badge: 'Y',
    color: '#b28b21',
    aliases: ['yamazaki bakery', '山崎'],
  },
  {
    code: 'kayser',
    name: 'Maison Kayser',
    badge: 'MK',
    color: '#263d34',
    aliases: ['maison kayser', 'maison eric kayser', 'eric kayser'],
  },
  {
    code: 'peninsula',
    name: 'The Peninsula',
    badge: 'P',
    color: '#28322e',
    aliases: ['the peninsula', 'the peninsula hong kong'],
  },
  {
    code: 'garden',
    name: 'Garden',
    badge: 'G',
    color: '#c92943',
    aliases: ['the garden', '嘉頓'],
  },
  {
    code: 'childhood',
    name: 'Childhood Bakery',
    badge: 'CB',
    color: '#b9685e',
    aliases: ['childhood bakery', '小時候'],
  },
  {
    code: 'harlans',
    name: 'Harlan’s',
    badge: 'H',
    color: '#29383d',
    aliases: ["harlan's", 'harlan’s'],
  },
  {
    code: 'fresh-wheat',
    name: 'Fresh Wheat Bakery',
    badge: 'FW',
    color: '#a38b46',
    aliases: ['fresh wheat bakery', '美麥多'],
  },
  {
    code: 'nibbles',
    name: 'Nibbles Baking Nook',
    badge: 'N',
    color: '#ae7c4b',
    aliases: ['nibbles baking nook'],
  },
  {
    code: 'wooloomooloo',
    name: 'Wooloomooloo Prime',
    badge: 'W',
    color: '#75664b',
    aliases: ['wooloomooloo prime'],
  },
  {
    code: 'deedee',
    name: 'Dee Dee Bakery',
    badge: 'DD',
    color: '#253f42',
    aliases: ['dee dee bakery', 'deedee bakery'],
  },
] as const

/**
 * Resolves a brand value without consulting feature titles, source IDs or Place storage.
 * @param value Effective feature-property value or its classifier label.
 * @returns Known brand with a bundled SVG, or undefined for an unknown identity.
 * @remarks Place inheritance must hydrate the same property contract upstream.
 */
export function resolveBrandIdentity(
  value: string,
): ((typeof BRAND_IDENTITIES)[number] & { logoSrc: string }) | undefined {
  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase('en')
  const brand = BRAND_IDENTITIES.find(
    brand =>
      brand.code === normalized ||
      brand.aliases.some(alias => alias.toLocaleLowerCase('en') === normalized),
  )
  return brand
    ? { ...brand, logoSrc: `/brands/breadline/${brand.code}.svg` }
    : undefined
}
