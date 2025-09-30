#!/usr/bin/env bun

// SECTION
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Feature, Polygon, Point, GeoJSON } from 'geojson';

// TYPES
interface FeatureData {
  id: string;
  organisationId: string;
  projectId: string;
  layerId: string;
  contributorId: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  isPublished: boolean;
  isPendingReview: boolean;
  isArchived: boolean;
  isIntangible: boolean;
  isVisitable: boolean;
  createdAt: string;
  i18n: Record<string, any>;
}

interface LayerData {
  id: string;
  organisationId: string;
  projectId: string;
  metadata: Record<string, any>;
  isDefaultVisible: boolean;
  isPublished: boolean;
  publishedAt: string;
  publisherId: string | null;
  isArchived: boolean;
  i18n: {
    en: {
      layerId: string;
      locale: string;
      name: string;
      nameGen: boolean;
      nameShort: string;
      nameShortGen: boolean;
      description: string;
      descriptionGen: boolean;
    };
    [key: string]: any;
  };
  properties: any[];
}

interface ContourAnalysis {
  contour: number; // travel time in minutes
  area: number; // area in square units
  totalFeatures: number;
  featuresByLayer: Record<string, number>;
  layerDetails: Record<
    string,
    {
      count: number;
      percentage: number;
    }
  >;
  featuresPerArea: number; // total features per unit area
}

interface NeighbourhoodAnalysis {
  neighbourhoodName: string;
  contours: ContourAnalysis[];
}

// UTILITIES
/**
 * Point-in-polygon algorithm using ray casting
 * Returns true if point is inside polygon, false otherwise
 */
function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  const [x, y] = point;
  let inside = false;

  // Use the first ring of the polygon (exterior ring)
  const ring = polygon[0];

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Extract neighbourhood name from filename
 */
function extractNeighbourhoodName(filename: string): string {
  return filename.split('_valhalla-isochrones_')[0].replace(/_/g, ' ');
}

/**
 * Load and parse features data
 */
function loadFeaturesData(): FeatureData[] {
  const featuresPath =
    '/home/io/code/hype/scripts/isochrone/data/features/features.json';
  console.log('Loading features data from:', featuresPath);

  try {
    const data = readFileSync(featuresPath, 'utf-8');
    const features: FeatureData[] = JSON.parse(data);
    console.log(`✅ Loaded ${features.length} features`);
    return features;
  } catch (error) {
    console.error('❌ Error loading features data:', error);
    process.exit(1);
  }
}

/**
 * Load and parse layers data, create mapping from layer ID to English name
 */
function loadLayersData(): Record<string, string> {
  const layersPath = '/home/io/code/hype/scripts/isochrone/data/features/layers.json';
  console.log('Loading layers data from:', layersPath);

  try {
    const data = readFileSync(layersPath, 'utf-8');
    const layers: LayerData[] = JSON.parse(data);

    const layerIdToName: Record<string, string> = {};
    layers.forEach((layer) => {
      layerIdToName[layer.id] = layer.i18n.en.name;
    });

    console.log(`✅ Loaded ${layers.length} layers`);
    return layerIdToName;
  } catch (error) {
    console.error('❌ Error loading layers data:', error);
    process.exit(1);
  }
}

/**
 * Load neighbourhood GeoJSON files
 */
function loadNeighbourhoodFiles(): string[] {
  const neighbourhoodsDir = '/home/io/code/hype/scripts/isochrone/data/neighbourhoods';
  console.log('Loading neighbourhood files from:', neighbourhoodsDir);

  try {
    const files = readdirSync(neighbourhoodsDir)
      .filter((file) => file.endsWith('.geojson'))
      .map((file) => join(neighbourhoodsDir, file));

    console.log(`✅ Found ${files.length} neighbourhood files`);
    return files;
  } catch (error) {
    console.error('❌ Error loading neighbourhood files:', error);
    process.exit(1);
  }
}

/**
 * Analyze features within a neighbourhood polygon for a specific contour
 */
function analyzeContour(
  contourPolygons: number[][][],
  contour: number,
  area: number,
  features: FeatureData[]
): ContourAnalysis {
  // Count features within polygons
  const featuresByLayer: Record<string, number> = {};
  let totalFeatures = 0;

  features.forEach((feature) => {
    if (feature.geometry.type !== 'Point') return;

    const point: [number, number] = feature.geometry.coordinates;

    // Check if point is within any of the polygons
    const isInside = contourPolygons.some((polygon) => pointInPolygon(point, polygon));

    if (isInside) {
      totalFeatures++;
      featuresByLayer[feature.layerId] = (featuresByLayer[feature.layerId] || 0) + 1;
    }
  });

  // Calculate layer details with percentages
  const layerDetails: Record<string, { count: number; percentage: number }> = {};
  Object.entries(featuresByLayer).forEach(([layerId, count]) => {
    layerDetails[layerId] = {
      count,
      percentage: totalFeatures > 0 ? (count / totalFeatures) * 100 : 0
    };
  });

  // Calculate features per area
  const featuresPerArea = area > 0 ? totalFeatures / area : 0;

  return {
    contour,
    area,
    totalFeatures,
    featuresByLayer,
    layerDetails,
    featuresPerArea
  };
}

/**
 * Analyze features within a neighbourhood polygon
 */
function analyzeNeighbourhood(
  neighbourhoodPath: string,
  features: FeatureData[],
  layerIdToName: Record<string, string>
): NeighbourhoodAnalysis {
  const neighbourhoodName = extractNeighbourhoodName(
    neighbourhoodPath.split('/').pop() || ''
  );

  console.log(`\n🔍 Analyzing neighbourhood: ${neighbourhoodName}`);

  // Load neighbourhood GeoJSON
  let neighbourhoodGeoJSON: GeoJSON;
  try {
    const data = readFileSync(neighbourhoodPath, 'utf-8');
    neighbourhoodGeoJSON = JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error loading neighbourhood file ${neighbourhoodPath}:`, error);
    return {
      neighbourhoodName,
      contours: []
    };
  }

  // Group polygons by contour value
  const contoursMap = new Map<number, { polygons: number[][][]; area: number }>();

  if (neighbourhoodGeoJSON.type === 'FeatureCollection') {
    neighbourhoodGeoJSON.features.forEach((feature) => {
      if (feature.geometry.type === 'Polygon' && feature.properties) {
        const contour = feature.properties.contour || 0;
        const area = feature.properties.area || 0;

        if (!contoursMap.has(contour)) {
          contoursMap.set(contour, { polygons: [], area: 0 });
        }

        contoursMap.get(contour)!.polygons.push(feature.geometry.coordinates);
        // Use the area from the first polygon of each contour
        if (contoursMap.get(contour)!.area === 0) {
          contoursMap.get(contour)!.area = area;
        }
      }
    });
  } else if (
    neighbourhoodGeoJSON.type === 'Feature' &&
    neighbourhoodGeoJSON.geometry.type === 'Polygon' &&
    neighbourhoodGeoJSON.properties
  ) {
    const contour = neighbourhoodGeoJSON.properties.contour || 0;
    const area = neighbourhoodGeoJSON.properties.area || 0;
    contoursMap.set(contour, {
      polygons: [neighbourhoodGeoJSON.geometry.coordinates],
      area
    });
  }

  if (contoursMap.size === 0) {
    console.log(`⚠️  No polygons found in ${neighbourhoodName}`);
    return {
      neighbourhoodName,
      contours: []
    };
  }

  console.log(`📐 Found ${contoursMap.size} contour(s) in ${neighbourhoodName}`);

  // Analyze each contour
  const contours: ContourAnalysis[] = [];
  for (const [contour, { polygons, area }] of contoursMap) {
    const analysis = analyzeContour(polygons, contour, area, features);
    contours.push(analysis);
    console.log(
      `✅ Found ${analysis.totalFeatures} features in ${neighbourhoodName} (${contour}min contour)`
    );
  }

  // Sort contours by contour value (ascending)
  contours.sort((a, b) => a.contour - b.contour);

  return {
    neighbourhoodName,
    contours
  };
}

/**
 * Generate CSV output from analysis results
 */
function generateCSVOutput(
  results: NeighbourhoodAnalysis[],
  layerIdToName: Record<string, string>
): void {
  // Get all unique layer names for headers
  const allLayerIds = new Set<string>();
  results.forEach((result) => {
    result.contours.forEach((contour) => {
      Object.keys(contour.featuresByLayer).forEach((layerId) => {
        allLayerIds.add(layerId);
      });
    });
  });

  const layerIds = Array.from(allLayerIds);
  const layerNames = layerIds.map((id) => layerIdToName[id] || id);

  // Create CSV headers
  const headers = [
    'neighbourhood',
    'time',
    'area',
    ...layerNames.map((name) => name.toLowerCase())
  ];
  const csvRows: string[] = [headers.join(',')];

  // Add data rows - one row per contour per neighbourhood
  results.forEach((result) => {
    result.contours.forEach((contour) => {
      const row = [
        `"${result.neighbourhoodName}"`,
        contour.contour.toString(),
        contour.area.toFixed(6),
        ...layerIds.map((layerId) => (contour.featuresByLayer[layerId] || 0).toString())
      ];
      csvRows.push(row.join(','));
    });
  });

  // Write CSV file
  const csvContent = csvRows.join('\n');
  const csvPath = '/home/io/code/hype/scripts/neighbourhood-feature-analysis.csv';
  writeFileSync(csvPath, csvContent, 'utf-8');
  console.log(`\n📄 CSV output saved to: ${csvPath}`);
}

/**
 * Main analysis function
 */
function main(): void {
  console.log('🚀 Starting neighbourhood feature analysis...\n');

  // Load data
  const features = loadFeaturesData();
  const layerIdToName = loadLayersData();
  const neighbourhoodFiles = loadNeighbourhoodFiles();

  // Analyze each neighbourhood
  const results: NeighbourhoodAnalysis[] = [];

  for (const neighbourhoodPath of neighbourhoodFiles) {
    const analysis = analyzeNeighbourhood(neighbourhoodPath, features, layerIdToName);
    results.push(analysis);
  }

  // Sort results by total features across all contours (descending)
  results.sort((a, b) => {
    const aTotal = a.contours.reduce((sum, c) => sum + c.totalFeatures, 0);
    const bTotal = b.contours.reduce((sum, c) => sum + c.totalFeatures, 0);
    return bTotal - aTotal;
  });

  // Output results
  console.log('\n' + '='.repeat(130));
  console.log('📊 NEIGHBOURHOOD FEATURE ANALYSIS RESULTS');
  console.log('='.repeat(130));

  // Create table header
  console.log('\n' + '-'.repeat(130));
  console.log(
    '| Neighbourhood     | Time (min) | Area      | Features | Features/Area | Layer Distribution                    |'
  );
  console.log('-'.repeat(130));

  results.forEach((result) => {
    result.contours.forEach((contour, contourIndex) => {
      const layerDistribution = Object.entries(contour.layerDetails)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([layerId, details]) => {
          const layerName = layerIdToName[layerId] || layerId;
          return `${layerName}: ${details.count}`;
        })
        .join(', ');

      const neighbourhoodName = contourIndex === 0 ? result.neighbourhoodName : '';
      const distribution = layerDistribution || 'No features';

      console.log(
        `| ${neighbourhoodName.padEnd(18)} | ${contour.contour.toString().padEnd(10)} | ${contour.area.toFixed(3).padEnd(8)} | ${contour.totalFeatures.toString().padEnd(8)} | ${contour.featuresPerArea.toFixed(2).padEnd(13)} | ${distribution.padEnd(36)} |`
      );
    });
  });

  console.log('-'.repeat(130));

  // Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📈 SUMMARY STATISTICS');
  console.log('='.repeat(80));

  const totalFeaturesAcrossAll = results.reduce(
    (sum, r) =>
      sum + r.contours.reduce((contourSum, c) => contourSum + c.totalFeatures, 0),
    0
  );
  const neighbourhoodsWithFeatures = results.filter((r) =>
    r.contours.some((c) => c.totalFeatures > 0)
  ).length;
  const totalContours = results.reduce((sum, r) => sum + r.contours.length, 0);

  console.log(`Total neighbourhoods analyzed: ${results.length}`);
  console.log(`Total contours analyzed: ${totalContours}`);
  console.log(`Neighbourhoods with features: ${neighbourhoodsWithFeatures}`);
  console.log(`Total features across all neighbourhoods: ${totalFeaturesAcrossAll}`);
  console.log(
    `Average features per neighbourhood: ${(totalFeaturesAcrossAll / results.length).toFixed(1)}`
  );

  // Layer distribution across all neighbourhoods
  const globalLayerCounts: Record<string, number> = {};
  results.forEach((result) => {
    result.contours.forEach((contour) => {
      Object.entries(contour.featuresByLayer).forEach(([layerId, count]) => {
        globalLayerCounts[layerId] = (globalLayerCounts[layerId] || 0) + count;
      });
    });
  });

  if (Object.keys(globalLayerCounts).length > 0) {
    console.log('\nGlobal layer distribution:');
    Object.entries(globalLayerCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([layerId, count]) => {
        const layerName = layerIdToName[layerId] || layerId;
        const percentage = (count / totalFeaturesAcrossAll) * 100;
        console.log(`  • ${layerName}: ${count} features (${percentage.toFixed(1)}%)`);
      });
  }

  // Generate CSV output
  generateCSVOutput(results, layerIdToName);

  console.log('\n✅ Analysis complete!');
}

// Run the analysis
if (import.meta.main) {
  main();
}
