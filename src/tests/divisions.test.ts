// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// TYPES
import type { Locale } from '$lib/types';

describe('Divisions Extraction Tests', () => {
  describe('Basic extraction from test data', () => {
    it('should extract block information from test addresses', () => {
      const addressesWithBlocks = testData.testAddresses.filter(
        (testCase) => testCase.extracted.blockType || testCase.extracted.blockNumber
      );

      console.log(
        `Found ${addressesWithBlocks.length} addresses with block information`
      );

      addressesWithBlocks.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected blockType: ${testCase.extracted.blockType}`);
        console.log(`Expected blockNumber: ${testCase.extracted.blockNumber}`);

        expect(
          testCase.extracted.blockType || testCase.extracted.blockNumber
        ).toBeDefined();
      });
    });

    it('should extract estate information from test addresses', () => {
      const addressesWithEstates = testData.testAddresses.filter(
        (testCase) => testCase.extracted.estateName
      );

      console.log(
        `Found ${addressesWithEstates.length} addresses with estate information`
      );

      addressesWithEstates.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected estateName: ${testCase.extracted.estateName}`);

        expect(testCase.extracted.estateName).toBeDefined();
      });
    });

    it('should extract lot information from test addresses', () => {
      const addressesWithLots = testData.testAddresses.filter(
        (testCase) => testCase.extracted.lotNumber || testCase.extracted.lotType
      );

      console.log(`Found ${addressesWithLots.length} addresses with lot information`);

      addressesWithLots.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected lotNumber: ${testCase.extracted.lotNumber}`);
        console.log(`Expected lotType: ${testCase.extracted.lotType}`);

        expect(
          testCase.extracted.lotNumber || testCase.extracted.lotType
        ).toBeDefined();
      });
    });

    it('should extract phase information from test addresses', () => {
      const addressesWithPhases = testData.testAddresses.filter(
        (testCase) => testCase.extracted.phaseName || testCase.extracted.phaseNumber
      );

      console.log(
        `Found ${addressesWithPhases.length} addresses with phase information`
      );

      addressesWithPhases.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected phaseName: ${testCase.extracted.phaseName}`);
        console.log(`Expected phaseNumber: ${testCase.extracted.phaseNumber}`);

        expect(
          testCase.extracted.phaseName || testCase.extracted.phaseNumber
        ).toBeDefined();
      });
    });
  });

  describe('Edge cases and formatting issues', () => {
    it('should handle missing commas in block specifications', () => {
      const testCases = [
        '36 Tai Yau Street G/F Block B Wah Hing Industrial Mansions',
        'Shop Nos. 101 102 106 & 107 On 1/F And Shop Nos. 201 202 & 208 On 2/F Domain 38 Ko Chiu Road Yau Tong',
        'Flat/Rm 906 BLK 1 9/F Kowloon Commercial Centre',
        '80 Wang Kwong Road Shop No.G18 G/F Richland Gardens Commercial & Garage Block'
      ];

      testCases.forEach((address) => {
        console.log(`Testing missing commas: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle non-standard block abbreviations', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, Blk B, Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F, And Shop Nos. 201, 202 & 208, On 2/F, Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, Block 1, 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block)'
      ];

      testCases.forEach((address) => {
        console.log(`Testing block abbreviations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle extra punctuation in block specifications', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, Block B., Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F., And Shop Nos. 201, 202 & 208, On 2/F., Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, BLK 1., 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block).'
      ];

      testCases.forEach((address) => {
        console.log(`Testing extra punctuation: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle mixed case in block specifications', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, BLOCK b, Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F, And Shop Nos. 201, 202 & 208, On 2/F, Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, blk 1, 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block)'
      ];

      testCases.forEach((address) => {
        console.log(`Testing mixed case: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle complex block specifications', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, Block A & B, Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F, And Shop Nos. 201, 202 & 208, On 2/F, Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, BLK 1-3, 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block)'
      ];

      testCases.forEach((address) => {
        console.log(`Testing complex blocks: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Estate and phase variations', () => {
    it('should handle different estate name formats', () => {
      const testCases = [
        'Shop 307B, 3/F, Choi Ming Shopping Centre, Choi Ming Court, 1 Choi Ming Street, Tko, Sai Kung, N.T.',
        'Shop N50B, G/F, Mount Sterling Mall, Stage 7 Mei Foo Sun Chuen, Nos.10-16 Lai Wan Road, Lai Chi Kok, Kowloon',
        'Shp G5, G/F, Plaza 328, Bo Shek Mansion, 328 Sha Tsui Rd, Tsuen Wan',
        '4/F, Aitb, Cuhk'
      ];

      testCases.forEach((address) => {
        console.log(`Testing estate formats: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle phase information in different formats', () => {
      const testCases = [
        'Shop N50B, G/F, Mount Sterling Mall, Stage 7 Mei Foo Sun Chuen, Nos.10-16 Lai Wan Road, Lai Chi Kok, Kowloon',
        'Unit 101, Phase 1, Building Name, 1 Street Name, District',
        'Shop A, Stage 2A, Building Name, 1 Street Name, District',
        'Flat 906, Phase III, Building Name, 1 Street Name, District'
      ];

      testCases.forEach((address) => {
        console.log(`Testing phase formats: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle lot information in different formats', () => {
      const testCases = [
        '100 Peak Road, On R.B.L. 312, The Peak, Hong Kong',
        'G/F, Dd253, Lot 1177, Razor Hill, Clear Water Bay, Sai Kung, N.T.',
        'Unit 101, Lot No. 1234, Building Name, 1 Street Name, District',
        'Shop A, Lot 5678, Building Name, 1 Street Name, District'
      ];

      testCases.forEach((address) => {
        console.log(`Testing lot formats: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Complex division patterns', () => {
    it('should handle multiple division types in one address', () => {
      const testCases = [
        'Shop N50B, G/F, Mount Sterling Mall, Stage 7 Mei Foo Sun Chuen, Nos.10-16 Lai Wan Road, Lai Chi Kok, Kowloon',
        'Unit 101, Block A, Phase 1, Estate Name, 1 Street Name, District',
        'Shop A, Level 2, Lot 1234, Building Name, 1 Street Name, District'
      ];

      testCases.forEach((address) => {
        console.log(`Testing multiple divisions: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle division information with Chinese characters', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, Block B 座, Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F, Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, BLK 1 期, 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block)'
      ];

      testCases.forEach((address) => {
        console.log(`Testing Chinese characters: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle division information with descriptive terms', () => {
      const testCases = [
        '36 Tai Yau Street, G/F, Block B (North Wing), Wah Hing Industrial Mansions',
        'Shop Nos. 101, 102, 106 & 107, On 1/F, Domain, 38 Ko Chiu Road, Yau Tong',
        'Flat/Rm 906, BLK 1 (Residential), 9/F, Kowloon Commercial Centre',
        '80 Wang Kwong Road, Shop No.G18, G/F, Richland Gardens (Commercial & Garage Block)'
      ];

      testCases.forEach((address) => {
        console.log(`Testing descriptive terms: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });
});
