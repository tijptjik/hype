import fs from 'fs';
import path from 'path';

type TranslationMap = Record<string, string>;

type TranslationSet = {
  areas: TranslationMap;
  districts: TranslationMap;
  neighbourhoods: TranslationMap;
};

type NeighbourhoodI18n = {
  name: string;
  neighbourhood: string;
  district: string;
  area: string;
};

type NeighbourhoodEntry = {
  i18n: {
    en?: NeighbourhoodI18n;
    zhHant?: NeighbourhoodI18n;
    zhHans?: NeighbourhoodI18n;
  };
};

type NeighbourhoodsFile = Record<string, NeighbourhoodEntry>;

// Translation mappings
const translations: { zhHant: TranslationSet } = {
  zhHant: {
    areas: {
      'Hong Kong Island': '香港島',
      Kowloon: '九龍',
      'New Territories': '新界'
    },
    districts: {
      Southern: '南區',
      'Wan Chai': '灣仔',
      'Central & Western': '中西區',
      Islands: '離島區',
      'Sham Shui Po': '深水埗',
      'Sai Kung': '西貢',
      'Kowloon City': '九龍城',
      'Yau Tsim Mong': '油尖旺',
      'Kwun Tong': '觀塘',
      Eastern: '東區',
      'Wong Tai Sin': '黃大仙',
      'Yuen Long': '元朗',
      'Sha Tin': '沙田',
      'Tsuen Wan': '荃灣',
      'Kwai Tsing': '葵青'
    },
    neighbourhoods: {
      Aberdeen: '香港仔',
      Bowrington: '寶靈頓',
      'Caroline Hill': '加路連山',
      'Causeway Bay': '銅鑼灣',
      Central: '中環',
      'Cheung Chau': '長洲',
      'Cheung Sha Wan': '長沙灣',
      'Clear Water Bay': '清水灣',
      'Happy Valley': '跑馬地',
      'Hung Hom': '紅磡',
      Jordan: '佐敦',
      'Kennedy Town': '堅尼地城',
      'Kowloon City': '九龍城',
      'Kwai Chung': '葵涌',
      'Kwun Chung': '官涌',
      'Kwun Tong': '觀塘',
      'Lo Lung Hang': '勞龍坑',
      'Ma Tau Chung': '馬頭涌',
      'Mong Kok': '旺角',
      'Ngau Tau Kok': '牛頭角',
      'North Point': '北角',
      'Ping Shan': '屏山',
      'Prince Edward': '太子',
      'Quarry Bay': '鰂魚涌',
      'Sai Kung': '西貢',
      'Sai Wan': '西環',
      'Sai Wan Ho': '西灣河',
      'Sai Ying Pun': '西營盤',
      'San Po Kong': '新蒲崗',
      'Sham Shui Po': '深水埗',
      'Sham Wan': '深灣',
      'Shap Pat Heung': '十八鄉',
      'Shau Kei Wan': '筲箕灣',
      'Shek Tong Tsui': '石塘咀',
      'Sheung Wan': '上環',
      'Tai Kok Tsui': '大角咀',
      'Tai Ping Shan': '太平山',
      'Tai Wai': '大圍',
      'Tin Hau': '天后',
      'Tin Wan': '田灣',
      'To Kwa Wan': '土瓜灣',
      'Tong Mi': '塘尾',
      'Tsim Sha Tsui': '尖沙咀',
      'Tsuen Wan': '荃灣',
      'Un Chau': '元州',
      'Wan Chai': '灣仔',
      'Waterfall Bay': '瀑布灣',
      'Yau Ma Tei': '油麻地',
      'Yuen Long': '元朗'
    }
  }
};

// Add Simplified Chinese translations by converting Traditional to Simplified
const zhHansTranslations: TranslationSet = {
  areas: {},
  districts: {},
  neighbourhoods: {}
};

// Function to convert Traditional to Simplified Chinese (simplified version)
function toSimplified(traditional: string): string {
  const simplificationMap: Record<string, string> = {
    區: '区',
    島: '岛',
    龍: '龙',
    灣: '湾',
    鑼: '锣',
    涌: '涌',
    環: '环',
    鰂: '鲗',
    崗: '岗',
    鄉: '乡',
    咀: '咀',
    關: '关'
    // Add more character mappings as needed
  };

  return traditional
    .split('')
    .map((char) => simplificationMap[char] || char)
    .join('');
}

// Generate Simplified Chinese translations
Object.entries(translations.zhHant.areas).forEach(([key, value]) => {
  zhHansTranslations.areas[key] = toSimplified(value);
});

Object.entries(translations.zhHant.districts).forEach(([key, value]) => {
  zhHansTranslations.districts[key] = toSimplified(value);
});

Object.entries(translations.zhHant.neighbourhoods).forEach(([key, value]) => {
  zhHansTranslations.neighbourhoods[key] = toSimplified(value);
});

// Read the existing neighbourhoods.json
const filePath = path.join(process.cwd(), 'src', 'lib', 'map', 'neighbourhoods.json');
const neighbourhoods: NeighbourhoodsFile = JSON.parse(
  fs.readFileSync(filePath, 'utf8')
);

// Update each neighbourhood with translations
Object.entries(neighbourhoods).forEach(([key, value]: [string, NeighbourhoodEntry]) => {
  const englishI18n = value.i18n.en;
  if (!englishI18n) return;

  value.i18n.zhHant = {
    name: translations.zhHant.neighbourhoods[key] || key,
    neighbourhood:
      translations.zhHant.neighbourhoods[englishI18n.neighbourhood] ||
      englishI18n.neighbourhood,
    district:
      translations.zhHant.districts[englishI18n.district] || englishI18n.district,
    area: translations.zhHant.areas[englishI18n.area] || englishI18n.area
  };

  value.i18n.zhHans = {
    name: zhHansTranslations.neighbourhoods[key] || key,
    neighbourhood:
      zhHansTranslations.neighbourhoods[englishI18n.neighbourhood] ||
      englishI18n.neighbourhood,
    district:
      zhHansTranslations.districts[englishI18n.district] || englishI18n.district,
    area: zhHansTranslations.areas[englishI18n.area] || englishI18n.area
  };
});

// Write the updated JSON back to file
fs.writeFileSync(filePath, JSON.stringify(neighbourhoods, null, 2));
console.info('Neighborhoods file updated successfully!');
