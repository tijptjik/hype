// VITEST
import { describe, it, expect } from 'vitest';
// UTILS
import { extractDistrictFromAddress } from '$lib/utils/geocoding';
// TEST DATA
import testData from './geoparsing-test-data.json';
// TYPES
import type { Locale } from '$lib/types';

describe('extractDistrictFromAddress - Comprehensive Tests', () => {
  describe('Real-world Hong Kong addresses', () => {
    testData.testAddresses.forEach((testCase, index) => {
      it(`should extract correct district for address ${index + 1}: "${testCase.address}"`, () => {
        const result = extractDistrictFromAddress(testCase.address);
        expect(result).toBe(testCase.inferred.district);
      });
    });
  });

  describe('District distribution validation', () => {
    it('should correctly identify all Hong Kong districts from test data', () => {
      const districtCounts: Record<string, number> = {};

      testData.testAddresses.forEach((testCase) => {
        const result = extractDistrictFromAddress(testCase.address);
        if (result) {
          districtCounts[result] = (districtCounts[result] || 0) + 1;
        }
      });

      // Expected districts in the test data
      const expectedDistricts = [
        'CW',
        'WC',
        'EST',
        'SK',
        'STH',
        'SSP',
        'WTS',
        'KT',
        'KLC',
        'YTM',
        'KC',
        'TW',
        'ST',
        'TM',
        'YL'
      ];

      expectedDistricts.forEach((district) => {
        expect(
          districtCounts[district],
          `${district} should have at least one match`
        ).toBeGreaterThan(0);
      });

      console.log('District distribution:', districtCounts);
    });
  });

  describe('Central & Western District variations', () => {
    const cwAddresses = testData.testAddresses.filter(
      (testCase) => testCase.inferred.district === 'CW'
    );

    it('should identify Central addresses correctly', () => {
      cwAddresses.forEach((testCase) => {
        const result = extractDistrictFromAddress(testCase.address);
        expect(result).toBe('CW');
      });
    });

    it('should handle various Central area names', () => {
      const centralVariations = [
        'Central',
        'Mid-Levels',
        'Peak',
        'The Peak',
        'Sai Ying Pun',
        'Sheung Wan',
        'Kennedy Town',
        'Shek Tong Tsui'
      ];

      centralVariations.forEach((area) => {
        const address = `123 Main Street, ${area}, Hong Kong`;
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('CW');
      });
    });
  });

  describe('Wan Chai District variations', () => {
    const wcAddresses = testData.testAddresses.filter(
      (testCase) => testCase.inferred.district === 'WC'
    );

    it('should identify Wan Chai addresses correctly', () => {
      wcAddresses.forEach((testCase) => {
        const result = extractDistrictFromAddress(testCase.address);
        expect(result).toBe('WC');
      });
    });

    it('should handle various Wan Chai area names', () => {
      const wcVariations = [
        'Wan Chai',
        'Wanchai',
        'Causeway Bay',
        'Wan Chai Road'
      ];

      wcVariations.forEach((area) => {
        const address = `123 Main Street, ${area}, Hong Kong`;
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('WC');
      });
    });
  });

  describe('Eastern District variations', () => {
    const estAddresses = testData.testAddresses.filter(
      (testCase) => testCase.inferred.district === 'EST'
    );

    it('should identify Eastern addresses correctly', () => {
      estAddresses.forEach((testCase) => {
        const result = extractDistrictFromAddress(testCase.address);
        expect(result).toBe('EST');
      });
    });

    it('should handle various Eastern area names', () => {
      const estVariations = [
        'Chai Wan',
        'North Point',
        'Electric Road'
      ];

      estVariations.forEach((area) => {
        const address = `123 Main Street, ${area}, Hong Kong`;
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('EST');
      });
    });
  });

  describe('Southern District variations', () => {
    const sthAddresses = testData.testAddresses.filter(
      (testCase) => testCase.inferred.district === 'STH'
    );

    it('should identify Southern addresses correctly', () => {
      sthAddresses.forEach((testCase) => {
        const result = extractDistrictFromAddress(testCase.address);
        expect(result).toBe('STH');
      });
    });

    it('should handle various Southern area names', () => {
      const sthVariations = [
        'Aberdeen',
        'Ap Lei Chau',
        'Wong Chuk Hang'
      ];

      sthVariations.forEach((area) => {
        const address = `123 Main Street, ${area}, Hong Kong`;
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('STH');
      });
    });
  });

  describe('Kowloon districts', () => {
    const kowloonDistricts = ['SSP', 'KLC', 'KT', 'WTS', 'YTM'];

    kowloonDistricts.forEach((district) => {
      const districtAddresses = testData.testAddresses.filter(
        (testCase) => testCase.inferred.district === district
      );

      it(`should identify ${district} addresses correctly`, () => {
        districtAddresses.forEach((testCase) => {
          const result = extractDistrictFromAddress(testCase.address);
          expect(result).toBe(district);
        });
      });
    });
  });

  describe('New Territories districts', () => {
    const ntDistricts = ['KC', 'TW', 'ST', 'TM', 'YL', 'SK'];

    ntDistricts.forEach((district) => {
      const districtAddresses = testData.testAddresses.filter(
        (testCase) => testCase.inferred.district === district
      );

      it(`should identify ${district} addresses correctly`, () => {
        districtAddresses.forEach((testCase) => {
          const result = extractDistrictFromAddress(testCase.address);
          expect(result).toBe(district);
        });
      });
    });
  });

  describe('Complex address parsing', () => {
    it('should handle addresses with multiple building components', () => {
      const complexAddresses = [
        'Shop 307B, 3/F, Choi Ming Shopping Centre, Choi Ming Court, 1 Choi Ming Street, Tko, Sai Kung, N.T.',
        'Unit 1-15 & 17-22 Lg/F, C C Wu Building, Nos. 302-308 Hennessy Road, Wan Chai, Hong Kong',
        'Shop Nos. 101, 102, 106 & 107 On 1/F And Shop Nos. 201, 202 & 208 On 2/F, Domain, 38 Ko Chiu Road, Yau Tong'
      ];

      complexAddresses.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
      });
    });

    it('should handle addresses with estate names', () => {
      const estateAddresses = [
        'Shop N50B, G/F, Mount Sterling Mall, Stage 7 Mei Foo Sun Chuen, Nos.10-16 Lai Wan Road, Lai Chi Kok, Kowloon',
        'Shp G5, G/F, Plaza 328, Bo Shek Mansion, 328 Sha Tsui Rd, Tsuen Wan'
      ];

      estateAddresses.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
      });
    });
  });

  describe('Edge cases with real data', () => {
    it('should handle addresses with abbreviated district indicators', () => {
      const abbreviatedAddresses = [
        '45 Centre Street, SYP, Hk', // SYP = Sai Ying Pun
        'Tko, Sai Kung, N.T.', // Tko = Tseung Kwan O
        'Ma Wan 1868, Ma Wan, NT' // NT = New Territories
      ];

      abbreviatedAddresses.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
      });
    });

    it('should handle addresses with mixed case and punctuation', () => {
      const mixedCaseAddresses = [
        "Sheung Wan Municipal Services Building, 345 Queen'S Road Central,Sheung Wan, Hk",
        'Ap Lei Chau Municipal Services Building, 8 Hung Shing Street,Ap Lei Chau, Hk',
        "Stall No. 43, 264 Queen''S Road East"
      ];

      mixedCaseAddresses.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
      });
    });
  });

  describe('Performance and reliability', () => {
    it('should handle all test addresses without errors', () => {
      let successCount = 0;
      let failureCount = 0;

      testData.testAddresses.forEach((testCase) => {
        try {
          const result = extractDistrictFromAddress(testCase.address);
          if (result === testCase.inferred.district) {
            successCount++;
          } else {
            failureCount++;
            console.warn(
              `Failed to extract correct district for: "${testCase.address}" - Expected: ${testCase.inferred.district}, Got: ${result}`
            );
          }
        } catch (error) {
          failureCount++;
          console.error(`Error processing address: "${testCase.address}"`, error);
        }
      });

      const successRate = (successCount / testData.testAddresses.length) * 100;
      console.log(
        `Success rate: ${successRate.toFixed(2)}% (${successCount}/${testData.testAddresses.length})`
      );

      expect(successRate).toBeGreaterThan(90); // Expect at least 90% success rate
    });
  });
});
