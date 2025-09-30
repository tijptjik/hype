// VITEST
import { describe, it, expect } from 'vitest';
// UTILS
import { extractDistrictFromAddress } from '$lib/utils/geocoding';
// TYPES
import type { Locale } from '$lib/types';

describe('extractDistrictFromAddress', () => {
  describe('Basic functionality with provided test data', () => {
    it('should extract Central district from addresses with "Central"', () => {
      const testCases = [
        "Basement - 1/F, 22-28 Queen'S Road, Central Tower, Central, Hong Kong",
        '1/F, Kinwick Centre, 32 Hollywood Road, Central, Hong Kong',
        "139 Queen'S Road, Ug/F, The L Place, Central, Hong Kong",
        "Shop A, G/F, Central House, Nos. 270 - 276 Queen'S Road Central, Hong Kong",
        'Suites 101-109 & 120, 1/F , Jardine House, 1 Connaught Place, Central , Hong Kong',
        'Lg/F, Nexxus Building, 77 Des Voeux Road Central, Central, Hong Kong'
      ];

      testCases.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('CW');
      });
    });

    it('should extract Mid-Levels district from Mid-Levels addresses', () => {
      const address = 'Lg/F & G/F, 1 Seymour Terrace, Mid-Levels, Hong Kong';
      const result = extractDistrictFromAddress(address);
      expect(result).toBe('CW'); // Mid-Levels is in Central & Western
    });

    it('should extract Peak district from Peak addresses', () => {
      const testCases = [
        'Ug/F, Clovelly Court, 12 May Road, Peak, Hong Kong',
        '100 Peak Road, On R.B.L. 312, The Peak, Hong Kong'
      ];

      testCases.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('CW'); // Peak is in Central & Western
      });
    });
  });

  describe('District identifier matching', () => {
    it('should match district by full name', () => {
      const testCases = [
        { address: '123 Main Street, Central, Hong Kong', expected: 'CW' },
        { address: '456 Road, Eastern, Hong Kong', expected: 'EST' },
        { address: '789 Avenue, Southern, Hong Kong', expected: 'STH' },
        { address: '321 Boulevard, Northern, Hong Kong', expected: 'NTH' }
      ];

      testCases.forEach(({ address, expected }) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(expected);
      });
    });

    it('should match district by abbreviations', () => {
      const testCases = [
        { address: '123 Main Street, CW, Hong Kong', expected: 'CW' },
        { address: '456 Road, EST, Hong Kong', expected: 'EST' },
        { address: '789 Avenue, STH, Hong Kong', expected: 'STH' },
        { address: '321 Boulevard, NTH, Hong Kong', expected: 'NTH' }
      ];

      testCases.forEach(({ address, expected }) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(expected);
      });
    });

    it('should match district by Chinese names', () => {
      const testCases = [
        { address: '123 Main Street, 中西區, Hong Kong', expected: 'CW' },
        { address: '456 Road, 東區, Hong Kong', expected: 'EST' },
        { address: '789 Avenue, 南區, Hong Kong', expected: 'STH' },
        { address: '321 Boulevard, 北區, Hong Kong', expected: 'NTH' }
      ];

      testCases.forEach(({ address, expected }) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty or whitespace-only addresses', () => {
      const testCases = [
        '',
        '   ',
        '\t\n',
        null as any,
        undefined as any
      ];

      testCases.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeNull();
      });
    });

    it('should return null when no district is found', () => {
      const testCases = [
        '123 Main Street, Hong Kong',
        'Some random address without district',
        '456 Road, NotADistrict, Hong Kong'
      ];

      testCases.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBeNull();
      });
    });

    it('should handle case-insensitive matching', () => {
      const testCases = [
        { address: '123 Main Street, CENTRAL, Hong Kong', expected: 'CW' },
        { address: '456 Road, eastern, Hong Kong', expected: 'EST' },
        { address: '789 Avenue, SoUtHeRn, Hong Kong', expected: 'STH' }
      ];

      testCases.forEach(({ address, expected }) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(expected);
      });
    });

    it('should handle extra whitespace and punctuation', () => {
      const testCases = [
        { address: '123 Main Street,  Central  , Hong Kong', expected: 'CW' },
        { address: '456 Road,  Eastern!!  , Hong Kong', expected: 'EST' },
        { address: '789 Avenue,  Southern...  , Hong Kong', expected: 'STH' }
      ];

      testCases.forEach(({ address, expected }) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Locale handling', () => {
    it('should work with different locale parameters', () => {
      const address = '123 Main Street, Central, Hong Kong';

      const resultEn = extractDistrictFromAddress(address, 'en');
      const resultZhHans = extractDistrictFromAddress(address, 'zh-hans');
      const resultZhHant = extractDistrictFromAddress(address, 'zh-hant');

      expect(resultEn).toBe('CW');
      expect(resultZhHans).toBe('CW');
      expect(resultZhHant).toBe('CW');
    });
  });

  describe('Multiple district matches', () => {
    it('should return the first matching district', () => {
      const address = '123 Main Street, Central, Eastern, Hong Kong';
      const result = extractDistrictFromAddress(address);
      // Should return the first match found (order depends on districtIdentifiers iteration)
      expect(result).toBeDefined();
      expect(['CW', 'EST']).toContain(result);
    });
  });

  describe('Complex address formats', () => {
    it('should handle addresses with multiple segments', () => {
      const address =
        'Unit 1, Floor 2, Building A, 123 Main Street, Central District, Hong Kong';
      const result = extractDistrictFromAddress(address);
      expect(result).toBe('CW');
    });

    it('should handle addresses with district in different positions', () => {
      const testCases = [
        'Central, 123 Main Street, Hong Kong', // District first
        '123 Main Street, Hong Kong, Central', // District last
        '123, Central, Main Street, Hong Kong' // District middle
      ];

      testCases.forEach((address) => {
        const result = extractDistrictFromAddress(address);
        expect(result).toBe('CW');
      });
    });
  });

  describe('Specific Hong Kong districts', () => {
    it('should identify all major Hong Kong districts', () => {
      const testCases = [
        { district: 'Central & Western', key: 'CW' },
        { district: 'Eastern', key: 'EST' },
        { district: 'Southern', key: 'STH' },
        { district: 'Wan Chai', key: 'WC' },
        { district: 'Sham Shui Po', key: 'SSP' },
        { district: 'Kowloon City', key: 'KLC' },
        { district: 'Kwun Tong', key: 'KT' },
        { district: 'Wong Tai Sin', key: 'WTS' },
        { district: 'Yau Tsim Mong', key: 'YTM' },
        { district: 'Islands', key: 'ILD' },
        { district: 'Kwai Tsing', key: 'KC' },
        { district: 'North', key: 'NTH' },
        { district: 'Sai Kung', key: 'SK' },
        { district: 'Sha Tin', key: 'ST' },
        { district: 'Tai Po', key: 'TP' },
        { district: 'Tsuen Wan', key: 'TW' },
        { district: 'Tuen Mun', key: 'TM' },
        { district: 'Yuen Long', key: 'YL' }
      ];

      testCases.forEach(({ district, key }) => {
        const address = `123 Main Street, ${district}, Hong Kong`;
        const result = extractDistrictFromAddress(address);
        expect(result).toBe(key);
      });
    });
  });
});
