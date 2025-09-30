// VITEST
import { describe, it, expect } from 'vitest';
// TEST DATA
import testData from './geoparsing-test-data.json';
// PARSING FUNCTIONS
import { parseSubPremisesComponent, parseLot } from '$lib/utils/geo/parsing';
// TYPES
import type { Locale } from '$lib/types';

describe('SubPremises Extraction Tests', () => {
  describe('Basic extraction from test data', () => {
    it('should extract unit information from test addresses', () => {
      const addressesWithUnits = testData.testAddresses.filter(
        (testCase) => testCase.extracted.unitNumber || testCase.extracted.unitType
      );

      console.log(`Found ${addressesWithUnits.length} addresses with unit information`);

      addressesWithUnits.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected unitNumber: ${testCase.extracted.unitNumber}`);
        console.log(`Expected unitType: ${testCase.extracted.unitType}`);

        // For now, we'll just verify the data exists - extraction functions will be implemented later
        expect(
          testCase.extracted.unitNumber || testCase.extracted.unitType
        ).toBeDefined();
      });
    });

    it('should extract floor information from test addresses', () => {
      const addressesWithFloors = testData.testAddresses.filter(
        (testCase) => testCase.extracted.floorNumber || testCase.extracted.floorType
      );

      console.log(
        `Found ${addressesWithFloors.length} addresses with floor information`
      );

      addressesWithFloors.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected floorNumber: ${testCase.extracted.floorNumber}`);
        console.log(`Expected floorType: ${testCase.extracted.floorType}`);

        expect(
          testCase.extracted.floorNumber || testCase.extracted.floorType
        ).toBeDefined();
      });
    });

    it('should extract unit portion information from test addresses', () => {
      const addressesWithPortions = testData.testAddresses.filter(
        (testCase) => testCase.extracted.unitPortion
      );

      console.log(
        `Found ${addressesWithPortions.length} addresses with unit portion information`
      );

      addressesWithPortions.forEach((testCase) => {
        console.log(`Testing: "${testCase.address}"`);
        console.log(`Expected unitPortion: ${testCase.extracted.unitPortion}`);

        expect(testCase.extracted.unitPortion).toBeDefined();
      });
    });
  });

  describe('Edge cases and formatting issues', () => {
    it('should handle "Shop No." pattern correctly', () => {
      const testCases = [
        {
          subPremises: 'Shop No. 2, G/F',
          expected: {
            unitType: 'Shop',
            unitNumber: '2',
            floorType: 'Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Shop No. 8, Floor 2',
          expected: {
            unitType: 'Shop',
            unitNumber: '8',
            floorType: 'Floor',
            floorNumber: '2'
          }
        },
        {
          subPremises: 'Unit No. 101, 1/F',
          expected: {
            unitType: 'Unit',
            unitNumber: '101',
            floorType: 'Floor',
            floorNumber: '1'
          }
        },
        {
          subPremises: 'Suite No. 12A, 3/F',
          expected: {
            unitType: 'Suite',
            unitNumber: '12A',
            floorType: 'Floor',
            floorNumber: '3'
          }
        }
      ];

      testCases.forEach(({ subPremises, expected }) => {
        console.log(`Testing "No." pattern: "${subPremises}"`);
        console.log(`Expected:`, expected);

        const result = parseSubPremisesComponent(subPremises, 'en');
        console.log(`Actual result:`, result);

        expect(result.unitType).toBe(expected.unitType);
        expect(result.unitNumber).toBe(expected.unitNumber);
        expect(result.floorType).toBe(expected.floorType);
        expect(result.floorNumber).toBe(expected.floorNumber);
      });
    });

    it('should handle complex floor patterns correctly', () => {
      const testCases = [
        {
          subPremises: 'Basement - 1/F',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Basement - 1/F',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Lg/F & G/F',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'LG/F & G/F',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Basement & G/F Portion',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Basement & G/F',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Upper Ground Floor',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Upper Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Lower Ground Floor',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Lower Ground',
            floorNumber: undefined
          }
        }
      ];

      testCases.forEach(({ subPremises, expected }) => {
        console.log(`Testing complex floor pattern: "${subPremises}"`);
        console.log(`Expected:`, expected);

        const result = parseSubPremisesComponent(subPremises, 'en');
        console.log(`Actual result:`, result);

        expect(result.unitType).toBe(expected.unitType);
        expect(result.unitNumber).toBe(expected.unitNumber);
        expect(result.floorType).toBe(expected.floorType);
        expect(result.floorNumber).toBe(expected.floorNumber);
      });
    });

    it('should handle complex unit and floor combinations', () => {
      const testCases = [
        {
          subPremises: 'Unit 1-15 & 17-22 LG/F',
          expected: {
            unitType: 'Unit',
            unitNumber: '1-15 & 17-22',
            floorType: 'Lower Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'The whole of Basement',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Basement',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'G/F Entrance plus Basement',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Basement & Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'L2',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Level',
            floorNumber: '2'
          }
        },
        {
          subPremises:
            'All Shops Nos. 2-021 - 2-066 and portion of Corridor on Level 2',
          expected: {
            unitType: 'Shop',
            unitNumber: '2-021 - 2-066',
            floorType: 'Level',
            floorNumber: '2'
          }
        },
        {
          subPremises: 'Shop No. B10A on Basement 1 Floor',
          expected: {
            unitType: 'Shop',
            unitNumber: 'B10A',
            floorType: 'Basement',
            floorNumber: '1'
          }
        },
        {
          subPremises: 'Shop Unit G51, G/F',
          expected: {
            unitType: 'Shop',
            unitNumber: 'G51',
            floorType: 'Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Levels 5 & 6',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Level',
            floorNumber: '5 & 6'
          }
        },
        {
          subPremises: 'Shop UNITS 101–102 & 219–220, 1/F',
          expected: {
            unitType: 'Shop',
            unitNumber: '101–102 & 219–220',
            floorType: 'Floor',
            floorNumber: '1'
          }
        },
        {
          subPremises: 'LG',
          expected: {
            unitType: undefined,
            unitNumber: undefined,
            floorType: 'Lower Ground',
            floorNumber: undefined
          }
        }
      ];

      testCases.forEach(({ subPremises, expected }) => {
        console.log(`Testing complex unit/floor combination: "${subPremises}"`);
        console.log(`Expected:`, expected);

        const result = parseSubPremisesComponent(subPremises, 'en');
        console.log(`Actual result:`, result);

        expect(result.unitType).toBe(expected.unitType);
        expect(result.unitNumber).toBe(expected.unitNumber);
        expect(result.floorType).toBe(expected.floorType);
        expect(result.floorNumber).toBe(expected.floorNumber);
      });
    });

    it('should handle multi-floor unit combinations with semicolon notation', () => {
      const testCases = [
        {
          subPremises: 'Shop No. 401, Level 4 and Entrance Lobby on Level 3',
          expected: {
            unitType: 'Shop',
            unitNumber: '401',
            floorType: 'Level',
            floorNumber: '3;4'
          }
        },
        {
          subPremises: 'Shop 9-22, 26-34',
          expected: {
            unitType: 'Shop',
            unitNumber: '9-22 & 26-34',
            floorType: undefined,
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Shop Nos. G03 and G04, G/F',
          expected: {
            unitType: 'Shop',
            unitNumber: 'G03 & G04',
            floorType: 'Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Shop No. 5 G/F',
          expected: {
            unitType: 'Shop',
            unitNumber: '5',
            floorType: 'Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises: 'Shops C-E on G/F',
          expected: {
            unitType: 'Shop',
            unitNumber: 'C-E',
            floorType: 'Ground',
            floorNumber: undefined
          }
        },
        {
          subPremises:
            'Units 1 to 18 and 24 to 46 on Level 1 and Units 1 to 23 and 35 to 58 on Level 2',
          expected: {
            unitType: 'Unit',
            unitNumber: '1-18 & 24-46;1-23 & 35-58',
            floorType: 'Level',
            floorNumber: '1;2'
          }
        },
        {
          subPremises: 'P27, Podium',
          expected: {
            unitType: undefined,
            unitNumber: 'P27',
            floorType: 'Podium',
            floorNumber: undefined
          }
        },
        {
          subPremises:
            'Shop Nos. 101, 102, 106 & 107 on 1/F and Shop Nos. 201, 202 & 208 on 2/F',
          expected: {
            unitType: 'Shop',
            unitNumber: '101, 102, 106 & 107;201, 202 & 208',
            floorType: 'Floor',
            floorNumber: '1;2'
          }
        }
      ];

      testCases.forEach(({ subPremises, expected }) => {
        console.log(`Testing multi-floor unit combination: "${subPremises}"`);
        console.log(`Expected:`, expected);

        const result = parseSubPremisesComponent(subPremises, 'en');
        console.log(`Actual result:`, result);

        expect(result.unitType).toBe(expected.unitType);
        expect(result.unitNumber).toBe(expected.unitNumber);
        expect(result.floorType).toBe(expected.floorType);
        expect(result.floorNumber).toBe(expected.floorNumber);
      });
    });

    it('should handle missing commas in unit specifications', () => {
      const testCases = [
        'Unit 101-109 & 120 1/F Jardine House 1 Connaught Place Central Hong Kong',
        "Shop A G/F Central House Nos. 270 - 276 Queen'S Road Central Hong Kong",
        'Flat/Rm 906 BLK 1 9/F Kowloon Commercial Centre',
        'Stall 58 37 Siu Sai Wan Market Chai Wan'
      ];

      testCases.forEach((address) => {
        console.log(`Testing missing commas: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle non-standard abbreviations', () => {
      const testCases = [
        'U. 101-109 & 120, 1/F, Jardine House', // U. instead of Unit
        'S. A, G/F, Central House', // S. instead of Shop
        'F/Rm 906, BLK 1, 9/F', // F/Rm instead of Flat/Rm
        'St. 58, 37, Siu Sai Wan Market' // St. instead of Stall
      ];

      testCases.forEach((address) => {
        console.log(`Testing non-standard abbreviations: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle extra punctuation and fullstops', () => {
      const testCases = [
        'Unit. 101-109 & 120., 1/F., Jardine House.',
        'Shop. A., G/F., Central House..',
        'Flat./Rm. 906., BLK. 1., 9/F.',
        'Stall. 58., 37., Siu Sai Wan Market.'
      ];

      testCases.forEach((address) => {
        console.log(`Testing extra punctuation: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle inverted order (floor before unit)', () => {
      const testCases = [
        '1/F, Unit 101-109 & 120, Jardine House',
        'G/F, Shop A, Central House',
        '9/F, Flat/Rm 906, BLK 1, Kowloon Commercial Centre',
        'Ground Floor, Stall 58, 37, Siu Sai Wan Market'
      ];

      testCases.forEach((address) => {
        console.log(`Testing inverted order: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle complex unit specifications', () => {
      const testCases = [
        'Units 101–102 & 219–220, 1/F, Maritime Square',
        'Shop Nos. 101, 102, 106 & 107 On 1/F And Shop Nos. 201, 202 & 208 On 2/F, Domain',
        'Unit 1-15 & 17-22 Lg/F, C C Wu Building',
        'Shop G1–G3, G/F, Windsor House'
      ];

      testCases.forEach((address) => {
        console.log(`Testing complex units: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle mixed case and inconsistent spacing', () => {
      const testCases = [
        'UNIT 101-109 & 120, 1/F, jardine house',
        'SHOP A, g/f, CENTRAL HOUSE',
        'flat/rm 906, blk 1, 9/F',
        'StAll 58, 37, SIU SAI WAN MARKET'
      ];

      testCases.forEach((address) => {
        console.log(`Testing mixed case: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Floor type variations', () => {
    it('should handle different floor type notations', () => {
      const testCases = [
        'Unit 101, Ground Floor, Building',
        'Shop A, First Floor, Building',
        'Flat 906, Lower Ground Floor, Building',
        'Stall 58, Upper Ground Floor, Building',
        'Unit 101, Basement, Building',
        'Shop A, Mezzanine, Building',
        'Flat 906, Roof, Building',
        'Stall 58, Concourse, Building'
      ];

      testCases.forEach((address) => {
        console.log(`Testing floor types: "${address}"`);
        // TODO: Implement extraction and test
      });
    });

    it('should handle floor number ranges', () => {
      const testCases = [
        'Unit 101, Levels 5 & 6, Building',
        'Shop A, Floors 1-3, Building',
        'Flat 906, 9-10/F, Building',
        'Stall 58, Ground & First Floor, Building'
      ];

      testCases.forEach((address) => {
        console.log(`Testing floor ranges: "${address}"`);
        // TODO: Implement extraction and test
      });
    });
  });

  describe('Lot parsing', () => {
    it('should parse Hong Kong lot types correctly', () => {
      const testCases = [
        {
          address: 'G/F, DD253, Lot 1177, Razor Hill, Clear Water Bay, Sai Kung, N.T.',
          lotSegment: 'DD253, Lot 1177',
          expected: {
            lotType: 'DD',
            lotNumber: '1177',
            demarcationDistrict: '253'
          }
        },
        {
          address: 'Shop A, IL 5678, Central, Hong Kong',
          lotSegment: 'IL 5678',
          expected: {
            lotType: 'IL',
            lotNumber: '5678',
            demarcationDistrict: undefined
          }
        },
        {
          address: 'Unit 1, KIL 1234, Kowloon',
          lotSegment: 'KIL 1234',
          expected: {
            lotType: 'KIL',
            lotNumber: '1234',
            demarcationDistrict: undefined
          }
        },
        {
          address: 'G/F, N.K.I.L. 567, New Kowloon',
          lotSegment: 'N.K.I.L. 567',
          expected: {
            lotType: 'NKIL',
            lotNumber: '567',
            demarcationDistrict: undefined
          }
        },
        {
          address: 'Shop 1, S.H.T.L. 890, Sha Tin',
          lotSegment: 'S.H.T.L. 890',
          expected: {
            lotType: 'SHTL',
            lotNumber: '890',
            demarcationDistrict: undefined
          }
        }
      ];

      testCases.forEach(({ address, lotSegment, expected }) => {
        console.log(`Testing lot parsing: "${lotSegment}" from "${address}"`);
        console.log(`Expected:`, expected);

        const result = parseLot(lotSegment);
        console.log(`Actual result:`, result);

        expect(result.lotType).toBe(expected.lotType);
        expect(result.lotNumber).toBe(expected.lotNumber);
        expect(result.demarcationDistrict).toBe(expected.demarcationDistrict);
      });
    });
  });
});
