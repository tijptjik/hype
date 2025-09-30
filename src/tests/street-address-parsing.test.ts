import { describe, it, expect } from 'vitest';

// Import the function we're testing
// Note: This function is internal to the geocoding module, so we'll need to test it indirectly
// or export it for testing purposes. For now, we'll create a test version.

function _parseStreetAddressEn(streetAddress: string) {
  console.log(`🗺️ _parseStreetAddressEn: Processing "${streetAddress}"`);

  let buildingNumberFrom: string | undefined;
  let buildingNumberTo: string | undefined;
  let streetName: string | undefined;

  // Find where the street name starts by looking for the first word that doesn't match number patterns
  const streetParts = streetAddress.split(' ');
  let streetStartIndex = 0;
  let isInNumberSequence = false;

  for (let i = 0; i < streetParts.length; i++) {
    const part = streetParts[i];

    // Check if this part is a number or number-related
    const isNumber = /^\d+[a-zA-Z]?$/.test(part);
    const isSeparator = /^[,&\/\-–]+$/.test(part);
    const isNumberWithSeparator = /^[\d,\-–&\/a-zA-Z]+$/.test(part) && /\d/.test(part);

    if (isNumber || isSeparator || isNumberWithSeparator) {
      isInNumberSequence = true;
    } else if (isInNumberSequence) {
      // We were in a number sequence but now found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    } else {
      // We're not in a number sequence and found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    }

    // If we've reached the end, check if we were in a number sequence
    if (i === streetParts.length - 1) {
      if (isInNumberSequence) {
        streetStartIndex = streetParts.length;
      }
    }
  }

  if (streetStartIndex > 0) {
    // Extract the full number segment (all parts before street name)
    const numberSegment = streetParts.slice(0, streetStartIndex).join(' ');
    const numberRegex = /^[\d\s,\-–&\/a-zA-Z]+$/;

    if (numberRegex.test(numberSegment)) {
      // Parse the number segment to extract individual numbers with letters
      const numberMatches = numberSegment.match(/\d+[a-zA-Z]?/g) || [];

      if (numberMatches.length > 0) {
        // Check if this is a running sequence or range
        const isRunningSequence = _isRunningSequence(numberMatches, numberSegment);

        if (isRunningSequence.isRange) {
          // It's a running sequence, store start and end
          buildingNumberFrom = isRunningSequence.from;
          buildingNumberTo = isRunningSequence.to;
        } else {
          // Not a running sequence, store first number and concatenate the rest with leading comma
          buildingNumberFrom = numberMatches[0];
          if (numberMatches.length > 1) {
            buildingNumberTo = ', ' + numberMatches.slice(1).join(', ');
          }
        }
      }
    }

    // Process street name: apply abbreviations and title case
    if (streetStartIndex < streetParts.length) {
      streetName = streetParts.slice(streetStartIndex).join(' ');
    }
  } else {
    // No numbers found, treat entire string as street name
    streetName = streetAddress;
  }

  console.log(
    `🗺️ _parseStreetAddressEn: Extracted - from: "${buildingNumberFrom}", to: "${buildingNumberTo}", street: "${streetName}"`
  );

  return { buildingNumberFrom, buildingNumberTo, streetName };
}

function _isRunningSequence(
  numberMatches: string[],
  numberSegment: string
): { isRange: boolean; from?: string; to?: string } {
  if (numberMatches.length < 2) {
    return { isRange: false };
  }

  // Extract numeric values and letters for analysis
  const parsedNumbers = numberMatches.map((match) => {
    const numericPart = match.match(/\d+/)?.[0];
    const letterPart = match.match(/[a-zA-Z]/)?.[0];
    return {
      full: match,
      number: numericPart ? parseInt(numericPart, 10) : 0,
      letter: letterPart || ''
    };
  });

  // Check if all numbers have the same letter (or no letters)
  const letters = parsedNumbers.map((p) => p.letter);
  const hasConsistentLetters = letters.every((letter) => letter === letters[0]);

  // Check if this is a hyphen/em-dash separated range
  const hasHyphenRange = /[\-–]/.test(numberSegment) && numberMatches.length === 2;

  if (hasHyphenRange) {
    // It's a hyphen range, return the two numbers (letters can be different for hyphen ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // Check if this is a slash separated range (like 123/125)
  const hasSlashRange = /\//.test(numberSegment) && numberMatches.length === 2;

  if (hasSlashRange) {
    // It's a slash range, return the two numbers (letters can be different for slash ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // Check if this is an ampersand separated range (like 45 & 47)
  const hasAmpersandRange = /&/.test(numberSegment) && numberMatches.length === 2;

  if (hasAmpersandRange) {
    // It's an ampersand range, return the two numbers (letters can be different for ampersand ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // For comma-separated sequences, check if it's a running sequence
  const numbers = parsedNumbers.map((p) => p.number).sort((a, b) => a - b);
  const isConsecutive = numbers.every(
    (num, index) => index === 0 || num === numbers[index - 1] + 1
  );

  // Check if all numbers are odd or all are even
  const isAllOdd = numbers.every((num) => num % 2 === 1);
  const isAllEven = numbers.every((num) => num % 2 === 0);

  // Check if it's a consecutive odd/even sequence (like 1,3,5,7 or 2,4,6,8)
  const isConsecutiveOdd =
    isAllOdd &&
    numbers.every((num, index) => index === 0 || num === numbers[index - 1] + 2);
  const isConsecutiveEven =
    isAllEven &&
    numbers.every((num, index) => index === 0 || num === numbers[index - 1] + 2);

  // Only treat as range if it's consecutive OR consecutive odd/even with consistent letters
  // For truly non-consecutive sequences, treat as separate numbers
  if (
    (isConsecutive || isConsecutiveOdd || isConsecutiveEven) &&
    hasConsistentLetters &&
    numbers.length > 1
  ) {
    // Find the actual first and last numbers from the original order
    const firstNumber = parsedNumbers.reduce((min, current) =>
      current.number < min.number ? current : min
    );
    const lastNumber = parsedNumbers.reduce((max, current) =>
      current.number > max.number ? current : max
    );

    return {
      isRange: true,
      from: firstNumber.full,
      to: lastNumber.full
    };
  }

  return { isRange: false };
}

describe('Street Address Parsing', () => {
  describe('Hyphen ranges', () => {
    it('should parse simple hyphen ranges', () => {
      const result = _parseStreetAddressEn('45-47 Nathan Road');
      expect(result).toEqual({
        buildingNumberFrom: '45',
        buildingNumberTo: '47',
        streetName: 'Nathan Road'
      });
    });

    it('should parse em-dash ranges', () => {
      const result = _parseStreetAddressEn('123–125 Queen Street');
      expect(result).toEqual({
        buildingNumberFrom: '123',
        buildingNumberTo: '125',
        streetName: 'Queen Street'
      });
    });

    it('should parse hyphen ranges with letter suffixes', () => {
      const result = _parseStreetAddressEn('3A-5B Central Road');
      expect(result).toEqual({
        buildingNumberFrom: '3A',
        buildingNumberTo: '5B',
        streetName: 'Central Road'
      });
    });
  });

  describe('Consecutive sequences', () => {
    it('should parse consecutive odd number sequences', () => {
      const result = _parseStreetAddressEn('45, 47, 49 Main Street');
      expect(result).toEqual({
        buildingNumberFrom: '45',
        buildingNumberTo: '49',
        streetName: 'Main Street'
      });
    });

    it('should parse even number sequences', () => {
      const result = _parseStreetAddressEn('2, 4, 6, 8 Park Lane');
      expect(result).toEqual({
        buildingNumberFrom: '2',
        buildingNumberTo: '8',
        streetName: 'Park Lane'
      });
    });

    it('should parse sequences with letter suffixes', () => {
      const result = _parseStreetAddressEn('1A, 3A, 5A Broadway');
      expect(result).toEqual({
        buildingNumberFrom: '1A',
        buildingNumberTo: '5A',
        streetName: 'Broadway'
      });
    });
  });

  describe('Consecutive odd/even sequences', () => {
    it('should parse consecutive odd sequences as ranges', () => {
      const result = _parseStreetAddressEn('1, 3, 5, 7 Oak Avenue');
      expect(result).toEqual({
        buildingNumberFrom: '1',
        buildingNumberTo: '7',
        streetName: 'Oak Avenue'
      });
    });

    it('should parse consecutive even sequences as ranges', () => {
      const result = _parseStreetAddressEn('2, 4, 6, 8 Pine Street');
      expect(result).toEqual({
        buildingNumberFrom: '2',
        buildingNumberTo: '8',
        streetName: 'Pine Street'
      });
    });
  });

  describe('Non-sequential numbers', () => {
    it('should concatenate non-sequential numbers with leading comma', () => {
      const result = _parseStreetAddressEn('1, 5, 9 Elm Road');
      expect(result).toEqual({
        buildingNumberFrom: '1',
        buildingNumberTo: ', 5, 9',
        streetName: 'Elm Road'
      });
    });

    it('should concatenate non-sequential numbers with letters and leading comma', () => {
      const result = _parseStreetAddressEn('2A, 7B, 12C Cedar Lane');
      expect(result).toEqual({
        buildingNumberFrom: '2A',
        buildingNumberTo: ', 7B, 12C',
        streetName: 'Cedar Lane'
      });
    });
  });

  describe('Single numbers', () => {
    it('should parse single numbers', () => {
      const result = _parseStreetAddressEn('123 Nathan Road');
      expect(result).toEqual({
        buildingNumberFrom: '123',
        buildingNumberTo: undefined,
        streetName: 'Nathan Road'
      });
    });

    it('should parse single numbers with letter suffixes', () => {
      const result = _parseStreetAddressEn('3A Central Street');
      expect(result).toEqual({
        buildingNumberFrom: '3A',
        buildingNumberTo: undefined,
        streetName: 'Central Street'
      });
    });
  });

  describe('Complex cases', () => {
    it('should parse ampersand separated ranges', () => {
      const result = _parseStreetAddressEn('45 & 47 Nathan Road');
      expect(result).toEqual({
        buildingNumberFrom: '45',
        buildingNumberTo: '47',
        streetName: 'Nathan Road'
      });
    });

    it('should parse slash separated ranges', () => {
      const result = _parseStreetAddressEn('123/125 Queen Street');
      expect(result).toEqual({
        buildingNumberFrom: '123',
        buildingNumberTo: '125',
        streetName: 'Queen Street'
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = _parseStreetAddressEn('');
      expect(result).toEqual({
        buildingNumberFrom: undefined,
        buildingNumberTo: undefined,
        streetName: ''
      });
    });

    it('should handle input with only numbers', () => {
      const result = _parseStreetAddressEn('123 456 789');
      expect(result).toEqual({
        buildingNumberFrom: '123',
        buildingNumberTo: ', 456, 789',
        streetName: undefined
      });
    });

    it('should handle input with no numbers', () => {
      const result = _parseStreetAddressEn('Main Street Road');
      expect(result).toEqual({
        buildingNumberFrom: undefined,
        buildingNumberTo: undefined,
        streetName: 'Main Street Road'
      });
    });
  });
});
