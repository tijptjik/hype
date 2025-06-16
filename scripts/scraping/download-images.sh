#!/bin/bash

# ═══════════════════════════
# IMAGE DOWNLOAD SCRIPT
# ═══════════════════════════

set -e

CSV_FILE="scripts/data/source/GhostSigns - Master - Database Ingestion - 20250605.csv"
OUTPUT_DIR="scripts/data/images"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "Starting image download from CSV..."
echo "CSV file: $CSV_FILE"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Read CSV file and extract id and imageUrl columns
# Skip header row and process each line
tail -n +2 "$CSV_FILE" | while IFS=',' read -r id property_grapheme_value i18n_en_title i18n_zh_hant_title i18n_en_description longitude latitude i18n_en_displayAddress visitableAsOf imageUrl; do
    
    # Skip rows where imageUrl is empty
    if [[ -n "$imageUrl" && "$imageUrl" != "" ]]; then
        
        # Clean up the id (remove any quotes or special characters that might cause issues)
        clean_id=$(echo "$id" | tr -d '"' | tr '/' '_')
        
        # Set output filename
        output_file="$OUTPUT_DIR/${clean_id}.jpg"
        
        echo "Downloading image for ID: $clean_id"
        echo "URL: $imageUrl"
        echo "Output: $output_file"
        
        # Download the image using curl
        if curl -L -o "$output_file" "$imageUrl" --silent --show-error --fail; then
            echo "✓ Successfully downloaded: $clean_id.jpg"
        else
            echo "✗ Failed to download image for ID: $clean_id"
            echo "  URL: $imageUrl"
        fi
        
        echo ""
        
        # Add a small delay to be respectful to the server
        sleep 0.5
        
    else
        echo "Skipping ID $id - no image URL"
    fi
    
done

echo "Image download complete!"
echo "Images saved to: $OUTPUT_DIR" 