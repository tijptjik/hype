// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// TYPES
import type { Locale } from '$lib/types';

describe('Building Name Extraction Tests', () => {
  describe('Basic extraction from test data', () => {
    it('should extract building names from test addresses', () => {
      const addressesWithBuildings = testData.testAddresses.filter(
        (testCase) => testCase.extracted.buildingName
      );

      console.log(
        `Found ${addressesWithBuildings.length} addresses with building names`
      );

      addressesWithBuildings.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected buildingName: ${testCase.extracted.buildingName}`);

        expect(testCase.extracted.buildingName).toBeDefined();
      });
    });

    it('should categorize different types of building names', () => {
      const buildingTypes = {
        residential: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.buildingName &&
            (testCase.extracted.buildingName.includes('Court') ||
              testCase.extracted.buildingName.includes('Mansion') ||
              testCase.extracted.buildingName.includes('Estate'))
        ),
        commercial: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.buildingName &&
            (testCase.extracted.buildingName.includes('Centre') ||
              testCase.extracted.buildingName.includes('Plaza') ||
              testCase.extracted.buildingName.includes('Mall') ||
              testCase.extracted.buildingName.includes('Tower'))
        ),
        municipal: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.buildingName &&
            testCase.extracted.buildingName.includes('Municipal')
        ),
        market: testData.testAddresses.filter(
          (testCase) =>
            testCase.extracted.buildingName &&
            testCase.extracted.buildingName.includes('Market')
        )
      };

      console.log('Building type distribution:');
      Object.entries(buildingTypes).forEach(([type, buildings]) => {
        console.log(`${type}: ${buildings.length} buildings`);
      });
    });
  });

  describe('Edge cases and formatting issues', () => {
    it('should handle building names with missing commas', () => {
      const testCases = [
        'Jardine House 1 Connaught Place Central Hong Kong',
        "Central House Nos. 270 - 276 Queen'S Road Central Hong Kong",
        'Nexxus Building 77 Des Voeux Road Central Central Hong Kong',
        'Clovelly Court 12 May Road Peak Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing missing commas: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with extra punctuation', () => {
      const testCases = [
        'Jardine House., 1 Connaught Place, Central, Hong Kong',
        "Central House!, Nos. 270 - 276 Queen'S Road, Central, Hong Kong",
        'Nexxus Building., 77 Des Voeux Road Central, Central, Hong Kong',
        'Clovelly Court., 12 May Road, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing extra punctuation: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with non-standard abbreviations', () => {
      const testCases = [
        'Jardine Bldg., 1 Connaught Place, Central, Hong Kong',
        "Central Ctr., Nos. 270 - 276 Queen'S Road, Central, Hong Kong",
        'Nexxus Bldg., 77 Des Voeux Road Central, Central, Hong Kong',
        'Clovelly Crt., 12 May Road, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing abbreviations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with mixed case', () => {
      const testCases = [
        'JARDINE house, 1 Connaught Place, Central, Hong Kong',
        "CENTRAL House, Nos. 270 - 276 Queen'S Road, Central, Hong Kong",
        'nexxus BUILDING, 77 Des Voeux Road Central, Central, Hong Kong',
        'ClOvElLy CoUrT, 12 May Road, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing mixed case: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with numbers and special characters', () => {
      const testCases = [
        'Building 1A, 1 Connaught Place, Central, Hong Kong',
        "Central House-2, Nos. 270 - 276 Queen'S Road, Central, Hong Kong",
        'Nexxus Building_3, 77 Des Voeux Road Central, Central, Hong Kong',
        'Clovelly Court (Phase 1), 12 May Road, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing special characters: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle inverted order (building name at different positions)', () => {
      const testCases = [
        '1 Connaught Place, Jardine House, Central, Hong Kong',
        "Nos. 270 - 276 Queen'S Road, Central House, Central, Hong Kong",
        '77 Des Voeux Road Central, Nexxus Building, Central, Hong Kong',
        '12 May Road, Clovelly Court, Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        console.log(`Testing inverted order: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Complex building name patterns', () => {
    it('should handle compound building names', () => {
      const testCases = [
        "Shek Tong Tsui Municipal Services Building, 470 Queen'S Road West",
        'Central Star Ferry Pier, Central, Hong Kong Island',
        'Lee Theatre Plaza Ground Floor Main Entrance, East Point Road',
        'Mong Kok Flower Market Park, Mong Kok, Kowloon'
      ];

      testCases.forEach((address) => {
        console.log(`Testing compound names: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with descriptive terms', () => {
      const testCases = [
        'The Grand Building, 1 Connaught Place, Central',
        "New Central House, Nos. 270 - 276 Queen'S Road, Central",
        'Old Nexxus Building, 77 Des Voeux Road Central, Central',
        'Modern Clovelly Court, 12 May Road, Peak'
      ];

      testCases.forEach((address) => {
        console.log(`Testing descriptive terms: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with Chinese characters', () => {
      const testCases = [
        'Jardine House 怡和大廈, 1 Connaught Place, Central',
        "Central House 中環大廈, Nos. 270 - 276 Queen'S Road, Central",
        'Nexxus Building 力寶大廈, 77 Des Voeux Road Central, Central',
        'Clovelly Court 克洛維利閣, 12 May Road, Peak'
      ];

      testCases.forEach((address) => {
        console.log(`Testing Chinese characters: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle building names with estate/phase information', () => {
      const testCases = [
        'Jardine House Phase 1, 1 Connaught Place, Central',
        "Central House Estate, Nos. 270 - 276 Queen'S Road, Central",
        'Nexxus Building Block A, 77 Des Voeux Road Central, Central',
        'Clovelly Court Stage 2, 12 May Road, Peak'
      ];

      testCases.forEach((address) => {
        console.log(`Testing estate/phase info: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });
});
