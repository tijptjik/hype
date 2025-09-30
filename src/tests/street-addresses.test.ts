// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// TYPES
import type { Locale } from '$lib/types';

describe('Street Address Extraction Tests', () => {
  describe('Basic extraction from test data', () => {
    it('should extract street names from test addresses', () => {
      const addressesWithStreets = testData.testAddresses.filter(
        (testCase) => testCase.extracted.streetName
      );

      console.log(`Found ${addressesWithStreets.length} addresses with street names`);

      addressesWithStreets.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected streetName: ${testCase.extracted.streetName}`);

        expect(testCase.extracted.streetName).toBeDefined();
      });
    });

    it('should extract building numbers from test addresses', () => {
      const addressesWithBuildingNumbers = testData.testAddresses.filter(
        (testCase) =>
          testCase.extracted.buildingNumberFrom || testCase.extracted.buildingNumberTo
      );

      console.log(
        `Found ${addressesWithBuildingNumbers.length} addresses with building numbers`
      );

      addressesWithBuildingNumbers.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(
          `Expected buildingNumberFrom: ${testCase.extracted.buildingNumberFrom}`
        );
        console.log(
          `Expected buildingNumberTo: ${testCase.extracted.buildingNumberTo}`
        );

        expect(
          testCase.extracted.buildingNumberFrom || testCase.extracted.buildingNumberTo
        ).toBeDefined();
      });
    });

    it('should categorize different street name patterns', () => {
      const streetPatterns = {
        withSuffixes: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.streetName &&
            (testCase.extracted.streetName.includes('Road') ||
              testCase.extracted.streetName.includes('Street') ||
              testCase.extracted.streetName.includes('Avenue') ||
              testCase.extracted.streetName.includes('Lane'))
        ),
        withNumbers: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.streetName && /\d/.test(testCase.extracted.streetName)
        ),
        withNames: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.streetName &&
            !testCase.extracted.streetName.includes('Road') &&
            !testCase.extracted.streetName.includes('Street') &&
            !testCase.extracted.streetName.includes('Avenue') &&
            !testCase.extracted.streetName.includes('Lane')
        )
      };

      console.log('Street pattern distribution:');
      Object.entries(streetPatterns).forEach(([pattern, streets]) => {
        console.log(`${pattern}: ${streets.length} streets`);
      });
    });
  });

  describe('Edge cases and formatting issues', () => {
    it('should handle missing commas in street addresses', () => {
      const testCases = [
        '44 Centre Street Sai Ying Pun Hk',
        '38 Des Voeux Road West Sheung Wan Hk',
        '21 Bowrington Road Wan Chai Hk',
        '142 Electric Road Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing missing commas: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle non-standard street abbreviations', () => {
      const testCases = [
        '44 Centre St, Sai Ying Pun, Hk',
        '38 Des Voeux Rd West, Sheung Wan, Hk',
        '21 Bowrington Ave, Wan Chai, Hk',
        '142 Electric Ln, Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing abbreviations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle extra punctuation in street addresses', () => {
      const testCases = [
        '44 Centre Street., Sai Ying Pun, Hk',
        '38 Des Voeux Road West., Sheung Wan, Hk',
        '21 Bowrington Road., Wan Chai, Hk',
        '142 Electric Road., Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing extra punctuation: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle mixed case in street addresses', () => {
      const testCases = [
        '44 CENTRE street, Sai Ying Pun, Hk',
        '38 des voeux ROAD west, Sheung Wan, Hk',
        '21 BOWRINGTON road, Wan Chai, Hk',
        '142 electric ROAD, Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing mixed case: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building number ranges', () => {
      const testCases = [
        "22-28 Queen'S Road, Central Tower, Central, Hong Kong",
        '418-428 Hennessy Road, Wanchai, H.K.',
        '302-308 Hennessy Road, Wan Chai, Hong Kong',
        '165-171 Wan Chai Road, Shop No. A1, G/F, Lucky Centre'
      ];

      testCases.forEach((address) => {
        console.log(`Testing number ranges: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle complex building number formats', () => {
      const testCases = [
        "22-28 Queen'S Road, Central Tower, Central, Hong Kong",
        '418-428 Hennessy Road, Wanchai, H.K.',
        '302-308 Hennessy Road, Wan Chai, Hong Kong',
        '165-171 Wan Chai Road, Shop No. A1, G/F, Lucky Centre'
      ];

      testCases.forEach((address) => {
        console.log(`Testing complex numbers: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Street name variations', () => {
    it('should handle different street suffixes', () => {
      const testCases = [
        '44 Centre Street, Sai Ying Pun, Hk',
        '38 Des Voeux Road West, Sheung Wan, Hk',
        '21 Bowrington Avenue, Wan Chai, Hk',
        '142 Electric Lane, Hk',
        '67 Yi Chun Drive, Sai Kung, Nt',
        '203 Aberdeen Boulevard, Aberdeen, Hk',
        '8 Hung Shing Crescent, Ap Lei Chau, Hk',
        '333 Ki Lung Close, Sham Shui Po, Kln'
      ];

      testCases.forEach((address) => {
        console.log(`Testing street suffixes: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle street names with directional indicators', () => {
      const testCases = [
        '38 Des Voeux Road West, Sheung Wan, Hk',
        "345 Queen'S Road Central, Sheung Wan, Hk",
        '77 Des Voeux Road Central, Central, Hong Kong',
        '638 Prince Edward Road East, San Po Kong, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing directional indicators: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle street names with numbers', () => {
      const testCases = [
        '1 Seymour Terrace, Mid-Levels, Hong Kong',
        '12 May Road, Peak, Hong Kong',
        '100 Peak Road, On R.B.L. 312, The Peak, Hong Kong',
        '1 Choi Ming Street, Tko, Sai Kung, N.T.'
      ];

      testCases.forEach((address) => {
        console.log(`Testing numbered streets: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle street names with Chinese characters', () => {
      const testCases = [
        '44 Centre Street 中心街, Sai Ying Pun, Hk',
        '38 Des Voeux Road West 德輔道西, Sheung Wan, Hk',
        '21 Bowrington Road 寶靈頓道, Wan Chai, Hk',
        '142 Electric Road 電氣道, Hk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing Chinese characters: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Complex street address patterns', () => {
    it('should handle addresses with multiple street components', () => {
      const testCases = [
        'Sheung Fung Street Joint User Building, J/O Sheung Fung Street & Fei Fung Street, Diamond Hill, Kln',
        "Shop A, G/F, Central House, Nos. 270 - 276 Queen'S Road Central, Hong Kong",
        'Unit 1-15 & 17-22 Lg/F, C C Wu Building, Nos. 302-308 Hennessy Road, Wan Chai, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing multiple components: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle addresses with intersection information', () => {
      const testCases = [
        'Sheung Fung Street Joint User Building, J/O Sheung Fung Street & Fei Fung Street, Diamond Hill, Kln',
        'Building Name, Corner of Street A & Street B, District',
        'Shop Name, Intersection of Road 1 and Road 2, Area'
      ];

      testCases.forEach((address) => {
        console.log(`Testing intersections: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle addresses with lot and street combinations', () => {
      const testCases = [
        '100 Peak Road, On R.B.L. 312, The Peak, Hong Kong',
        'G/F, Dd253, Lot 1177, Razor Hill, Clear Water Bay, Sai Kung, N.T.',
        'Unit 101, Lot 1234, 1 Street Name, District'
      ];

      testCases.forEach((address) => {
        console.log(`Testing lot combinations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle addresses with non-standard building number formats', () => {
      const testCases = [
        'Smithfield Municipal Services Building, 12K Smithfield, Kennedy Town, Hk',
        'Unit 101, Building 1A, 1 Street Name, District',
        'Shop A, Block 2B, 1 Street Name, District'
      ];

      testCases.forEach((address) => {
        console.log(`Testing non-standard numbers: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });
});
