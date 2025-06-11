// I18N
import { describe, it, expect } from 'vitest';
import { supportedLocales, SupportedLocales } from '$lib/enums';
// MESSAGE FILES
import enMessages from '../../messages/en.json';
import zhHantMessages from '../../messages/zh-hant.json';
import zhHansMessages from '../../messages/zh-hans.json';

/**
 * I18N Message Validation Tests
 * 
 * These tests ensure that:
 * 1. All supported languages have message files
 * 2. All languages have the same message keys (no missing translations)
 * 3. No keys are empty or undefined
 * 4. Message structure is consistent across languages
 */
describe('I18N Message Validation', () => {
  // MESSAGE FILES MAP
  const messageFiles = {
    [SupportedLocales.en]: enMessages,
    [SupportedLocales['zh-hant']]: zhHantMessages,
    [SupportedLocales['zh-hans']]: zhHansMessages
  };

  // HELPER FUNCTIONS
  const getAllKeys = (obj: Record<string, any>, prefix = ''): string[] => {
    const keys: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object - recurse
        keys.push(...getAllKeys(value, fullKey));
      } else {
        // Leaf value
        keys.push(fullKey);
      }
    }
    
    return keys.sort();
  };

  const getEmptyKeys = (obj: Record<string, any>, prefix = ''): string[] => {
    const emptyKeys: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object - recurse
        emptyKeys.push(...getEmptyKeys(value, fullKey));
      } else {
        // Check if leaf value is empty
        if (value === '' || value === null || value === undefined) {
          emptyKeys.push(fullKey);
        }
      }
    }
    
    return emptyKeys;
  };

  it('should have message files for all supported locales', () => {
    supportedLocales.forEach(locale => {
      expect(messageFiles[locale]).toBeDefined();
      expect(typeof messageFiles[locale]).toBe('object');
      expect(messageFiles[locale]).not.toBeNull();
    });
  });

  it('should have consistent message keys across all languages', () => {
    // Get all keys from each language
    const keysByLocale = supportedLocales.reduce((acc, locale) => {
      acc[locale] = getAllKeys(messageFiles[locale]);
      return acc;
    }, {} as Record<string, string[]>);

    // Use English as the reference language
    const referenceKeys = keysByLocale[SupportedLocales.en];
    expect(referenceKeys.length).toBeGreaterThan(0);

    // Check each other language has the same keys
    supportedLocales.forEach(locale => {
      if (locale === SupportedLocales.en) return;

      const localeKeys = keysByLocale[locale];
      
      // Check for missing keys in this locale
      const missingKeys = referenceKeys.filter(key => !localeKeys.includes(key));
      expect(missingKeys, `Missing keys in ${locale}: ${missingKeys.join(', ')}`).toHaveLength(0);

      // Check for extra keys in this locale
      const extraKeys = localeKeys.filter(key => !referenceKeys.includes(key));
      expect(extraKeys, `Extra keys in ${locale}: ${extraKeys.join(', ')}`).toHaveLength(0);

      // Keys should be identical
      expect(localeKeys).toEqual(referenceKeys);
    });
  });

  it('should not have any empty or undefined message values', () => {
    supportedLocales.forEach(locale => {
      const emptyKeys = getEmptyKeys(messageFiles[locale]);
      expect(emptyKeys, `Empty/undefined values in ${locale}: ${emptyKeys.join(', ')}`).toHaveLength(0);
    });
  });

  it('should have non-empty message files', () => {
    supportedLocales.forEach(locale => {
      const keys = getAllKeys(messageFiles[locale]);
      expect(keys.length, `${locale} message file should not be empty`).toBeGreaterThan(0);
    });
  });

  it('should have consistent structure depth across languages', () => {
    const getMaxDepth = (obj: Record<string, any>, currentDepth = 0): number => {
      let maxDepth = currentDepth;
      
      for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          maxDepth = Math.max(maxDepth, getMaxDepth(value, currentDepth + 1));
        }
      }
      
      return maxDepth;
    };

    const depths = supportedLocales.map(locale => ({
      locale,
      depth: getMaxDepth(messageFiles[locale])
    }));

    // All languages should have the same maximum nesting depth
    const referenceDepth = depths[0].depth;
    depths.forEach(({ locale, depth }) => {
      expect(depth, `${locale} has different nesting depth (${depth}) than reference (${referenceDepth})`).toBe(referenceDepth);
    });
  });

  it('should use supported locale keys correctly', () => {
    // Verify that the message file keys match exactly with our supported locales
    const messageFileLocales = Object.keys(messageFiles).sort();
    const expectedLocales = supportedLocales.slice().sort();
    
    expect(messageFileLocales).toEqual(expectedLocales);
  });

  // DIAGNOSTIC INFORMATION
  it('should provide diagnostic information about message coverage', () => {
    const diagnostics = supportedLocales.map(locale => {
      const keys = getAllKeys(messageFiles[locale]);
      const emptyKeys = getEmptyKeys(messageFiles[locale]);
      
      return {
        locale,
        totalKeys: keys.length,
        emptyKeys: emptyKeys.length,
        coverage: ((keys.length - emptyKeys.length) / keys.length * 100).toFixed(2) + '%'
      };
    });

    // Log diagnostic information (this will show in test output)
    console.table(diagnostics);

    // All languages should have 100% coverage (no empty keys)
    diagnostics.forEach(({ locale, emptyKeys }) => {
      expect(emptyKeys, `${locale} should have no empty keys`).toBe(0);
    });
  });
}); 