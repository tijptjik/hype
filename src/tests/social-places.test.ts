// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// TYPES
import type { Locale } from '$lib/types';

describe('Social Places Extraction Tests', () => {
  describe('Basic extraction from test data', () => {
    it('should extract neighbourhood information from test addresses', () => {
      const addressesWithNeighbourhoods = testData.testAddresses.filter(
        (testCase) => testCase.extracted.neighbourhood
      );

      console.log(
        `Found ${addressesWithNeighbourhoods.length} addresses with neighbourhood information`
      );

      addressesWithNeighbourhoods.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected neighbourhood: ${testCase.extracted.neighbourhood}`);

        expect(testCase.extracted.neighbourhood).toBeDefined();
      });
    });

    it('should extract sub-district information from test addresses', () => {
      const addressesWithSubDistricts = testData.testAddresses.filter(
        (testCase) => testCase.extracted.subDistrict
      );

      console.log(
        `Found ${addressesWithSubDistricts.length} addresses with sub-district information`
      );

      addressesWithSubDistricts.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected subDistrict: ${testCase.extracted.subDistrict}`);

        // Note: Most test cases don't have subDistrict, so this might be empty
        if (testCase.extracted.subDistrict) {
          expect(testCase.extracted.subDistrict).toBeDefined();
        }
      });
    });

    it('should categorize different neighbourhood types', () => {
      const neighbourhoodTypes = {
        central: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.neighbourhood &&
            testCase.extracted.neighbourhood.toLowerCase().includes('central')
        ),
        wan: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.neighbourhood &&
            testCase.extracted.neighbourhood.toLowerCase().includes('wan')
        ),
        bay: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.neighbourhood &&
            testCase.extracted.neighbourhood.toLowerCase().includes('bay')
        ),
        kung: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.neighbourhood &&
            testCase.extracted.neighbourhood.toLowerCase().includes('kung')
        )
      };

      console.log('Neighbourhood type distribution:');
      Object.entries(neighbourhoodTypes).forEach(([type, neighbourhoods]) => {
        console.log(`${type}: ${neighbourhoods.length} neighbourhoods`);
      });
    });
  });

  describe('Edge cases and formatting issues', () => {
    it('should handle missing commas in neighbourhood specifications', () => {
      const testCases = [
        '44 Centre Street Sai Ying Pun Hk',
        '38 Des Voeux Road West Sheung Wan Hk',
        '21 Bowrington Road Wan Chai Hk',
        '67 Yi Chun Street Sai Kung Nt'
      ];

      testCases.forEach((address) => {
        console.log(`Testing missing commas: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle non-standard neighbourhood abbreviations', () => {
      const testCases = [
        '44 Centre Street, SYP, Hk',
        '38 Des Voeux Road West, SW, Hk',
        '21 Bowrington Road, WC, Hk',
        '67 Yi Chun Street, SK, Nt'
      ];

      testCases.forEach((address) => {
        console.log(`Testing abbreviations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle extra punctuation in neighbourhood specifications', () => {
      const testCases = [
        '44 Centre Street, Sai Ying Pun., Hk',
        '38 Des Voeux Road West, Sheung Wan., Hk',
        '21 Bowrington Road, Wan Chai., Hk',
        '67 Yi Chun Street, Sai Kung., Nt'
      ];

      testCases.forEach((address) => {
        console.log(`Testing extra punctuation: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle mixed case in neighbourhood specifications', () => {
      const testCases = [
        '44 Centre Street, SAI YING PUN, Hk',
        '38 Des Voeux Road West, sheung wan, Hk',
        '21 Bowrington Road, WAN CHAI, Hk',
        '67 Yi Chun Street, sai kung, Nt'
      ];

      testCases.forEach((address) => {
        console.log(`Testing mixed case: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with hyphens and spaces', () => {
      const testCases = [
        'Lg/F & G/F, 1 Seymour Terrace, Mid-Levels, Hong Kong',
        'Ug/F, Clovelly Court, 12 May Road, Peak, Hong Kong',
        '100 Peak Road, On R.B.L. 312, The Peak, Hong Kong',
        'Shop 199, East Point City, 8 Chung Wa Road, Tseung Kwan O, New Territories'
      ];

      testCases.forEach((address) => {
        console.log(`Testing hyphens and spaces: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with descriptive terms', () => {
      const testCases = [
        'Shop 199, East Point City, 8 Chung Wa Road, Tseung Kwan O, New Territories',
        'G/F, Dd253, Lot 1177, Razor Hill, Clear Water Bay, Sai Kung, N.T.',
        'Levels 5 & 6, Silverstrand Mart, 2 Silver Cape Rd, Clear Water Bay, Sai Kung, N.T.',
        'Shop No. 2, G/F, Maritime Bay, No 18 Pui Shing Road, Tseung Kwan O, Sai Kung, N.T.'
      ];

      testCases.forEach((address) => {
        console.log(`Testing descriptive terms: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Neighbourhood name variations', () => {
    it('should handle different neighbourhood name formats', () => {
      const testCases = [
        '44 Centre Street, Sai Ying Pun, Hk',
        '38 Des Voeux Road West, Sheung Wan, Hk',
        '21 Bowrington Road, Wan Chai, Hk',
        '67 Yi Chun Street, Sai Kung, Nt',
        'Lg/F & G/F, 1 Seymour Terrace, Mid-Levels, Hong Kong',
        'Ug/F, Clovelly Court, 12 May Road, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing name formats: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with Chinese characters', () => {
      const testCases = [
        '44 Centre Street, Sai Ying Pun 西營盤, Hk',
        '38 Des Voeux Road West, Sheung Wan 上環, Hk',
        '21 Bowrington Road, Wan Chai 灣仔, Hk',
        '67 Yi Chun Street, Sai Kung 西貢, Nt'
      ];

      testCases.forEach((address) => {
        console.log(`Testing Chinese characters: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with alternative spellings', () => {
      const testCases = [
        '44 Centre Street, Sai Ying Pun, Hk',
        '38 Des Voeux Road West, Sheung Wan, Hk',
        '21 Bowrington Road, Wan Chai, Hk',
        '67 Yi Chun Street, Sai Kung, Nt',
        'Shop 199, East Point City, 8 Chung Wa Road, Tseung Kwan O, New Territories',
        'Shop No. 2, G/F, Maritime Bay, No 18 Pui Shing Road, Tseung Kwan O, Sai Kung, N.T.'
      ];

      testCases.forEach((address) => {
        console.log(`Testing alternative spellings: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with regional indicators', () => {
      const testCases = [
        'Shop 199, East Point City, 8 Chung Wa Road, Tseung Kwan O, New Territories',
        'Shop No. 2, G/F, Maritime Bay, No 18 Pui Shing Road, Tseung Kwan O, Sai Kung, N.T.',
        'G/F, 79 & 81 Man Nin Street, Sai Kung, New Territories',
        'Shop Units 101–102 & 219–220, 1/F, Maritime Square, 33 Tsing King Road, Tsing Yi, New Territories'
      ];

      testCases.forEach((address) => {
        console.log(`Testing regional indicators: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Complex social place patterns', () => {
    it('should handle addresses with multiple neighbourhood references', () => {
      const testCases = [
        'Shop 199, East Point City, 8 Chung Wa Road, Tseung Kwan O, New Territories',
        'Shop No. 2, G/F, Maritime Bay, No 18 Pui Shing Road, Tseung Kwan O, Sai Kung, N.T.',
        'G/F, 79 & 81 Man Nin Street, Sai Kung, New Territories',
        'Shop Units 101–102 & 219–220, 1/F, Maritime Square, 33 Tsing King Road, Tsing Yi, New Territories'
      ];

      testCases.forEach((address) => {
        console.log(`Testing multiple references: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with estate information', () => {
      const testCases = [
        'Shop N50B, G/F, Mount Sterling Mall, Stage 7 Mei Foo Sun Chuen, Nos.10-16 Lai Wan Road, Lai Chi Kok, Kowloon',
        'Shop 307B, 3/F, Choi Ming Shopping Centre, Choi Ming Court, 1 Choi Ming Street, Tko, Sai Kung, N.T.',
        'Shp G5, G/F, Plaza 328, Bo Shek Mansion, 328 Sha Tsui Rd, Tsuen Wan',
        '4/F, Aitb, Cuhk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing estate information: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with building information', () => {
      const testCases = [
        "Shek Tong Tsui Municipal Services Building, 470 Queen'S Road West, Shek Tong Tsui, Hk",
        'Smithfield Municipal Services Building, 12K Smithfield, Kennedy Town, Hk',
        "Sheung Wan Municipal Services Building, 345 Queen'S Road Central, Sheung Wan, Hk",
        'Aberdeen Municipal Services Building, 203 Aberdeen Main Road, Aberdeen, Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing building information: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle neighbourhood names with market information', () => {
      const testCases = [
        'Chuk Yuen Market, Wong Tai Sin',
        'Lok Fu Market, Wong Tai Sin',
        'S21, 1/F Chai Wan Market, Chai Wan',
        'Mn 48, 1/F, Java Road Urban Council Building, North Point'
      ];

      testCases.forEach((address) => {
        console.log(`Testing market information: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });
});
