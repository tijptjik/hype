#!/usr/bin/env python3

# ═══════════════════════════
# IMAGE DOWNLOAD SCRIPT
# ═══════════════════════════

import csv
import os
import requests
import sys
import time
from pathlib import Path

CSV_FILE = "scripts/data/source/GhostSigns - Master - Database Ingestion - 20250605.csv"
OUTPUT_DIR = "scripts/data/images"

def download_image(url: str, output_path: str) -> bool:
    """Download an image from URL to output_path"""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        return True
    except Exception as e:
        print(f"✗ Error downloading: {e}")
        return False

def main():
    # Create output directory
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    print(f"Starting image download from CSV...")
    print(f"CSV file: {CSV_FILE}")
    print(f"Output directory: {OUTPUT_DIR}")
    print("")
    
    downloaded_count = 0
    skipped_count = 0
    failed_count = 0
    
    try:
        with open(CSV_FILE, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            for row in reader:
                image_url = row.get('imageUrl', '').strip()
                feature_id = row.get('id', '').strip()
                
                if not image_url or not feature_id:
                    print(f"Skipping ID {feature_id} - no image URL")
                    skipped_count += 1
                    continue
                
                # Clean up the ID for filename
                clean_id = feature_id.replace('/', '_').replace('"', '')
                output_file = os.path.join(OUTPUT_DIR, f"{clean_id}.jpg")
                
                print(f"Downloading image for ID: {clean_id}")
                print(f"URL: {image_url}")
                print(f"Output: {output_file}")
                
                if download_image(image_url, output_file):
                    print(f"✓ Successfully downloaded: {clean_id}.jpg")
                    downloaded_count += 1
                else:
                    print(f"✗ Failed to download image for ID: {clean_id}")
                    failed_count += 1
                
                print("")
                
                # Be respectful to the server
                time.sleep(0.5)
                
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        sys.exit(1)
    
    print("Image download complete!")
    print(f"Downloaded: {downloaded_count}")
    print(f"Skipped: {skipped_count}")
    print(f"Failed: {failed_count}")
    print(f"Images saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main() 