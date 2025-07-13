#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Extracts all translatable string values from a translation object
 * Handles both simple strings and complex objects with pluralization rules
 */
function extractValues(obj, path = '') {
  const values = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === 'string') {
      // Simple string value
      values.push({ path: currentPath, value });
    } else if (Array.isArray(value)) {
      // Handle pluralization arrays
      value.forEach((item, index) => {
        if (typeof item === 'object' && item.match) {
          // Extract values from pluralization match objects
          Object.values(item.match).forEach((matchValue) => {
            if (typeof matchValue === 'string') {
              values.push({
                path: `${currentPath}[${index}].match`,
                value: matchValue
              });
            }
          });
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively handle nested objects
      values.push(...extractValues(value, currentPath));
    }
  }

  return values;
}

/**
 * Find duplicate values in translation file
 */
function findDuplicates() {
  try {
    // Read and parse the English translation file
    const filePath = join(process.cwd(), 'messages', 'en.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(fileContent);

    // Extract all values with their paths
    const allValues = extractValues(translations);

    // Group by value to find duplicates
    const valueGroups = new Map();

    allValues.forEach(({ path, value }) => {
      // Normalize value for comparison (trim whitespace, ignore case differences in HTML)
      const normalizedValue = value.trim();

      if (!valueGroups.has(normalizedValue)) {
        valueGroups.set(normalizedValue, []);
      }
      valueGroups.get(normalizedValue).push(path);
    });

    // Find duplicates (values that appear more than once)
    const duplicates = [];
    valueGroups.forEach((paths, value) => {
      if (paths.length > 1) {
        duplicates.push({ value, paths });
      }
    });

    // Report results
    console.log('🔍 Duplicate Translation Detection Results\n');
    console.log(`📊 Total translation entries: ${allValues.length}`);
    console.log(`🔢 Unique values: ${valueGroups.size}`);
    console.log(`🔄 Duplicate values found: ${duplicates.length}\n`);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate values found! All translations are unique.');
      return;
    }

    // Display duplicates
    console.log('🚨 Duplicate Values:\n');
    duplicates
      .sort((a, b) => b.paths.length - a.paths.length) // Sort by number of occurrences
      .forEach(({ value, paths }, index) => {
        console.log(`${index + 1}. "${value}"`);
        console.log(`   Used in ${paths.length} places:`);
        paths.forEach((path) => {
          console.log(`   - ${path}`);
        });
        console.log('');
      });

    // Summary
    const totalDuplicateInstances = duplicates.reduce(
      (sum, dup) => sum + dup.paths.length,
      0
    );
    const wastedEntries = totalDuplicateInstances - duplicates.length;

    console.log(`📈 Summary:`);
    console.log(`   - ${duplicates.length} unique values have duplicates`);
    console.log(`   - ${totalDuplicateInstances} total duplicate instances`);
    console.log(`   - ${wastedEntries} potentially redundant entries`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
findDuplicates();
