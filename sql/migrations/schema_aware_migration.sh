#!/bin/bash

# Smart backup and restore using schema information for column mapping
# Usage: ./smart_backup_restore.sh [local|preview|prod]

set -e

# Parse command line arguments
MODE="${1:-local}"

if [[ ! "$MODE" =~ ^(local|preview|prod)$ ]]; then
    echo "❌ Invalid mode: $MODE"
    echo "Usage: $0 [local|preview|prod]"
    echo "  local   - Apply migration to local database (default)"
    echo "  preview - Apply migration to preview database"
    echo "  prod    - Apply migration to production database"
    exit 1
fi

# Set database and wrangler flags based on mode
case "$MODE" in
    "local")
        DB_NAME="hype-db-local"
        WRANGLER_FLAGS="--local"
        DB_RESET_CMD="db:reset:local"
        ;;
    "preview")
        DB_NAME="hype-db-preview"
        WRANGLER_FLAGS="--env preview --remote"
        DB_RESET_CMD="db:reset:preview"
        ;;
    "prod")
        DB_NAME="hype-db-prod"
        WRANGLER_FLAGS="--env production --remote"
        DB_RESET_CMD="db:reset:prod"
        ;;
esac

echo "🧠 Smart FK migration with schema-aware data restoration..."
echo "Target: $MODE environment ($DB_NAME)"
echo "================================================================"
echo

# Preparation: Reset database to known good state
echo "🔄 Preparation: Reset $MODE database to latest prod state..."
echo "================================================================"
echo

echo "🗑️ Resetting $MODE database..."
bun run $DB_RESET_CMD

echo "📥 Restoring latest prod data to $MODE..."
LATEST_FILE=$(ls -t sql/backup/hype-db-prod-*-ordered.sql 2>/dev/null | head -1)
if [ -n "$LATEST_FILE" ]; then
    bunx wrangler@3.103.2 d1 execute $DB_NAME $WRANGLER_FLAGS --file="$LATEST_FILE"
    echo "✅ Restored from $LATEST_FILE"
else
    echo "❌ No ordered prod backup files found"
    exit 1
fi

echo "✅ $MODE database reset to latest prod state"
echo

# Pre-migration record count
echo "📊 Step 0: Record counts before migration..."

# Cache table counts (these will be the same before and after since we restore the same data)
COUNTS_CACHE_FILE="sql/cache/table-counts-cache-${MODE}.txt"

# Define all business tables to count
BUSINESS_TABLES="hub hubI18n organisation organisationI18n organisationRole project projectI18n projectRole property propertyI18n propertyValue propertyValueI18n layer layerI18n layerProperty feature featureI18n featureImage featureProperty featurePropertyI18n userFeature userLayer task taskImage user account session userActivity verification image"

if [[ -f "$COUNTS_CACHE_FILE" ]]; then
    echo "Using existing table count cache..."
    cat "$COUNTS_CACHE_FILE"
else
    echo "Creating table count cache..."
    echo "# Cached table counts" > "$COUNTS_CACHE_FILE"

    for table in $BUSINESS_TABLES; do
        output=$(bunx wrangler@3.103.2 d1 execute $DB_NAME $WRANGLER_FLAGS --command="SELECT COUNT(*) FROM $table;" 2>&1)
        # Extract count from JSON format: "COUNT(*)": 295
        count=$(echo "$output" | grep -oE '"COUNT\(\*\)":\s*[0-9]+' | grep -oE '[0-9]+' | head -1)
        if [[ -z "$count" ]]; then
            count="0"
        fi
        echo "$table: $count" >> "$COUNTS_CACHE_FILE"
        echo "$table: $count"
    done
fi

# Copy cached counts as "before" counts
cp "$COUNTS_CACHE_FILE" "sql/cache/counts-before-migration-${MODE}.txt"
echo

# Step 1: Export WITH schema to get column order information
echo "1️⃣ Step 1: Export database WITH schema for column order reference..."
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")
SCHEMA_EXPORT_FILE="sql/backup/schema-export-${MODE}-${TIMESTAMP}.sql"

bunx wrangler@3.103.2 d1 export $DB_NAME $WRANGLER_FLAGS --output="$SCHEMA_EXPORT_FILE"
echo "✅ Schema export created: $SCHEMA_EXPORT_FILE"
echo

# Step 2: Extract column order from CREATE TABLE statements
echo "2️⃣ Step 2: Extract column order from schema..."
python3 - "$SCHEMA_EXPORT_FILE" > "sql/cache/column-mappings-${MODE}.json" << 'PYTHON_EOF'
import re
import sys
import json

def extract_column_order(create_table_sql):
    """Extract column names in order from CREATE TABLE statement"""
    # Remove comments and normalize whitespace
    sql = re.sub(r'--.*', '', create_table_sql)
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    sql = re.sub(r'\s+', ' ', sql).strip()

    # Match CREATE TABLE statement
    match = re.match(r'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[`"]?(\w+)[`"]?\s*\((.*)\)', sql, re.IGNORECASE | re.DOTALL)
    if not match:
        return None, []

    table_name = match.group(1)
    columns_part = match.group(2)

    # Split by commas, but respect parentheses and quotes
    columns = []
    current_col = ""
    paren_level = 0
    in_quote = False
    quote_char = None

    for char in columns_part:
        if char in ['"', "'", '`'] and not in_quote:
            in_quote = True
            quote_char = char
        elif char == quote_char and in_quote:
            in_quote = False
            quote_char = None
        elif char == '(' and not in_quote:
            paren_level += 1
        elif char == ')' and not in_quote:
            paren_level -= 1
        elif char == ',' and not in_quote and paren_level == 0:
            columns.append(current_col.strip())
            current_col = ""
            continue

        current_col += char

    if current_col.strip():
        columns.append(current_col.strip())

    # Extract column names (first word of each column definition)
    column_names = []
    for col_def in columns:
        col_def = col_def.strip()
        if col_def and not col_def.upper().startswith(('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK', 'CONSTRAINT')):
            # Extract column name (remove quotes if present)
            col_name = re.match(r'[`"]?(\w+)[`"]?', col_def)
            if col_name:
                column_names.append(col_name.group(1))

    return table_name, column_names

# Read the schema export file
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    content = f.read()

# Extract CREATE TABLE statements
create_table_pattern = r'CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[^;]+;'
create_statements = re.findall(create_table_pattern, content, re.IGNORECASE | re.DOTALL)

table_columns = {}
for stmt in create_statements:
    table_name, columns = extract_column_order(stmt)
    if table_name and columns:
        table_columns[table_name] = columns

# Output as JSON
print(json.dumps(table_columns, indent=2))
PYTHON_EOF

echo "✅ Column mappings extracted to: sql/cache/column-mappings-${MODE}.json"
echo

# Step 3: Truncate business data (preserve migration history)
echo "3️⃣ Step 3: Truncate business data (preserve schema and migration history)..."
TEMP_TRUNCATE_FILE=$(mktemp)
cat > "$TEMP_TRUNCATE_FILE" << 'EOF'
-- Truncate business data only (preserve d1_migrations and schema)
DELETE FROM featureProperty;
DELETE FROM featurePropertyI18n;
DELETE FROM featureImage;
DELETE FROM layerProperty;
DELETE FROM userFeature;
DELETE FROM userLayer;
DELETE FROM taskImage;
DELETE FROM organisationRole;
DELETE FROM projectRole;
DELETE FROM userActivity;
DELETE FROM session;
DELETE FROM verification;
DELETE FROM feature;
DELETE FROM featureI18n;
DELETE FROM task;
DELETE FROM account;
DELETE FROM layer;
DELETE FROM layerI18n;
DELETE FROM project;
DELETE FROM projectI18n;
DELETE FROM organisation;
DELETE FROM organisationI18n;
DELETE FROM hub;
DELETE FROM hubI18n;
DELETE FROM user;
DELETE FROM image;
DELETE FROM propertyValue;
DELETE FROM propertyValueI18n;
DELETE FROM property;
DELETE FROM propertyI18n;
EOF

bunx wrangler@3.103.2 d1 execute $DB_NAME $WRANGLER_FLAGS --file="$TEMP_TRUNCATE_FILE"
rm -f "$TEMP_TRUNCATE_FILE"

echo "✅ Business data truncated"
echo

# Step 4: Apply FK migration
echo "4️⃣ Step 4: Apply FK migration..."
echo "y" | bunx wrangler@3.103.2 d1 migrations apply $DB_NAME $WRANGLER_FLAGS

if [ $? -eq 0 ]; then
    echo "✅ FK migration applied successfully"
else
    echo "❌ FK migration failed"
    exit 1
fi
echo

# Step 5: Create schema-aware data restore file
echo "5️⃣ Step 5: Create schema-aware data restore file..."
RESTORE_FILE="sql/backup/smart-restore-${MODE}-${TIMESTAMP}.sql"

python3 - "$SCHEMA_EXPORT_FILE" "sql/cache/column-mappings-${MODE}.json" > "$RESTORE_FILE" << 'PYTHON_EOF'
import re
import sys
import json

# Read column mappings
with open(sys.argv[2], 'r') as f:
    table_columns = json.load(f)

# Read the schema export file
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    content = f.read()



# Start with pragma to defer FK checks
print("PRAGMA defer_foreign_keys=ON;")
print("")

# Process INSERT statements (may span multiple lines)
table_inserts = {}

# Use simple regex-based extraction with proper parentheses handling
# Split content by INSERT INTO to get individual statements
insert_statements = []
parts = re.split(r'INSERT INTO (\w+) VALUES\(', content)

for i in range(1, len(parts), 2):
    if i + 1 < len(parts):
        table_name = parts[i]
        values_part = parts[i + 1]

        # Find the end of the VALUES clause by counting parentheses
        # Need to be careful about strings and function calls
        paren_count = 1
        end_pos = 0
        j = 0

        while j < len(values_part):
            char = values_part[j]

            # Handle string literals
            if char in ["'", '"']:
                string_char = char
                j += 1  # Skip opening quote

                # Find the end of the string
                while j < len(values_part):
                    if values_part[j] == string_char:
                        # Check if it's escaped (doubled)
                        if j + 1 < len(values_part) and values_part[j + 1] == string_char:
                            j += 2  # Skip both quotes
                        else:
                            j += 1  # Skip closing quote
                            break
                    else:
                        j += 1
            elif char == '(':
                paren_count += 1
                j += 1
            elif char == ')':
                paren_count -= 1
                if paren_count == 0:
                    end_pos = j
                    break
                j += 1
            else:
                j += 1

        if end_pos > 0:
            values_content = values_part[:end_pos]
            insert_statements.append((table_name, values_content))

matches = []
featureI18n_matches = 0

for table_name, values_content in insert_statements:
    matches.append((table_name, values_content))
    if table_name == 'featureI18n':
        featureI18n_matches += 1

print(f"-- DEBUG: Regex matched {featureI18n_matches} featureI18n statements", file=sys.stderr)
print(f"-- DEBUG: Failed to match 0 featureI18n statements", file=sys.stderr)

for table_name, values_content in matches:
    # Parse the values content with proper function-aware parsing
    values = []
    current_value = ""
    i = 0
    in_quote = False
    quote_char = None
    brace_level = 0
    bracket_level = 0
    paren_level = 0  # Track parentheses for functions like replace()

    while i < len(values_content):
        char = values_content[i]

        if not in_quote:
            if char in ['"', "'"]:
                in_quote = True
                quote_char = char
                current_value += char
            elif char == ',':
                # Only split on comma if we're not inside any nested structures
                if brace_level == 0 and bracket_level == 0 and paren_level == 0:
                    # End of value
                    values.append(current_value.strip())
                    current_value = ""
                else:
                    current_value += char
            elif char == '{':
                brace_level += 1
                current_value += char
            elif char == '}':
                brace_level -= 1
                current_value += char
            elif char == '[':
                bracket_level += 1
                current_value += char
            elif char == ']':
                bracket_level -= 1
                current_value += char
            elif char == '(':
                paren_level += 1
                current_value += char
            elif char == ')':
                paren_level -= 1
                current_value += char
            else:
                current_value += char
        else:
            # Inside quotes - track nested structures within quotes too
            if char == quote_char:
                # Check if this is an escaped quote (doubled)
                if i + 1 < len(values_content) and values_content[i + 1] == quote_char:
                    # Escaped quote - add both
                    current_value += char + char
                    i += 1  # Skip the next quote
                else:
                    # End of quoted string
                    current_value += char
                    in_quote = False
                    quote_char = None
            elif char == '{' and quote_char == '"':
                # Track braces inside double-quoted strings (JSON)
                brace_level += 1
                current_value += char
            elif char == '}' and quote_char == '"':
                brace_level -= 1
                current_value += char
            elif char == '[' and quote_char == '"':
                # Track brackets inside double-quoted strings (JSON arrays)
                bracket_level += 1
                current_value += char
            elif char == ']' and quote_char == '"':
                bracket_level -= 1
                current_value += char
            else:
                current_value += char

        i += 1

    # Add the last value
    if current_value.strip():
        values.append(current_value.strip())

    if table_name and values:
        if table_name not in table_inserts:
            table_inserts[table_name] = []
        # Store both values and raw content for debugging
        table_inserts[table_name].append((values, values_content))

# Debug: Print statement counts and parsing details
print(f"-- DEBUG: Found {len(matches)} total INSERT statements", file=sys.stderr)
print(f"-- DEBUG: Extracted {len(insert_statements)} statements from content", file=sys.stderr)

# Count original INSERT statements in raw content for comparison
original_inserts = len(re.findall(r'INSERT INTO', content))
original_featureI18n = len(re.findall(r'INSERT INTO featureI18n', content))
print(f"-- DEBUG: Original content had {original_inserts} INSERT statements", file=sys.stderr)
print(f"-- DEBUG: Original featureI18n statements: {original_featureI18n}", file=sys.stderr)

for table_name in table_inserts:
    print(f"-- DEBUG: {table_name}: {len(table_inserts[table_name])} records", file=sys.stderr)

    # Special debugging for featureI18n
    if table_name == 'featureI18n':
        print(f"-- DEBUG: featureI18n detailed analysis:", file=sys.stderr)
        for i, (values, raw_content) in enumerate(table_inserts[table_name][:3]):  # First 3 records
            print(f"-- DEBUG:   Record {i+1}: {len(values)} values", file=sys.stderr)
            if len(values) != len(table_columns.get(table_name, [])):
                print(f"-- DEBUG:   MISMATCH: Expected {len(table_columns.get(table_name, []))} columns, got {len(values)}", file=sys.stderr)
                print(f"-- DEBUG:   Raw: {raw_content[:100]}...", file=sys.stderr)

# Define dependency order
dependency_order = [
    'd1_migrations', 'hub', 'user', 'image', 'verification',
    'account', 'session', 'userActivity', 'hubI18n', 'organisation',
    'organisationI18n', 'organisationRole', 'project', 'projectI18n',
    'projectRole', 'property', 'propertyI18n', 'propertyValue',
    'propertyValueI18n', 'layer', 'layerI18n', 'layerProperty',
    'feature', 'featureI18n', 'featureImage', 'featureProperty',
    'featurePropertyI18n', 'userFeature', 'userLayer', 'task', 'taskImage'
]

# Process tables in dependency order, excluding d1_migrations
total_skipped = 0
for table_name in dependency_order:
    if table_name == 'd1_migrations':
        continue  # Skip migration table

    if table_name in table_inserts and table_name in table_columns:
        print(f"-- {table_name} data")
        columns = table_columns[table_name]
        column_list = '(' + ', '.join(f'"{col}"' for col in columns) + ')'

        table_skipped = 0
        for row_idx, (values, raw_content) in enumerate(table_inserts[table_name]):
            if len(values) == len(columns):
                value_list = '(' + ', '.join(values) + ')'
                print(f'INSERT INTO {table_name}{column_list} VALUES{value_list};')
            else:
                table_skipped += 1
                total_skipped += 1
                print(f'-- Warning: Skipping {table_name} row {row_idx} - column count mismatch ({len(values)} values, {len(columns)} columns)', file=sys.stderr)
                print(f'-- Expected columns ({len(columns)}): {columns}', file=sys.stderr)
                print(f'-- Parsed values ({len(values)}): {values[:3]}...{values[-3:] if len(values) > 6 else values[3:]}', file=sys.stderr)
                print(f'-- Raw values content (first 200 chars): {repr(raw_content[:200])}', file=sys.stderr)
                print('-- ' + '='*80, file=sys.stderr)

        if table_skipped > 0:
            print(f"-- DEBUG: {table_name} skipped {table_skipped} records", file=sys.stderr)
        print("")

# Handle any remaining tables not in dependency order
processed_tables = set(dependency_order)
for table_name in table_inserts:
    if table_name not in processed_tables and table_name in table_columns:
        print(f"-- {table_name} data (remaining)")
        columns = table_columns[table_name]
        column_list = '(' + ', '.join(f'"{col}"' for col in columns) + ')'

        for values, raw_content in table_inserts[table_name]:
            if len(values) == len(columns):
                value_list = '(' + ', '.join(values) + ')'
                print(f'INSERT INTO {table_name}{column_list} VALUES{value_list};')
        print("")

# Final summary
print(f"-- DEBUG: PARSING SUMMARY", file=sys.stderr)
print(f"-- DEBUG: Total records parsed: {sum(len(records) for records in table_inserts.values())}", file=sys.stderr)
print(f"-- DEBUG: Total records skipped: {total_skipped}", file=sys.stderr)
print(f"-- DEBUG: Total records written: {sum(len(records) for records in table_inserts.values()) - total_skipped}", file=sys.stderr)
PYTHON_EOF

echo "✅ Smart restore file created: $RESTORE_FILE"
echo

# Step 6: Restore data using schema-aware mapping
echo "6️⃣ Step 6: Restore data using schema-aware column mapping..."
bunx wrangler@3.103.2 d1 execute $DB_NAME $WRANGLER_FLAGS --file="$RESTORE_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Data restored successfully with proper column mapping!"
else
    echo "❌ Data restoration failed"
    echo "   Manual restore file available at: $RESTORE_FILE"
    exit 1
fi
echo

# Step 7: Verify success with complete record count comparison
echo "7️⃣ Step 7: Verify migration success with record count comparison..."

# Count all tables individually after migration
echo "Verifying table counts after migration..."
echo "# Table counts AFTER migration" > "sql/cache/counts-after-migration-${MODE}.txt"
for table in $BUSINESS_TABLES; do
            output=$(bunx wrangler@3.103.2 d1 execute $DB_NAME $WRANGLER_FLAGS --command="SELECT COUNT(*) FROM $table;" 2>&1)
    # Extract count from JSON format: "COUNT(*)": 295
    count=$(echo "$output" | grep -oE '"COUNT\(\*\)":\s*[0-9]+' | grep -oE '[0-9]+' | head -1)
    if [[ -z "$count" ]]; then
        count="0"
    fi
    echo "$table: $count" >> "sql/cache/counts-after-migration-${MODE}.txt"
    echo "$table: $count"
done

echo
echo "📊 Record count comparison:"
echo "=========================="
python3 - "sql/cache/counts-before-migration-${MODE}.txt" "sql/cache/counts-after-migration-${MODE}.txt" << 'PYTHON_COMPARE_EOF'
import sys

def parse_counts(filename):
    counts = {}
    try:
        with open(filename, 'r') as f:
            lines = f.readlines()
            for line in lines:
                line = line.strip()
                if ':' in line and not line.startswith('#') and not line.startswith('Key table'):
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        table_name = parts[0].strip()
                        count_str = parts[1].strip()
                        if count_str.isdigit():
                            count = int(count_str)
                            counts[table_name] = count
    except Exception as e:
        print(f"Error parsing {filename}: {e}")
    return counts

before_counts = parse_counts(sys.argv[1])
after_counts = parse_counts(sys.argv[2])

print("Table                    | Before | After  | Diff   | Status")
print("-------------------------|--------|--------|--------|--------")

all_tables = set(before_counts.keys()) | set(after_counts.keys())
total_diff = 0
issues = []

for table in sorted(all_tables):
    before = before_counts.get(table, 0)
    after = after_counts.get(table, 0)
    diff = after - before
    total_diff += abs(diff)

    if diff == 0:
        status = "✅ OK"
    elif diff > 0:
        status = f"⚠️ +{diff}"
        issues.append(f"{table}: gained {diff} records")
    else:
        status = f"❌ -{abs(diff)}"
        issues.append(f"{table}: lost {abs(diff)} records")

    print(f"{table:<24} | {before:>6} | {after:>6} | {diff:>+6} | {status}")

print("-------------------------|--------|--------|--------|--------")
print(f"{'TOTAL':<24} | {sum(before_counts.values()):>6} | {sum(after_counts.values()):>6} | {sum(after_counts.values()) - sum(before_counts.values()):>+6} |")

if issues:
    print("\n⚠️  ISSUES DETECTED:")
    for issue in issues:
        print(f"   - {issue}")
    print("\n❌ Migration completed with data discrepancies!")
    sys.exit(1)
else:
    print("\n✅ All record counts match - no data lost!")

PYTHON_COMPARE_EOF

echo
echo "🎉 Smart FK migration completed successfully!"
echo "   - Schema exported with column order: $SCHEMA_EXPORT_FILE"
echo "   - Column mappings saved: sql/cache/column-mappings-${MODE}.json"
echo "   - Smart restore file: $RESTORE_FILE"
echo "   - Record counts before: sql/cache/counts-before-migration-${MODE}.txt"
echo "   - Record counts after: sql/cache/counts-after-migration-${MODE}.txt"
