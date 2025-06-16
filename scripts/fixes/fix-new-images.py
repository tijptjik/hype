#!/usr/bin/env python3

# ═══════════════════════════
# FIX NEW IMAGES SCRIPT
# ═══════════════════════════

import csv
import json
import os
import requests
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

CSV_FILE = "scripts/data/source/GhostSigns - Master - Database Ingestion - 20250605.csv"
FEATURES_FILE = "src/lib/db/data/features-hkghostsigns.json"
OUTPUT_DIR = "scripts/data/images"

def find_matching_feature(longitude: float, latitude: float, features: List[Dict]) -> Optional[str]:
    """Find the feature that matches the given coordinates"""
    for feature in features:
        geometry = feature.get('geometry', {})
        coordinates = geometry.get('coordinates', [])
        
        if len(coordinates) >= 2:
            feature_lng = coordinates[0]
            feature_lat = coordinates[1]
            
            # Match with a small tolerance for floating point comparison
            lng_diff = abs(float(feature_lng) - longitude)
            lat_diff = abs(float(feature_lat) - latitude)
            
            # Use a tolerance of 0.000001 degrees (about 0.1 meters)
            if lng_diff < 0.000001 and lat_diff < 0.000001:
                return feature.get('id')
    
    return None

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
    # Load features data
    try:
        with open(FEATURES_FILE, 'r', encoding='utf-8') as f:
            features = json.load(f)
        print(f"Loaded {len(features)} features from {FEATURES_FILE}")
    except Exception as e:
        print(f"Error loading features file: {e}")
        sys.exit(1)
    
    # Create output directory
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    print(f"Processing NEW records from CSV...")
    print(f"CSV file: {CSV_FILE}")
    print(f"Output directory: {OUTPUT_DIR}")
    print("")
    
    processed_count = 0
    matched_count = 0
    downloaded_count = 0
    failed_count = 0
    
    try:
        with open(CSV_FILE, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            for row in reader:
                record_id = row.get('id', '').strip()
                image_url = row.get('imageUrl', '').strip()
                longitude_str = row.get('longitude', '').strip()
                latitude_str = row.get('latitude', '').strip()
                
                # Only process NEW records with image URLs
                if record_id != 'NEW' or not image_url:
                    continue
                
                processed_count += 1
                
                try:
                    longitude = float(longitude_str)
                    latitude = float(latitude_str)
                except ValueError:
                    print(f"✗ Invalid coordinates for NEW record: lng={longitude_str}, lat={latitude_str}")
                    failed_count += 1
                    continue
                
                # Find matching feature by coordinates
                feature_id = find_matching_feature(longitude, latitude, features)
                
                if not feature_id:
                    print(f"✗ No matching feature found for coordinates: lng={longitude}, lat={latitude}")
                    failed_count += 1
                    continue
                
                matched_count += 1
                print(f"✓ Matched coordinates ({longitude}, {latitude}) to feature ID: {feature_id}")
                
                # Download image with correct ID
                output_file = os.path.join(OUTPUT_DIR, f"{feature_id}.jpg")
                
                print(f"Downloading image for feature ID: {feature_id}")
                print(f"URL: {image_url}")
                print(f"Output: {output_file}")
                
                if download_image(image_url, output_file):
                    print(f"✓ Successfully downloaded: {feature_id}.jpg")
                    downloaded_count += 1
                else:
                    print(f"✗ Failed to download image for feature ID: {feature_id}")
                    failed_count += 1
                
                print("")
                
                # Be respectful to the server
                time.sleep(0.5)
                
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        sys.exit(1)
    
    print("Fix NEW images complete!")
    print(f"Processed NEW records: {processed_count}")
    print(f"Matched to features: {matched_count}")
    print(f"Downloaded: {downloaded_count}")
    print(f"Failed: {failed_count}")
    print(f"Images saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main() 