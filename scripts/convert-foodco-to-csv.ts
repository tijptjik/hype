#!/usr/bin/env bun

// SECTION
import { readFileSync, writeFileSync } from 'fs';

// TYPES
interface FoodCoEntry {
  address: string;
  lng: number;
  lat: number;
  displayName: string;
  type: number;
  isClosed?: boolean;
  dailyNumberOfMeal?: number;
  district?: number;
  remainingNumberOfMeal?: number;
  pId?: string;
  refId?: string;
}

interface FoodCoData {
  data: FoodCoEntry[];
}

// TYPE MAPPING
const TYPE_MAPPING: Record<number, string> = {
  1: 'Food-Co Service Point',
  2: 'Non-Food-Co Service Point',
  3: 'Partner Volunteer Service',
  4: 'Caring Restaurant',
  5: 'Sharing Kitchen',
  6: 'Caring Estate',
  7: 'Meal Sharing Restaurant'
};

// UTILITIES
/**
 * Escape CSV field values
 *
 */
function escapeCsvField(value: string): string {
  // Always wrap text fields in quotes and escape any existing quotes
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Convert FoodCo JSON to CSV
 */
function convertFoodCoToCsv(inputPath: string, outputPath: string): void {
  console.log(`📖 Reading FoodCo data from: ${inputPath}`);

  try {
    // Read and parse JSON file
    const jsonData = readFileSync(inputPath, 'utf-8');
    const foodCoData: FoodCoData = JSON.parse(jsonData);

    console.log(`✅ Loaded ${foodCoData.data.length} entries`);

    // Create CSV headers
    const headers = ['displayName', 'address', 'lng', 'lat', 'type'];
    const csvRows: string[] = [headers.join(',')];

    // Process each entry
    foodCoData.data.forEach((entry) => {
      const typeName = entry.type
        ? TYPE_MAPPING[entry.type] || `Unknown Type (${entry.type})`
        : 'Unknown Type';
      const row = [
        escapeCsvField(entry.displayName || ''),
        escapeCsvField(entry.address || ''),
        entry.lng?.toString() || '',
        entry.lat?.toString() || '',
        escapeCsvField(typeName)
      ];
      csvRows.push(row.join(','));
    });

    // Write CSV file
    const csvContent = csvRows.join('\n');
    writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`📄 CSV output saved to: ${outputPath}`);
    console.log(`📊 Converted ${foodCoData.data.length} entries to CSV`);

    // Show sample of data
    console.log('\n📋 Sample entries:');
    foodCoData.data.slice(0, 3).forEach((entry, index) => {
      const typeName = entry.type
        ? TYPE_MAPPING[entry.type] || `Unknown Type (${entry.type})`
        : 'Unknown Type';
      console.log(
        `${index + 1}. ${entry.displayName} (${typeName}) - ${entry.address}`
      );
    });
  } catch (error) {
    console.error('❌ Error converting FoodCo data:', error);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main(): void {
  const inputPath = '/home/io/downloads/foodCo-map-20251001.json';
  const outputPath = '/home/io/code/hype/scripts/foodco-data.csv';

  console.log('🚀 Converting FoodCo JSON to CSV...\n');

  convertFoodCoToCsv(inputPath, outputPath);

  console.log('\n✅ Conversion complete!');
}

// Run the conversion
if (import.meta.main) {
  main();
}
