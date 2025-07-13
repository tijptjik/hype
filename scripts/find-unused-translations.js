#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Extracts all translation keys from a translation object
 * Handles both simple strings and complex objects with pluralization rules
 */
function extractKeys(obj, prefix = '') {
  const keys = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Simple string value - add the key
      keys.push(fullKey);
    } else if (Array.isArray(value)) {
      // Handle pluralization arrays - the key itself is what's used in code
      keys.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively handle nested objects
      keys.push(...extractKeys(value, fullKey));
    }
  }

  return keys;
}

/**
 * Search for a key in the codebase using grep
 */
function searchForKey(key) {
  try {
    // Search for the key in various patterns:
    // 1. m.key_name() - function call pattern
    // 2. "key_name" - string literal
    // 3. 'key_name' - string literal with single quotes
    // 4. key_name - bare identifier (less common but possible)

    const patterns = [
      `m\\.${key}\\(`, // m.key_name(
      `"${key}"`, // "key_name"
      `'${key}'`, // 'key_name'
      `\\b${key}\\b` // word boundary match
    ];

    for (const pattern of patterns) {
      try {
        // Search in /src/ excluding /src/lib/paraglide
        const result = execSync(
          `grep -r --include="*.ts" --include="*.js" --include="*.svelte" -l "${pattern}" src/ | grep -v "src/lib/paraglide"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );

        if (result.trim()) {
          return true; // Found at least one occurrence
        }
      } catch (grepError) {
        // grep returns non-zero exit code when no matches found
        // This is expected, so we continue to the next pattern
      }
    }

    return false; // No matches found with any pattern
  } catch (error) {
    // If there's an unexpected error, assume the key is used to be safe
    console.error(`Error searching for key "${key}": ${error.message}`);
    return true;
  }
}

/**
 * Find unused translation keys
 */
function findUnusedKeys() {
  try {
    console.log('🔍 Searching for unused translation keys...\n');

    // Read and parse the English translation file
    const filePath = join(process.cwd(), 'messages', 'en.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(fileContent);

    // Extract all keys
    const allKeys = extractKeys(translations);
    console.log(`📊 Total translation keys: ${allKeys.length}`);

    // Filter out schema key as it's metadata
    const keysToCheck = allKeys.filter((key) => key !== '$schema');
    console.log(`🔎 Keys to check: ${keysToCheck.length}\n`);

    // Check each key
    const unusedKeys = [];
    const usedKeys = [];

    console.log('Checking keys...');
    for (let i = 0; i < keysToCheck.length; i++) {
      const key = keysToCheck[i];
      const isUsed = searchForKey(key);

      if (isUsed) {
        usedKeys.push(key);
      } else {
        unusedKeys.push(key);
      }

      // Progress indicator
      if ((i + 1) % 50 === 0 || i === keysToCheck.length - 1) {
        console.log(`Progress: ${i + 1}/${keysToCheck.length} keys checked`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 RESULTS');
    console.log('='.repeat(60));

    console.log(`✅ Used keys: ${usedKeys.length}`);
    console.log(`❌ Unused keys: ${unusedKeys.length}`);

    if (unusedKeys.length === 0) {
      console.log('\n🎉 No unused keys found! All translations are being used.');
      return;
    }

    console.log(`\n🗑️  UNUSED TRANSLATION KEYS (${unusedKeys.length}):`);
    console.log('─'.repeat(60));

    // Group unused keys by prefix for better organization
    const groupedKeys = {};
    unusedKeys.forEach((key) => {
      const prefix = key.includes('__') ? key.split('__')[0] : 'other';
      if (!groupedKeys[prefix]) {
        groupedKeys[prefix] = [];
      }
      groupedKeys[prefix].push(key);
    });

    // Display grouped results
    Object.entries(groupedKeys)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([prefix, keys]) => {
        console.log(`\n📁 ${prefix.toUpperCase()}:`);
        keys.sort().forEach((key) => {
          console.log(`   ${key}`);
        });
      });

    console.log('\n💡 SUGGESTIONS:');
    console.log('   • Review these keys to confirm they are truly unused');
    console.log('   • Some keys might be used dynamically or in generated code');
    console.log('   • Consider removing confirmed unused keys to reduce bundle size');
    console.log(
      '   • Update corresponding translation files (zh-hans.json, zh-hant.json)'
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
findUnusedKeys();
