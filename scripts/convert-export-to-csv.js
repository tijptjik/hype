#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root directory (two levels up from scripts)
const projectRoot = path.join(__dirname, '..');

// Function to find the most recent export file
function findMostRecentExportFile() {
  const exportDir = path.join('/home/io/downloads');

  // Create exports directory if it doesn't exist
  if (!fs.existsSync(exportDir)) {
    console.log('No exports directory found. Please run the export first.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(exportDir)
    .filter(
      (file) =>
        file.startsWith('hype.hk-batch-upload-results-') && file.endsWith('.json')
    )
    .sort()
    .reverse(); // Most recent first

  if (files.length === 0) {
    console.log('No export files found in exports directory.');
    process.exit(1);
  }

  return path.join(exportDir, files[0]);
}

// Function to flatten nested objects for CSV
function flattenObject(obj, prefix = '') {
  const flattened = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (
        obj[key] !== null &&
        typeof obj[key] === 'object' &&
        !Array.isArray(obj[key])
      ) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        // Handle arrays and primitive values
        if (Array.isArray(obj[key])) {
          // For arrays, join with semicolon or handle special cases
          flattened[newKey] = obj[key]
            .map((item) =>
              typeof item === 'object' ? JSON.stringify(item) : String(item)
            )
            .join('; ');
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
  }

  return flattened;
}

// Function to convert JSON to CSV
function convertJsonToCsv(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    console.log('No data to convert.');
    return '';
  }

  // Get all unique keys from all flattened objects
  const allKeys = new Set();
  const flattenedData = [];

  jsonData.forEach((item, index) => {
    const flattened = {
      // Add status and error as first two columns
      status: item.status || '',
      error: item.error || '',
      // Add feature.id as third column
      'feature.id': item.flattened?.['feature.id'] || ''
    };

    // Flatten the 'flattened' object if it exists
    if (item.flattened) {
      const flattenedObj = flattenObject(item.flattened);
      Object.assign(flattened, flattenedObj);
    }

    // Add all keys to the set
    Object.keys(flattened).forEach((key) => allKeys.add(key));
    flattenedData.push(flattened);
  });

  // Convert Set to Array and sort keys for consistent column order
  const sortedKeys = Array.from(allKeys).sort((a, b) => {
    // Custom sorting to put important columns first
    const priority = ['status', 'error', 'feature.id'];
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Then sort by feature properties, i18n, then other properties
    if (a.startsWith('feature.') && !b.startsWith('feature.')) return -1;
    if (!a.startsWith('feature.') && b.startsWith('feature.')) return 1;

    return a.localeCompare(b);
  });

  // Create CSV header
  const header = sortedKeys.join(',');

  // Create CSV rows
  const rows = flattenedData.map((item) => {
    return sortedKeys
      .map((key) => {
        const value = item[key];
        if (value === null || value === undefined) return '';

        // Escape CSV values
        const stringValue = String(value);
        if (
          stringValue.includes(',') ||
          stringValue.includes('"') ||
          stringValue.includes('\n')
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
}

// Main function
function main() {
  try {
    // Find the most recent export file
    const inputFile = findMostRecentExportFile();
    console.log(`Found export file: ${path.basename(inputFile)}`);

    // Read the JSON file
    const jsonContent = fs.readFileSync(inputFile, 'utf8');
    const jsonData = JSON.parse(jsonContent);

    // Convert to CSV
    const csvContent = convertJsonToCsv(jsonData);

    // Generate output filename
    const inputBasename = path.basename(inputFile, '.json');
    const outputFile = path.join(path.dirname(inputFile), `${inputBasename}.csv`);

    // Write CSV file
    fs.writeFileSync(outputFile, csvContent, 'utf8');

    console.log(`✅ Successfully converted to CSV: ${path.basename(outputFile)}`);
    console.log(`📊 Converted ${jsonData.length} records`);
    console.log(`📁 Output location: ${outputFile}`);
  } catch (error) {
    console.error('❌ Error converting JSON to CSV:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
