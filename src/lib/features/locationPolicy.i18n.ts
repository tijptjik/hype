// I18N
import { getLocaleKey } from '#lib/i18n.js'
// TYPES
import type { TargetContext } from './locationPolicy'

const labels = {
  service_point: ['Service point', '服務點', '服务点'],
  premises_address: ['Premises', '處所地址', '处所地址'],
  cadastral_address: ['Cadastral', '地籍地址', '地籍地址'],
  linear_reference: ['Linear reference', '線性參照', '线性参照'],
  built: ['Built place', '建成場所', '建成场所'],
  structure: ['Other structure', '其他構築物', '其他构筑物'],
  landform: ['Landform', '地形', '地形'],
  coastal_feature: ['Coastal feature', '海岸地物', '海岸地物'],
  water_feature: ['Water feature', '水域地物', '水域地物'],
  building_part: ['Building part', '建築物內部或部分', '建筑物内部或部分'],
  building: ['Building', '建築物', '建筑物'],
  premises: ['Premises', '園區或綜合場所', '园区或综合场所'],
  infrastructure: ['Infrastructure', '基建設施', '基础设施'],
  street: ['Thoroughfare', '道路／通道', '道路／通道'],
  address: ['Address', '地址', '地址'],
  establishment: ['Establishment', '商戶或場所', '商户或场所'],
  natural: [
    'Geographic feature (class unknown)',
    '地理地物（類別未知）',
    '地理地物（类别未知）',
  ],
} as const
const examples = {
  service_point: [
    'Recycling, collection or drinking-water point',
    '回收點、收集點或飲水點',
    '回收点、收集点或饮水点',
  ],
  premises_address: [
    'Street and number, village house or named premises',
    '街道門牌、村屋或具名處所',
    '街道门牌、村屋或具名处所',
  ],
  cadastral_address: [
    'Lot, section or subsection reference',
    '地段、分段或小分段編號',
    '地段、分段或小分段编号',
  ],
  linear_reference: [
    'A measured position along a road, railway or path',
    '沿道路、鐵路或路徑量度的位置',
    '沿道路、铁路或路径量度的位置',
  ],
  built: ['Built place', '建成場所', '建成场所'],
  structure: ['Other structure', '其他構築物', '其他构筑物'],
  landform: ['Landform', '地形', '地形'],
  coastal_feature: ['Coastal feature', '海岸地物', '海岸地物'],
  water_feature: ['Water feature', '水域地物', '水域地物'],
  building_part: [
    'Shop space, lobby, floor, wing or room',
    '店舖空間、大堂、樓層、翼樓或房間',
    '店铺空间、大堂、楼层、翼楼或房间',
  ],
  building: ['House, tower or bunker', '房屋、大廈或地堡', '房屋、大厦或地堡'],
  premises: [
    'Park, estate, campus or car park',
    '公園、屋苑、校園或停車場',
    '公园、小区、校园或停车场',
  ],
  infrastructure: [
    'Tunnel, retaining wall or footbridge',
    '隧道、擋土牆或行人天橋',
    '隧道、挡土墙或人行天桥',
  ],
  street: [
    'Road, lane or pedestrian street',
    '道路、小巷或步行街',
    '道路、小巷或步行街',
  ],
  address: [
    'A known address without an identified place',
    '尚未識別場所的已知地址',
    '尚未识别场所的已知地址',
  ],
  establishment: [
    'Bookstore, bakery or community venue',
    '書店、麵包店或社區場所',
    '书店、面包店或社区场所',
  ],
  natural: ['Hill, river or beach', '山丘、河流或海灘', '山丘、河流或海滩'],
} as const
/** Describe authoring intent in the current interface locale. @param context Physical/entity context. @returns User-facing label. */
export function targetContextLabel(context: TargetContext): string {
  return labels[context][
    getLocaleKey() === 'zhHant' ? 1 : getLocaleKey() === 'zhHans' ? 2 : 0
  ]
}
/** Illustrate the intended location without implying an upstream record exists. @param context Selected context. @returns Localized examples. */
export function targetContextExamples(context: TargetContext): string {
  return examples[context][
    getLocaleKey() === 'zhHant' ? 1 : getLocaleKey() === 'zhHans' ? 2 : 0
  ]
}
