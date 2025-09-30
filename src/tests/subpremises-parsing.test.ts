// SVELTE
import { describe, it, expect } from 'vitest';

// UTILS
import { getAddressForQuery } from '$lib/utils/geocoding';
import { parseSubPremisesComponent } from '$lib/utils/geo/parsing';

// TYPES
import type { Locale } from '$lib/types';

describe('Subpremises Parsing', () => {
  describe('getAddressForQuery - Subpremises Extraction', () => {
    const testCases = [
      {
        address:
          '55-57 Catchick Street, Shop A & B, G/F, May Sun Building, Kennedy Town, Hong Kong',
        expected: 'Shop A & B, G/F',
        description: 'Out of order - Shop with unit number and ground floor'
      },
      {
        address: 'Shop 8, 2/F, Island Crest, 8 First Street, Sai Ying Pun, Hong Kong',
        expected: 'Shop 8, 2/F',
        description: 'Shop with floor number'
      },
      {
        address:
          'Shop 206–209, 2/F, Shun Tak Centre, 200 Connaught Road Central, Sheung Wan, Hong Kong',
        expected: 'Shop 206–209, 2/F',
        description: 'Shop with range and floor'
      },
      {
        address: '55 Connaught Road West, G/F, Wui Tat Centre',
        expected: 'G/F',
        description: 'Out of order - Ground floor only'
      },
      {
        address: 'ifc mall Level 1, Shops 1041-1049, Central',
        expected: 'Level 1, Shops 1041-1049',
        description: 'Out of order - Level and shops with range'
      },
      {
        address:
          "Shop A, G/F, Central House, Nos. 270 - 276 Queen's Road Central, Hong Kong",
        expected: 'Shop A, G/F',
        description: 'Shop with letter unit and ground floor'
      },
      {
        address:
          'Suites 101-109 & 120, 1/F , Jardine House, 1 Connaught Place, Central , Hong Kong',
        expected: 'Suites 101-109 & 120, 1/F',
        description: 'Suites with complex range and floor'
      },
      {
        address: 'LG/F, Nexxus Building, 77 Des Voeux Road Central, Central, Hong Kong',
        expected: 'LG/F',
        description: 'Lower ground floor only'
      },
      {
        address: 'LG/F & G/F, 1 Seymour Terrace, Mid-Levels, Hong Kong',
        expected: 'LG/F & G/F',
        description: 'Multiple floor types'
      }
    ];

    testCases.forEach(({ address, expected, description }) => {
      it(`should extract subpremises: ${description}`, () => {
        const result = getAddressForQuery(address, 'en');
        expect(result.subpremisesRaw).toBe(expected);
      });
    });
  });

  describe('parseSubPremisesComponent - Structured Parsing', () => {
    const testCases = [
      {
        subpremises: 'Shop A & B, G/F',
        expected: {
          unitType: 'Shop',
          unitNumber: 'A & B',
          floorType: 'Ground',
          floorNumber: undefined
        },
        description: 'Shop with unit number and ground floor'
      },
      {
        subpremises: 'Shop 8, 2/F',
        expected: {
          unitType: 'Shop',
          unitNumber: '8',
          floorType: 'Floor',
          floorNumber: '2'
        },
        description: 'Shop with floor number'
      },
      {
        subpremises: 'Shop 206–209, 2/F',
        expected: {
          unitType: 'Shop',
          unitNumber: '206–209',
          floorType: 'Floor',
          floorNumber: '2'
        },
        description: 'Shop with range and floor'
      },
      {
        subpremises: 'G/F',
        expected: {
          unitType: undefined,
          unitNumber: undefined,
          floorType: 'Ground',
          floorNumber: undefined
        },
        description: 'Ground floor only'
      },
      {
        subpremises: 'Level 1, Shops 1041-1049',
        expected: {
          unitType: 'Shop',
          unitNumber: '1041-1049',
          floorType: 'Level',
          floorNumber: '1'
        },
        description: 'Level and shops with range'
      },
      {
        subpremises: 'Shop A, G/F',
        expected: {
          unitType: 'Shop',
          unitNumber: 'A',
          floorType: 'Ground',
          floorNumber: undefined
        },
        description: 'Shop with letter unit and ground floor'
      },
      {
        subpremises: 'Suites 101-109 & 120, 1/F',
        expected: {
          unitType: 'Suite',
          unitNumber: '101-109 & 120',
          floorType: 'Floor',
          floorNumber: '1'
        },
        description: 'Suites with complex range and floor'
      },
      {
        subpremises: 'LG/F',
        expected: {
          unitType: undefined,
          unitNumber: undefined,
          floorType: 'Lower Ground',
          floorNumber: undefined
        },
        description: 'Lower ground floor only'
      },
      {
        subpremises: 'LG/F & G/F',
        expected: {
          unitType: undefined,
          unitNumber: undefined,
          floorType: 'LG/F & G/F',
          floorNumber: undefined
        },
        description: 'Multiple floor types (nonstandard notation)'
      }
    ];

    testCases.forEach(({ subpremises, expected, description }) => {
      it(`should parse subpremises: ${description}`, () => {
        const result = parseSubPremisesComponent(subpremises, 'en', 'en');
        expect(result).toEqual(expected);
      });
    });
  });
});
