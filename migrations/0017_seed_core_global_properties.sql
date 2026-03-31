INSERT INTO "property" (
  "id",
  "projectId",
  "hubId",
  "scope",
  "type",
  "key",
  "isTranslatable",
  "rank",
  "component",
  "min",
  "max",
  "isUserContributable",
  "isDefaultEnabled",
  "createdAt",
  "modifiedAt"
)
VALUES
  (
    'gPropGrade01',
    NULL,
    (SELECT "id" FROM "hub" WHERE "code" = 'core'),
    'global',
    'classifier',
    'grade',
    false,
    0,
    'RangeField',
    1,
    5,
    true,
    true,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'gPropMtrSt01',
    NULL,
    (SELECT "id" FROM "hub" WHERE "code" = 'core'),
    'global',
    'classifier',
    'nearestMtrStation',
    true,
    1,
    'SelectField',
    NULL,
    NULL,
    true,
    true,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'gPropPhNum01',
    NULL,
    (SELECT "id" FROM "hub" WHERE "code" = 'core'),
    'global',
    'specifier',
    'phoneNumber',
    false,
    2,
    'InputField',
    NULL,
    NULL,
    true,
    false,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'gPropWaNum01',
    NULL,
    (SELECT "id" FROM "hub" WHERE "code" = 'core'),
    'global',
    'specifier',
    'whatsappNumber',
    false,
    3,
    'InputField',
    NULL,
    NULL,
    true,
    false,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );

INSERT INTO "propertyI18n" (
  "propertyId",
  "locale",
  "label",
  "labelGen",
  "placeholder",
  "placeholderGen"
)
VALUES
  ('gPropGrade01', 'en', 'Grade', false, 'Select grade', false),
  ('gPropGrade01', 'zh-hans', '等级', true, '选择等级', true),
  ('gPropGrade01', 'zh-hant', '等級', true, '選擇等級', true),
  ('gPropMtrSt01', 'en', 'Nearest MTR Station', false, 'Select MTR station', false),
  ('gPropMtrSt01', 'zh-hans', '最近港铁站', true, '选择最近港铁站', true),
  ('gPropMtrSt01', 'zh-hant', '最近港鐵站', true, '選擇最近港鐵站', true),
  ('gPropPhNum01', 'en', 'Phone Number', false, 'Enter phone number', false),
  ('gPropPhNum01', 'zh-hans', '电话号码', true, '输入电话号码', false),
  ('gPropPhNum01', 'zh-hant', '電話號碼', true, '輸入電話號碼', true),
  ('gPropWaNum01', 'en', 'WhatsApp Number', false, 'Enter WhatsApp number', false),
  ('gPropWaNum01', 'zh-hans', 'WhatsApp号码', true, '输入WhatsApp号码', true),
  ('gPropWaNum01', 'zh-hant', 'WhatsApp號碼', true, '輸入WhatsApp號碼', true);

WITH station_values("id", "rank") AS (
  VALUES
    ('pvmtr0000001', 0),
    ('pvmtr0000002', 1),
    ('pvmtr0000003', 2),
    ('pvmtr0000004', 3),
    ('pvmtr0000005', 4),
    ('pvmtr0000006', 5),
    ('pvmtr0000007', 6),
    ('pvmtr0000008', 7),
    ('pvmtr0000009', 8),
    ('pvmtr0000010', 9),
    ('pvmtr0000011', 10),
    ('pvmtr0000012', 11),
    ('pvmtr0000013', 12),
    ('pvmtr0000014', 13),
    ('pvmtr0000015', 14),
    ('pvmtr0000016', 15),
    ('pvmtr0000017', 16),
    ('pvmtr0000018', 17),
    ('pvmtr0000019', 18),
    ('pvmtr0000020', 19),
    ('pvmtr0000021', 20),
    ('pvmtr0000022', 21),
    ('pvmtr0000023', 22),
    ('pvmtr0000024', 23),
    ('pvmtr0000025', 24),
    ('pvmtr0000026', 25),
    ('pvmtr0000027', 26),
    ('pvmtr0000028', 27),
    ('pvmtr0000029', 28),
    ('pvmtr0000030', 29),
    ('pvmtr0000031', 30),
    ('pvmtr0000032', 31),
    ('pvmtr0000033', 32),
    ('pvmtr0000034', 33),
    ('pvmtr0000035', 34),
    ('pvmtr0000036', 35),
    ('pvmtr0000037', 36),
    ('pvmtr0000038', 37),
    ('pvmtr0000039', 38),
    ('pvmtr0000040', 39),
    ('pvmtr0000041', 40),
    ('pvmtr0000042', 41),
    ('pvmtr0000043', 42),
    ('pvmtr0000044', 43),
    ('pvmtr0000045', 44),
    ('pvmtr0000046', 45),
    ('pvmtr0000047', 46),
    ('pvmtr0000048', 47),
    ('pvmtr0000049', 48),
    ('pvmtr0000050', 49),
    ('pvmtr0000051', 50),
    ('pvmtr0000052', 51),
    ('pvmtr0000053', 52),
    ('pvmtr0000054', 53),
    ('pvmtr0000055', 54),
    ('pvmtr0000056', 55),
    ('pvmtr0000057', 56),
    ('pvmtr0000058', 57),
    ('pvmtr0000059', 58),
    ('pvmtr0000060', 59),
    ('pvmtr0000061', 60),
    ('pvmtr0000062', 61),
    ('pvmtr0000063', 62),
    ('pvmtr0000064', 63),
    ('pvmtr0000065', 64),
    ('pvmtr0000066', 65),
    ('pvmtr0000067', 66),
    ('pvmtr0000068', 67),
    ('pvmtr0000069', 68),
    ('pvmtr0000070', 69),
    ('pvmtr0000071', 70),
    ('pvmtr0000072', 71),
    ('pvmtr0000073', 72),
    ('pvmtr0000074', 73),
    ('pvmtr0000075', 74),
    ('pvmtr0000076', 75),
    ('pvmtr0000077', 76),
    ('pvmtr0000078', 77),
    ('pvmtr0000079', 78),
    ('pvmtr0000080', 79),
    ('pvmtr0000081', 80),
    ('pvmtr0000082', 81),
    ('pvmtr0000083', 82),
    ('pvmtr0000084', 83),
    ('pvmtr0000085', 84),
    ('pvmtr0000086', 85),
    ('pvmtr0000087', 86),
    ('pvmtr0000088', 87),
    ('pvmtr0000089', 88),
    ('pvmtr0000090', 89),
    ('pvmtr0000091', 90),
    ('pvmtr0000092', 91),
    ('pvmtr0000093', 92),
    ('pvmtr0000094', 93),
    ('pvmtr0000095', 94),
    ('pvmtr0000096', 95),
    ('pvmtr0000097', 96),
    ('pvmtr0000098', 97),
    ('pvmtr0000099', 98)
)
INSERT INTO "propertyValue" ("id", "propertyId", "rank")
SELECT "id", 'gPropMtrSt01', "rank"
FROM station_values;

WITH station_values("id", "value_en", "value_zh_hant", "value_zh_hans") AS (
  VALUES
    ('pvmtr0000001', 'Admiralty', '金鐘', '金钟'),
    ('pvmtr0000002', 'Airport', '機場', '机场'),
    ('pvmtr0000003', 'AsiaWorld-Expo', '博覽館', '博览馆'),
    ('pvmtr0000004', 'Austin', '柯士甸', '柯士甸'),
    ('pvmtr0000005', 'Causeway Bay', '銅鑼灣', '铜锣湾'),
    ('pvmtr0000006', 'Central', '中環', '中环'),
    ('pvmtr0000007', 'Chai Wan', '柴灣', '柴湾'),
    ('pvmtr0000008', 'Che Kung Temple', '車公廟', '车公庙'),
    ('pvmtr0000009', 'Cheung Sha Wan', '長沙灣', '长沙湾'),
    ('pvmtr0000010', 'Choi Hung', '彩虹', '彩虹'),
    ('pvmtr0000011', 'City One', '第一城', '第一城'),
    ('pvmtr0000012', 'Diamond Hill', '鑽石山', '钻石山'),
    ('pvmtr0000013', 'Disneyland Resort', '迪士尼', '迪士尼'),
    ('pvmtr0000014', 'East Tsim Sha Tsui', '尖東', '尖东'),
    ('pvmtr0000015', 'Exhibition Centre', '會展', '会展'),
    ('pvmtr0000016', 'Fanling', '粉嶺', '粉岭'),
    ('pvmtr0000017', 'Fo Tan', '火炭', '火炭'),
    ('pvmtr0000018', 'Fortress Hill', '炮台山', '炮台山'),
    ('pvmtr0000019', 'Hang Hau', '坑口', '坑口'),
    ('pvmtr0000020', 'Heng Fa Chuen', '杏花邨', '杏花邨'),
    ('pvmtr0000021', 'Heng On', '恆安', '恒安'),
    ('pvmtr0000022', 'Hin Keng', '顯徑', '显径'),
    ('pvmtr0000023', 'HKU', '香港大學', '香港大学'),
    ('pvmtr0000024', 'Ho Man Tin', '何文田', '何文田'),
    ('pvmtr0000025', 'Hong Kong', '香港', '香港'),
    ('pvmtr0000026', 'Hung Hom', '紅磡', '红磡'),
    ('pvmtr0000027', 'Jordan', '佐敦', '佐敦'),
    ('pvmtr0000028', 'Kai Tak', '啟德', '启德'),
    ('pvmtr0000029', 'Kam Sheung Road', '錦上路', '锦上路'),
    ('pvmtr0000030', 'Kennedy Town', '堅尼地城', '坚尼地城'),
    ('pvmtr0000031', 'Kowloon', '九龍', '九龙'),
    ('pvmtr0000032', 'Kowloon Bay', '九龍灣', '九龙湾'),
    ('pvmtr0000033', 'Kowloon Tong', '九龍塘', '九龙塘'),
    ('pvmtr0000034', 'Kwai Fong', '葵芳', '葵芳'),
    ('pvmtr0000035', 'Kwai Hing', '葵興', '葵兴'),
    ('pvmtr0000036', 'Kwun Tong', '觀塘', '观塘'),
    ('pvmtr0000037', 'Lai Chi Kok', '荔枝角', '荔枝角'),
    ('pvmtr0000038', 'Lai King', '荔景', '荔景'),
    ('pvmtr0000039', 'Lam Tin', '藍田', '蓝田'),
    ('pvmtr0000040', 'Lei Tung', '利東', '利东'),
    ('pvmtr0000041', 'LOHAS Park', '康城', '康城'),
    ('pvmtr0000042', 'Lok Fu', '樂富', '乐富'),
    ('pvmtr0000043', 'Lok Ma Chau', '落馬洲', '落马洲'),
    ('pvmtr0000044', 'Lo Wu', '羅湖', '罗湖'),
    ('pvmtr0000045', 'Long Ping', '朗屏', '朗屏'),
    ('pvmtr0000046', 'Ma On Shan', '馬鞍山', '马鞍山'),
    ('pvmtr0000047', 'Mei Foo', '美孚', '美孚'),
    ('pvmtr0000048', 'Mong Kok', '旺角', '旺角'),
    ('pvmtr0000049', 'Mong Kok East', '旺角東', '旺角东'),
    ('pvmtr0000050', 'Nam Cheong', '南昌', '南昌'),
    ('pvmtr0000051', 'Ngau Tau Kok', '牛頭角', '牛头角'),
    ('pvmtr0000052', 'North Point', '北角', '北角'),
    ('pvmtr0000053', 'Ocean Park', '海洋公園', '海洋公园'),
    ('pvmtr0000054', 'Olympic', '奧運', '奥运'),
    ('pvmtr0000055', 'Po Lam', '寶琳', '宝琳'),
    ('pvmtr0000056', 'Prince Edward', '太子', '太子'),
    ('pvmtr0000057', 'Quarry Bay', '鰂魚涌', '鲗鱼涌'),
    ('pvmtr0000058', 'Racecourse', '馬場', '马场'),
    ('pvmtr0000059', 'Sai Wan Ho', '西灣河', '西湾河'),
    ('pvmtr0000060', 'Sai Ying Pun', '西營盤', '西营盘'),
    ('pvmtr0000061', 'Sham Shui Po', '深水埗', '深水埗'),
    ('pvmtr0000062', 'Sha Tin', '沙田', '沙田'),
    ('pvmtr0000063', 'Sha Tin Wai', '沙田圍', '沙田围'),
    ('pvmtr0000064', 'Shau Kei Wan', '筲箕灣', '筲箕湾'),
    ('pvmtr0000065', 'Shek Kip Mei', '石硤尾', '石硖尾'),
    ('pvmtr0000066', 'Shek Mun', '石門', '石门'),
    ('pvmtr0000067', 'Sheung Shui', '上水', '上水'),
    ('pvmtr0000068', 'Sheung Wan', '上環', '上环'),
    ('pvmtr0000069', 'Siu Hong', '兆康', '兆康'),
    ('pvmtr0000070', 'South Horizons', '海怡半島', '海怡半岛'),
    ('pvmtr0000071', 'Sung Wong Toi', '宋皇臺', '宋皇台'),
    ('pvmtr0000072', 'Sunny Bay', '欣澳', '欣澳'),
    ('pvmtr0000073', 'Tai Koo', '太古', '太古'),
    ('pvmtr0000074', 'Tai Po Market', '大埔墟', '大埔墟'),
    ('pvmtr0000075', 'Tai Shui Hang', '大水坑', '大水坑'),
    ('pvmtr0000076', 'Tai Wai', '大圍', '大围'),
    ('pvmtr0000077', 'Tai Wo', '太和', '太和'),
    ('pvmtr0000078', 'Tai Wo Hau', '大窩口', '大窝口'),
    ('pvmtr0000079', 'Tamar', '添馬', '添马'),
    ('pvmtr0000080', 'Tin Hau', '天后', '天后'),
    ('pvmtr0000081', 'Tin Shui Wai', '天水圍', '天水围'),
    ('pvmtr0000082', 'Tiu Keng Leng', '調景嶺', '调景岭'),
    ('pvmtr0000083', 'To Kwa Wan', '土瓜灣', '土瓜湾'),
    ('pvmtr0000084', 'Tsim Sha Tsui', '尖沙咀', '尖沙咀'),
    ('pvmtr0000085', 'Tsing Yi', '青衣', '青衣'),
    ('pvmtr0000086', 'Tsuen Wan', '荃灣', '荃湾'),
    ('pvmtr0000087', 'Tsuen Wan West', '荃灣西', '荃湾西'),
    ('pvmtr0000088', 'Tseung Kwan O', '將軍澳', '将军澳'),
    ('pvmtr0000089', 'Tuen Mun', '屯門', '屯门'),
    ('pvmtr0000090', 'Tung Chung', '東涌', '东涌'),
    ('pvmtr0000091', 'University', '大學', '大学'),
    ('pvmtr0000092', 'Wan Chai', '灣仔', '湾仔'),
    ('pvmtr0000093', 'Whampoa', '黃埔', '黄埔'),
    ('pvmtr0000094', 'Wong Chuk Hang', '黃竹坑', '黄竹坑'),
    ('pvmtr0000095', 'Wong Tai Sin', '黃大仙', '黄大仙'),
    ('pvmtr0000096', 'Wu Kai Sha', '烏溪沙', '乌溪沙'),
    ('pvmtr0000097', 'Yau Ma Tei', '油麻地', '油麻地'),
    ('pvmtr0000098', 'Yau Tong', '油塘', '油塘'),
    ('pvmtr0000099', 'Yuen Long', '元朗', '元朗')
), locales("locale") AS (
  VALUES ('en'), ('zh-hans'), ('zh-hant')
)
INSERT INTO "propertyValueI18n" (
  "propertyValueId",
  "locale",
  "value",
  "valueGen"
)
SELECT
  station_values."id",
  locales."locale",
  CASE
    WHEN locales."locale" = 'en' THEN station_values."value_en"
    WHEN locales."locale" = 'zh-hant' THEN station_values."value_zh_hant"
    WHEN locales."locale" = 'zh-hans' THEN station_values."value_zh_hans"
  END,
  false
FROM station_values
CROSS JOIN locales;

WITH target_properties AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "rank", "key") - 1 AS "rankOffset"
  FROM "property"
  WHERE "id" IN (
    'gPropGrade01',
    'gPropMtrSt01',
    'gPropPhNum01',
    'gPropWaNum01'
  )
),
project_existing_ranks AS (
  SELECT "projectId", "rank"
  FROM "property"
  WHERE "scope" = 'project' AND "projectId" IS NOT NULL
  UNION ALL
  SELECT "projectId", "rank"
  FROM "projectProperty"
),
project_max_rank AS (
  SELECT
    "project"."id" AS "projectId",
    COALESCE(MAX(project_existing_ranks."rank"), -1) AS "maxRank"
  FROM "project"
  LEFT JOIN project_existing_ranks
    ON project_existing_ranks."projectId" = "project"."id"
  GROUP BY "project"."id"
)
INSERT INTO "projectProperty" ("projectId", "propertyId", "rank")
SELECT
  project_max_rank."projectId",
  target_properties."id",
  project_max_rank."maxRank" + 1 + target_properties."rankOffset"
FROM project_max_rank
CROSS JOIN target_properties
WHERE NOT EXISTS (
  SELECT 1
  FROM "projectProperty"
  WHERE "projectProperty"."projectId" = project_max_rank."projectId"
    AND "projectProperty"."propertyId" = target_properties."id"
);
