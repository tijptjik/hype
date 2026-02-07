#!/bin/bash

# Reorder an existing SQL backup file
# Usage: ./create_ordered_backup.sh [input_sql_file] [output_file] [--data-only]

INPUT_FILE="${1}"
OUTPUT_FILE="${2:-reordered_$(basename "$INPUT_FILE")}"
DATA_ONLY_FLAG="${3}"

if [ -z "$INPUT_FILE" ]; then
    echo "Error: Input SQL file required"
    echo "Usage: $0 <input_sql_file> [output_file] [--data-only]"
    exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

if [ "$DATA_ONLY_FLAG" = "--data-only" ]; then
    echo "Reordering SQL file (DATA ONLY) from $INPUT_FILE to $OUTPUT_FILE"
else
    echo "Reordering SQL file from $INPUT_FILE to $OUTPUT_FILE"
fi

# Define table order based on dependencies
TABLES=(
    # Level 0: Independent tables
    "d1_migrations"
    "hub"
    "user"
    "image"
    "verification"

    # Level 1: Depends on user/hub
    "account"
    "session"
    "userActivity"
    "hubI18n"
    "organisation"

    # Level 2: Depends on organisation
    "organisationI18n"
    "organisationRole"
    "project"

    # Level 3: Depends on project
    "projectI18n"
    "projectRole"
    "property"
    "layer"

    # Level 4: Depends on property/layer
    "propertyI18n"
    "propertyValue"
    "layerI18n"
    "layerProperty"
    "userLayer"
    "feature"

    # Level 5: Depends on propertyValue/feature
    "propertyValueI18n"
    "featureI18n"
    "featureImage"
    "featureProperty"
    "userFeature"
    "task"

    # Level 6: Depends on featureProperty/task
    "featurePropertyI18n"
    "taskImage"
)

# Create temporary files for parsing
TEMP_DIR=$(mktemp -d)

# Split the file into statements using a more robust approach
echo "Parsing input file..."

# First, inline all statements but handle quoted semicolons properly
echo "Inlining statements..."
# Create Python script in temp file
cat > "$TEMP_DIR/sql_parser.py" << 'PYEOF'
import sys
import re

def split_sql_statements(content):
    """Split SQL content into statements, respecting quoted strings"""
    statements = []
    current_statement = []
    in_single_quote = False
    in_double_quote = False
    in_backtick = False
    i = 0
    content_len = len(content)

    while i < content_len:
        char = content[i]

        # Handle backtick quotes (MySQL/SQLite identifiers)
        if char == '`' and not in_single_quote and not in_double_quote:
            in_backtick = not in_backtick
            current_statement.append(char)
            i += 1
        # Handle single quotes (SQL string literals)
        elif char == "'" and not in_double_quote and not in_backtick:
            # Check for escaped single quote (SQL uses '' to escape ')
            if i + 1 < content_len and content[i + 1] == "'":
                current_statement.append("''")
                i += 2
            else:
                in_single_quote = not in_single_quote
                current_statement.append(char)
                i += 1
        # Handle double quotes
        elif char == '"' and not in_single_quote and not in_backtick:
            in_double_quote = not in_double_quote
            current_statement.append(char)
            i += 1
        # Statement terminator
        elif char == ';' and not in_single_quote and not in_double_quote and not in_backtick:
            stmt = ''.join(current_statement).strip()
            if stmt and not stmt.startswith('PRAGMA defer_foreign_keys'):
                statements.append(stmt)
            current_statement = []
            i += 1
        else:
            current_statement.append(char)
            i += 1

    # Handle last statement if it doesn't end with semicolon
    if current_statement:
        stmt = ''.join(current_statement).strip()
        if stmt and not stmt.startswith('PRAGMA defer_foreign_keys'):
            statements.append(stmt)

    return statements

# Get input file from command line argument
input_file = sys.argv[1]
with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

statements = split_sql_statements(content)

# Write each statement on a single line
for stmt in statements:
    # Clean up whitespace but preserve content
    cleaned = re.sub(r'\s+', ' ', stmt.strip())
    if cleaned:
        # Convert CREATE TABLE to CREATE TABLE IF NOT EXISTS
        if cleaned.startswith('CREATE TABLE ') and 'IF NOT EXISTS' not in cleaned:
            cleaned = cleaned.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1)
        print(cleaned + ';')
PYEOF

python3 "$TEMP_DIR/sql_parser.py" "$INPUT_FILE" > "$TEMP_DIR/inlined.sql"

echo "Extracting statements..."

# Now extract statements using simple grep on the inlined file
grep -E "^CREATE TABLE( IF NOT EXISTS)?" "$TEMP_DIR/inlined.sql" | while read -r line; do
    if [[ $line =~ CREATE\ TABLE(\ IF\ NOT\ EXISTS)?\ ([\`\"]*[^\`\"[:space:]\(]+[\`\"]*) ]]; then
        table_name="${BASH_REMATCH[2]}"
        # Remove backticks and quotes for consistent naming
        table_name="${table_name//\`/}"
        table_name="${table_name//\"/}"
        echo "$table_name:$line" >> "$TEMP_DIR/creates.sql"
    fi
done

# Extract all INSERT statements
grep "^INSERT INTO" "$TEMP_DIR/inlined.sql" | while read -r line; do
    if [[ $line =~ INSERT\ INTO\ (\`?[^\`[:space:]]+\`?) ]]; then
        table_name="${BASH_REMATCH[1]}"
        # Remove backticks and quotes for consistent naming
        table_name="${table_name//\`/}"
        table_name="${table_name//\"/}"
        echo "$table_name:$line" >> "$TEMP_DIR/inserts.sql"
    fi
done

# Extract constraints and indexes
grep -E "^(ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX)" "$TEMP_DIR/inlined.sql" > "$TEMP_DIR/constraints.sql"

# Extract other statements (excluding PRAGMA defer_foreign_keys and the main statement types)
grep -v -E "^(CREATE TABLE|INSERT INTO|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|PRAGMA defer_foreign_keys)" "$TEMP_DIR/inlined.sql" > "$TEMP_DIR/other.sql"

# Generate the output file
echo "Generating reordered output..."

{
    echo "PRAGMA defer_foreign_keys = ON;"
    echo "PRAGMA foreign_keys = OFF;"
    echo ""

    # Add any other initial statements (excluding creates, inserts, constraints)
    if [ -s "$TEMP_DIR/other.sql" ]; then
        echo "-- ═══════════════════════════════════════════════════════════════════════════════"
        echo "-- INITIAL STATEMENTS"
        echo "-- ═══════════════════════════════════════════════════════════════════════════════"
        cat "$TEMP_DIR/other.sql"
        echo ""
    fi

    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- TABLE STRUCTURES (DEPENDENCY ORDER)"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo ""

    # Track processed tables to avoid duplication
    declare -A processed_tables

    # Level 0: Independent tables
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- LEVEL 0: INDEPENDENT TABLES"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    level0_tables=("d1_migrations" "hub" "user" "image" "verification")
    for table in "${level0_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/creates.sql" 2>/dev/null; then
            echo "-- $table"
            grep "^$table:" "$TEMP_DIR/creates.sql" | cut -d: -f2-
            processed_tables["$table"]=1
            echo ""
        fi
    done

    # Level 1: Depends on Level 0
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- LEVEL 1: DEPENDS ON LEVEL 0"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    level1_tables=("account" "session" "userActivity" "hubI18n" "organisation" "organisationI18n" "organisationRole")
    for table in "${level1_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/creates.sql" 2>/dev/null; then
            echo "-- $table"
            grep "^$table:" "$TEMP_DIR/creates.sql" | cut -d: -f2-
            processed_tables["$table"]=1
            echo ""
        fi
    done

    # Level 2: Depends on Level 1
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- LEVEL 2: DEPENDS ON LEVEL 1"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    level2_tables=("project" "projectI18n" "projectRole" "property" "propertyI18n" "propertyValue" "propertyValueI18n")
    for table in "${level2_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/creates.sql" 2>/dev/null; then
            echo "-- $table"
            grep "^$table:" "$TEMP_DIR/creates.sql" | cut -d: -f2-
            processed_tables["$table"]=1
            echo ""
        fi
    done

    # Level 3: Depends on Level 2
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- LEVEL 3: DEPENDS ON LEVEL 2"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    level3_tables=("layer" "layerI18n" "layerProperty" "feature" "featureI18n" "featureImage" "featureProperty" "featurePropertyI18n")
    for table in "${level3_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/creates.sql" 2>/dev/null; then
            echo "-- $table"
            grep "^$table:" "$TEMP_DIR/creates.sql" | cut -d: -f2-
            processed_tables["$table"]=1
            echo ""
        fi
    done

    # Level 4: Depends on Level 3
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- LEVEL 4: DEPENDS ON LEVEL 3"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    level4_tables=("userFeature" "userLayer" "task" "taskImage")
    for table in "${level4_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/creates.sql" 2>/dev/null; then
            echo "-- $table"
            grep "^$table:" "$TEMP_DIR/creates.sql" | cut -d: -f2-
            processed_tables["$table"]=1
            echo ""
        fi
    done

    # Any remaining tables not in our predefined order
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- REMAINING TABLES"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    if [ -s "$TEMP_DIR/creates.sql" ]; then
        while IFS=: read -r table_name create_stmt; do
            if [[ -z "${processed_tables[$table_name]}" ]]; then
                echo "-- $table_name"
                echo "$create_stmt"
                echo ""
            fi
        done < "$TEMP_DIR/creates.sql"
    fi

    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo "-- TABLE DATA (DEPENDENCY ORDER)"
    echo "-- ═══════════════════════════════════════════════════════════════════════════════"
    echo ""

    # Insert data in the same dependency order
    all_tables=("${level0_tables[@]}" "${level1_tables[@]}" "${level2_tables[@]}" "${level3_tables[@]}" "${level4_tables[@]}")

    for table in "${all_tables[@]}"; do
        if grep -q "^$table:" "$TEMP_DIR/inserts.sql" 2>/dev/null; then
            insert_stmts=$(grep "^$table:" "$TEMP_DIR/inserts.sql" | cut -d: -f2-)
            printf -- "-- %s data\n%s\n\n" "$table" "$insert_stmts"
        fi
    done

    # Insert data for any remaining tables
    if [ -s "$TEMP_DIR/inserts.sql" ]; then
        declare -A processed_inserts
        for table in "${all_tables[@]}"; do
            processed_inserts["$table"]=1
        done

        while IFS=: read -r table_name insert_stmt; do
            if [[ -z "${processed_inserts[$table_name]}" ]]; then
                if [[ -z "${processed_inserts[$table_name]}" ]]; then
                    echo "-- $table_name data"
                    processed_inserts["$table_name"]=1
                fi
                echo "$insert_stmt"
            fi
        done < "$TEMP_DIR/inserts.sql"
    fi

    # Add constraints and indexes at the end
    if [ -s "$TEMP_DIR/constraints.sql" ]; then
        echo ""
        echo "-- ═══════════════════════════════════════════════════════════════════════════════"
        echo "-- CONSTRAINTS AND INDEXES"
        echo "-- ═══════════════════════════════════════════════════════════════════════════════"
        cat "$TEMP_DIR/constraints.sql"
    fi

} > "$OUTPUT_FILE"

# Cleanup
rm -rf "$TEMP_DIR"

echo "Reordering completed: $OUTPUT_FILE"
echo "File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
