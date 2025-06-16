#!/bin/bash

# Check FK violations step by step
# Usage: ./check_fk_step_by_step.sh

echo "🔍 Checking FK violations step by step..."
echo "========================================"

# Function to run SQL and count results
check_fk() {
    local description="$1"
    local sql="$2"
    
    echo
    echo "📋 $description"
    echo "SQL: $sql"
    
    result=$(bunx wrangler d1 execute hype-db-local --local --command="$sql" 2>/dev/null | tail -n +7 | head -n -1 | grep -E '^│' | wc -l)
    
    if [ "$result" -gt 1 ]; then
        violations=$((result - 2))  # Subtract header and separator lines
        echo "❌ Found $violations violations"
        
        # Show actual violations
        echo "Violations:"
        bunx wrangler d1 execute hype-db-local --local --command="$sql" 2>/dev/null
    else
        echo "✅ No violations found"
    fi
}

# Check all FK relationships

check_fk "organisation.imageId → image.id" \
"SELECT o.id, o.imageId FROM organisation o LEFT JOIN image i ON o.imageId = i.id WHERE o.imageId IS NOT NULL AND i.id IS NULL;"

check_fk "organisation.hubId → hub.id" \
"SELECT o.id, o.hubId FROM organisation o LEFT JOIN hub h ON o.hubId = h.id WHERE o.hubId IS NOT NULL AND h.id IS NULL;"

check_fk "organisation.publisherId → user.id" \
"SELECT o.id, o.publisherId FROM organisation o LEFT JOIN user u ON o.publisherId = u.id WHERE o.publisherId IS NOT NULL AND u.id IS NULL;"

check_fk "project.organisationId → organisation.id" \
"SELECT p.id, p.organisationId FROM project p LEFT JOIN organisation o ON p.organisationId = o.id WHERE p.organisationId IS NOT NULL AND o.id IS NULL;"

check_fk "project.imageId → image.id" \
"SELECT p.id, p.imageId FROM project p LEFT JOIN image i ON p.imageId = i.id WHERE p.imageId IS NOT NULL AND i.id IS NULL;"

check_fk "project.publisherId → user.id" \
"SELECT p.id, p.publisherId FROM project p LEFT JOIN user u ON p.publisherId = u.id WHERE p.publisherId IS NOT NULL AND u.id IS NULL;"

check_fk "layer.organisationId → organisation.id" \
"SELECT l.id, l.organisationId FROM layer l LEFT JOIN organisation o ON l.organisationId = o.id WHERE l.organisationId IS NOT NULL AND o.id IS NULL;"

check_fk "layer.projectId → project.id" \
"SELECT l.id, l.projectId FROM layer l LEFT JOIN project p ON l.projectId = p.id WHERE l.projectId IS NOT NULL AND p.id IS NULL;"

check_fk "layer.publisherId → user.id" \
"SELECT l.id, l.publisherId FROM layer l LEFT JOIN user u ON l.publisherId = u.id WHERE l.publisherId IS NOT NULL AND u.id IS NULL;"

check_fk "feature.organisationId → organisation.id" \
"SELECT f.id, f.organisationId FROM feature f LEFT JOIN organisation o ON f.organisationId = o.id WHERE f.organisationId IS NOT NULL AND o.id IS NULL;"

check_fk "feature.projectId → project.id" \
"SELECT f.id, f.projectId FROM feature f LEFT JOIN project p ON f.projectId = p.id WHERE f.projectId IS NOT NULL AND p.id IS NULL;"

check_fk "feature.layerId → layer.id" \
"SELECT f.id, f.layerId FROM feature f LEFT JOIN layer l ON f.layerId = l.id WHERE f.layerId IS NOT NULL AND l.id IS NULL;"

check_fk "feature.contributorId → user.id" \
"SELECT f.id, f.contributorId FROM feature f LEFT JOIN user u ON f.contributorId = u.id WHERE f.contributorId IS NOT NULL AND u.id IS NULL;"

check_fk "feature.publisherId → user.id" \
"SELECT f.id, f.publisherId FROM feature f LEFT JOIN user u ON f.publisherId = u.id WHERE f.publisherId IS NOT NULL AND u.id IS NULL;"

check_fk "featureProperty.featureId → feature.id" \
"SELECT fp.featureId, fp.propertyId FROM featureProperty fp LEFT JOIN feature f ON fp.featureId = f.id WHERE fp.featureId IS NOT NULL AND f.id IS NULL;"

check_fk "featureProperty.propertyId → property.id" \
"SELECT fp.featureId, fp.propertyId FROM featureProperty fp LEFT JOIN property p ON fp.propertyId = p.id WHERE fp.propertyId IS NOT NULL AND p.id IS NULL;"

check_fk "featureProperty.propertyValueId → propertyValue.id" \
"SELECT fp.featureId, fp.propertyId, fp.propertyValueId FROM featureProperty fp LEFT JOIN propertyValue pv ON fp.propertyValueId = pv.id WHERE fp.propertyValueId IS NOT NULL AND pv.id IS NULL;"

echo
echo "🏁 FK violation check completed!" 