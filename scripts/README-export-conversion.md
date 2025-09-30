# Export to CSV Conversion Script

This script converts the JSON export files from the batch upload feature resolution step into CSV format for Google Sheets.

## Usage

1. **Export JSON from the application:**
   - Complete your batch upload process
   - Click "Download Results" in the Feature Resolution step
   - Save the downloaded JSON file to the `exports/` directory in your project root

2. **Convert to CSV:**

   ```bash
   bun run export:convert-to-csv
   ```

   Or run directly:

   ```bash
   node scripts/convert-export-to-csv.js
   ```

## Output

The script will:

- Find the most recent export file in the `exports/` directory
- Convert it to CSV format with the same timestamp
- Save it alongside the original JSON file

## CSV Structure

The CSV will have the following column order:

1. **status** - Processing status (success, error, unchanged, etc.)
2. **error** - Error message if any
3. **feature.id** - Feature identifier
4. **Feature properties** - All feature-level properties
5. **Feature i18n properties** - Localized content (title, description, etc.)
6. **Feature property values** - Property values and metadata

## Example

Input: `hype.hk-batch-upload-results-2025-01-27T14-30-45.json`
Output: `hype.hk-batch-upload-results-2025-01-27T14-30-45.csv`

## Notes

- The script automatically handles nested objects by flattening them with dot notation
- Arrays are joined with semicolons
- CSV values are properly escaped for Google Sheets compatibility
- The script finds the most recent export file automatically
