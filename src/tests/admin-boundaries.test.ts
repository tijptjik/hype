// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// UTILS
import {
  extractCountryFromAddress,
  extractRegionFromAddress,
  extractDistrictFromAddress,
  extractNeighbourhoodFromAddress
} from '$lib/utils/geocoding';
// TYPES
import type { Locale } from '$lib/types';

describe('Administrative Boundaries Extraction Tests', () => {
  describe('Comprehensive extraction from test data', () => {
    it('should extract all administrative boundaries from test addresses', () => {
      testData.testAddresses.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);

        const country = extractCountryFromAddress(testCase.address);
        const region = extractRegionFromAddress(testCase.address);
        const district = extractDistrictFromAddress(testCase.address);
        const neighbourhood = extractNeighbourhoodFromAddress(testCase.address);

        console.log(`  District: ${district}`);
        console.log(`  Region: ${region}`);
        console.log(`  Country: ${country}`);
        console.log(`  Neighbourhood: ${neighbourhood}`);

        // Test district extraction
        if (testCase.extracted.district) {
          expect(district).toBe(testCase.extracted.district);
        } else {
          expect(district).toBeNull();
        }

        // Test region extraction
        if (testCase.extracted.region) {
          expect(region).toBe(testCase.extracted.region);
        } else {
          expect(region).toBeNull();
        }

        // Test country extraction
        if (testCase.extracted.country) {
          expect(country).toBe(testCase.extracted.country);
        } else {
          expect(country).toBeNull();
        }

        // Test neighbourhood extraction
        if (testCase.extracted.neighbourhood) {
          expect(neighbourhood).toBe(testCase.extracted.neighbourhood);
        } else {
          expect(neighbourhood).toBeNull();
        }
      });
    });

    it('should categorize different district types', () => {
      const districtTypes = {
        HK: testData.testAddresses.filter(
          (testCase) =>
            testCase.inferred.district &&
            ['CW', 'EST', 'STH', 'WC'].includes(testCase.inferred.district)
        ),
        KL: testData.testAddresses.filter(
          (testCase) =>
            testCase.inferred.district &&
            ['KLC', 'KT', 'SSP', 'WTS', 'YTM'].includes(testCase.inferred.district)
        ),
        NT: testData.testAddresses.filter(
          (testCase) =>
            testCase.inferred.district &&
            ['ILD', 'KC', 'NTH', 'SK', 'ST', 'TP', 'TW', 'TM', 'YL'].includes(
              testCase.inferred.district
            )
        )
      };

      console.log('District type distribution:');
      Object.entries(districtTypes).forEach(([type, districts]) => {
        console.log(`${type}: ${districts.length} entries`);
      });

      // Basic validation that we have data in each category
      expect(districtTypes.HK.length).toBeGreaterThan(0);
      expect(districtTypes.KL.length).toBeGreaterThan(0);
      expect(districtTypes.NT.length).toBeGreaterThan(0);
    });
  });

  describe('Contentious and difficult cases', () => {
    it('should handle mixed language addresses', () => {
      const testCases = [
        {
          address: '44 Centre Street, 中西區, Hong Kong SAR',
          description: 'English street, Chinese district, English country',
          expectedDistrict: 'CW',
          expectedCountry: 'HKSAR'
        },
        {
          address: '旺角花墟公園, Mong Kok, Kowloon, Hong Kong',
          description: 'Chinese street, English neighbourhood, English region/country',
          expectedRegion: 'KL',
          expectedCountry: 'HKSAR',
          expectedNeighbourhood: 'Mong Kok'
        },
        {
          address: 'Central Star Ferry Pier, 中環, 香港',
          description: 'English street, Chinese neighbourhood, Chinese country',
          expectedCountry: 'HKSAR',
          expectedNeighbourhood: 'Central'
        }
      ];

      testCases.forEach(
        ({
          address,
          description,
          expectedDistrict,
          expectedRegion,
          expectedCountry,
          expectedNeighbourhood
        }) => {
          console.log(`Testing mixed language: "${address}" - ${description}`);

          const district = extractDistrictFromAddress(address);
          const region = extractRegionFromAddress(address);
          const country = extractCountryFromAddress(address);
          const neighbourhood = extractNeighbourhoodFromAddress(address);

          console.log(
            `  District: ${district}, Region: ${region}, Country: ${country}, Neighbourhood: ${neighbourhood}`
          );

          if (expectedDistrict) expect(district).toBe(expectedDistrict);
          if (expectedRegion) expect(region).toBe(expectedRegion);
          if (expectedCountry) expect(country).toBe(expectedCountry);
          if (expectedNeighbourhood) expect(neighbourhood).toBe(expectedNeighbourhood);
        }
      );
    });

    it('should handle addresses with multiple administrative levels', () => {
      const testCases = [
        {
          address:
            'Central Star Ferry Pier No. 7, Central, Hong Kong Island, Hong Kong',
          description: 'Street, Neighbourhood, Region, Country',
          expectedRegion: 'HK',
          expectedCountry: 'HKSAR',
          expectedNeighbourhood: 'Central'
        },
        {
          address:
            'Lee Theatre Plaza, Causeway Bay, Wan Chai, Hong Kong Island, Hong Kong',
          description: 'Building, Neighbourhood, District, Region, Country',
          expectedDistrict: 'WC',
          expectedRegion: 'HK',
          expectedCountry: 'HKSAR',
          expectedNeighbourhood: 'Causeway Bay'
        },
        {
          address:
            'Mong Kok Flower Market Park, Mong Kok, Yau Tsim Mong, Kowloon, Hong Kong',
          description: 'Building, Neighbourhood, District, Region, Country',
          expectedDistrict: 'YTM',
          expectedRegion: 'KL',
          expectedCountry: 'HKSAR',
          expectedNeighbourhood: 'Mong Kok'
        }
      ];

      testCases.forEach(
        ({
          address,
          description,
          expectedDistrict,
          expectedRegion,
          expectedCountry,
          expectedNeighbourhood
        }) => {
          console.log(`Testing multiple levels: "${address}" - ${description}`);

          const district = extractDistrictFromAddress(address);
          const region = extractRegionFromAddress(address);
          const country = extractCountryFromAddress(address);
          const neighbourhood = extractNeighbourhoodFromAddress(address);

          console.log(
            `  District: ${district}, Region: ${region}, Country: ${country}, Neighbourhood: ${neighbourhood}`
          );

          if (expectedDistrict) expect(district).toBe(expectedDistrict);
          if (expectedRegion) expect(region).toBe(expectedRegion);
          if (expectedCountry) expect(country).toBe(expectedCountry);
          if (expectedNeighbourhood) expect(neighbourhood).toBe(expectedNeighbourhood);
        }
      );
    });

    it('should handle edge cases with punctuation and formatting', () => {
      const testCases = [
        {
          address: '38 Des Voeux Road West, Sheung Wan, HK S.A.R.',
          description: 'Abbreviation with period',
          expectedCountry: 'HKSAR'
        },
        {
          address: '21 Bowrington Road, Wan Chai, Hong Kong SAR',
          description: 'Full country name with SAR',
          expectedCountry: 'HKSAR'
        },
        {
          address: '67 Yi Chun Street, Sai Kung, N.T.',
          description: 'Region abbreviation with periods',
          expectedRegion: 'NT'
        },
        {
          address: 'Central Star Ferry Pier, Central, Hong Kong Island, Hong Kong',
          description: 'Multiple Hong Kong mentions',
          expectedRegion: 'HK',
          expectedCountry: 'HKSAR'
        }
      ];

      testCases.forEach(({ address, description, expectedRegion, expectedCountry }) => {
        console.log(`Testing edge cases: "${address}" - ${description}`);

        const district = extractDistrictFromAddress(address);
        const region = extractRegionFromAddress(address);
        const country = extractCountryFromAddress(address);
        const neighbourhood = extractNeighbourhoodFromAddress(address);

        console.log(
          `  District: ${district}, Region: ${region}, Country: ${country}, Neighbourhood: ${neighbourhood}`
        );

        if (expectedRegion) expect(region).toBe(expectedRegion);
        if (expectedCountry) expect(country).toBe(expectedCountry);
      });
    });

    it('should handle addresses without explicit administrative boundaries', () => {
      const testCases = [
        {
          address: '44 Centre Street, Sai Ying Pun',
          description: 'Street and neighbourhood only',
          expectedDistrict: null,
          expectedRegion: null,
          expectedCountry: null,
          expectedNeighbourhood: 'Sai Ying Pun'
        },
        {
          address: 'Mong Kok Flower Market Park, Mong Kok',
          description: 'Building and neighbourhood only',
          expectedDistrict: null,
          expectedRegion: null,
          expectedCountry: null,
          expectedNeighbourhood: 'Mong Kok'
        },
        {
          address: 'Central Star Ferry Pier No. 7, Central',
          description: 'Building and neighbourhood only',
          expectedDistrict: null,
          expectedRegion: null,
          expectedCountry: null,
          expectedNeighbourhood: 'Central'
        }
      ];

      testCases.forEach(
        ({
          address,
          description,
          expectedDistrict,
          expectedRegion,
          expectedCountry,
          expectedNeighbourhood
        }) => {
          console.log(`Testing minimal addresses: "${address}" - ${description}`);

          const district = extractDistrictFromAddress(address);
          const region = extractRegionFromAddress(address);
          const country = extractCountryFromAddress(address);
          const neighbourhood = extractNeighbourhoodFromAddress(address);

          console.log(
            `  District: ${district}, Region: ${region}, Country: ${country}, Neighbourhood: ${neighbourhood}`
          );

          if (expectedDistrict !== undefined) expect(district).toBe(expectedDistrict);
          if (expectedRegion !== undefined) expect(region).toBe(expectedRegion);
          if (expectedCountry !== undefined) expect(country).toBe(expectedCountry);
          if (expectedNeighbourhood !== undefined)
            expect(neighbourhood).toBe(expectedNeighbourhood);
        }
      );
    });

    it('should handle conflicting administrative information', () => {
      const testCases = [
        {
          address:
            '44 Centre Street, Sai Ying Pun, Central & Western, Kowloon, Hong Kong',
          description: 'District says Hong Kong Island, Region says Kowloon',
          expectedDistrict: 'CW',
          expectedRegion: 'KL', // Should prefer explicit region over inferred
          expectedCountry: 'HKSAR'
        },
        {
          address:
            'Mong Kok Flower Market Park, Mong Kok, Yau Tsim Mong, New Territories, HKSAR',
          description: 'District says Kowloon, Region says New Territories',
          expectedDistrict: 'YTM',
          expectedRegion: 'NT', // Should prefer explicit region over inferred
          expectedCountry: 'HKSAR'
        }
      ];

      testCases.forEach(
        ({
          address,
          description,
          expectedDistrict,
          expectedRegion,
          expectedCountry
        }) => {
          console.log(`Testing conflicts: "${address}" - ${description}`);

          const district = extractDistrictFromAddress(address);
          const region = extractRegionFromAddress(address);
          const country = extractCountryFromAddress(address);

          console.log(
            `  District: ${district}, Region: ${region}, Country: ${country}`
          );

          if (expectedDistrict) expect(district).toBe(expectedDistrict);
          if (expectedRegion) expect(region).toBe(expectedRegion);
          if (expectedCountry) expect(country).toBe(expectedCountry);
        }
      );
    });

    it('should handle non-standard administrative abbreviations', () => {
      const testCases = [
        {
          address: '44 Centre Street, Sai Ying Pun, H.K.',
          description: 'H.K. abbreviation',
          expectedRegion: 'HK'
        },
        {
          address: '38 Des Voeux Road West, Sheung Wan, HK',
          description: 'HK abbreviation',
          expectedRegion: 'HK'
        },
        {
          address: '21 Bowrington Road, Wan Chai, Hong Kong',
          description: 'Full Hong Kong name',
          expectedRegion: 'HK'
        },
        {
          address: '67 Yi Chun Street, Sai Kung, N.T.',
          description: 'N.T. abbreviation',
          expectedRegion: 'NT'
        }
      ];

      testCases.forEach(({ address, description, expectedRegion }) => {
        console.log(`Testing abbreviations: "${address}" - ${description}`);

        const district = extractDistrictFromAddress(address);
        const region = extractRegionFromAddress(address);
        const country = extractCountryFromAddress(address);

        console.log(`  District: ${district}, Region: ${region}, Country: ${country}`);

        if (expectedRegion) expect(region).toBe(expectedRegion);
      });
    });

    it('should handle mixed case in administrative specifications', () => {
      const testCases = [
        {
          address: '44 Centre Street, Sai Ying Pun, HK',
          description: 'Uppercase HK',
          expectedRegion: 'HK'
        },
        {
          address: '38 Des Voeux Road West, Sheung Wan, hk',
          description: 'Lowercase hk',
          expectedRegion: 'HK'
        },
        {
          address: '21 Bowrington Road, Wan Chai, HONG KONG',
          description: 'Uppercase HONG KONG',
          expectedRegion: 'HK'
        },
        {
          address: '67 Yi Chun Street, Sai Kung, nt',
          description: 'Lowercase nt',
          expectedRegion: 'NT'
        }
      ];

      testCases.forEach(({ address, description, expectedRegion }) => {
        console.log(`Testing mixed case: "${address}" - ${description}`);

        const district = extractDistrictFromAddress(address);
        const region = extractRegionFromAddress(address);
        const country = extractCountryFromAddress(address);

        console.log(`  District: ${district}, Region: ${region}, Country: ${country}`);

        if (expectedRegion) expect(region).toBe(expectedRegion);
      });
    });
  });
});
