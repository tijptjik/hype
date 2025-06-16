#!/bin/bash

# Fix backup data to use explicit column names instead of positional VALUES()
# Usage: ./fix_backup_column_order.sh input_file output_file

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ -z "$INPUT_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
    echo "Usage: $0 input_file output_file"
    exit 1
fi

# Use Python to fix the column order
python3 - "$INPUT_FILE" > "$OUTPUT_FILE" << 'PYTHON_EOF'
import re
import sys

# Read the input file with UTF-8 encoding
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    content = f.read()

# Define expected column orders for key tables after FK migration
table_columns = {
    'organisation': ['id', 'code', 'url', 'imageId', 'hubId', 'isHubExclusive', 'isCoreInclusive', 'isPublished', 'publishedAt', 'publisherId', 'isArchived', 'createdAt', 'modifiedAt'],
    'project': ['id', 'organisationId', 'code', 'imageId', 'isPublished', 'publishedAt', 'publisherId', 'isArchived', 'createdAt', 'modifiedAt'],
    'layer': ['id', 'organisationId', 'projectId', 'metadata', 'isDefaultVisible', 'isPublished', 'publishedAt', 'publisherId', 'isArchived', 'createdAt', 'modifiedAt'],
    'feature': ['id', 'organisationId', 'projectId', 'layerId', 'contributorId', 'geometry', 'addressMeta', 'isPublished', 'publisherId', 'publishedAt', 'isPendingReview', 'isArchived', 'isIntangible', 'isVisitable', 'visitableAsOf', 'createdAt', 'modifiedAt'],
    'featureProperty': ['featureId', 'propertyId', 'propertyValueId', 'value'],
    'property': ['id', 'projectId', 'type', 'isTranslatable', 'key', 'rank', 'component', 'min', 'max', 'isUserContributed', 'createdAt', 'modifiedAt'],
    'layerProperty': ['layerId', 'propertyId', 'isVisible', 'isUserContributed'],
    'organisationRole': ['organisationId', 'userId', 'role'],
    'projectRole': ['projectId', 'userId', 'role'],
    'userFeature': ['userId', 'featureId', 'sentiment'],
    'userLayer': ['userId', 'layerId', 'sentiment'],
    'task': ['id', 'organisationId', 'projectId', 'layerId', 'featureId', 'contributorId', 'type', 'data', 'status', 'createdAt', 'modifiedAt'],
    'taskImage': ['taskId', 'imageId', 'intent'],
    'featureImage': ['featureId', 'imageId', 'intent'],
    'featurePropertyI18n': ['featureId', 'propertyId', 'lang', 'value', 'isVerified']
}

def parse_values(values_str):
    """Parse VALUES(...) content, respecting quoted strings and NULL"""
    values = []
    current_value = ""
    in_quote = False
    quote_char = None
    paren_level = 0
    
    i = 0
    while i < len(values_str):
        char = values_str[i]
        
        if char == '(' and not in_quote:
            paren_level += 1
            if paren_level == 1:
                i += 1
                continue
        elif char == ')' and not in_quote:
            paren_level -= 1
            if paren_level == 0:
                # End of values
                if current_value.strip():
                    values.append(current_value.strip())
                break
        elif char in ['"', "'"] and not in_quote:
            in_quote = True
            quote_char = char
            current_value += char
        elif char == quote_char and in_quote:
            # Check for escaped quote
            if i + 1 < len(values_str) and values_str[i + 1] == quote_char:
                current_value += char + char
                i += 2
                continue
            else:
                in_quote = False
                quote_char = None
                current_value += char
        elif char == ',' and not in_quote and paren_level == 1:
            values.append(current_value.strip())
            current_value = ""
        else:
            current_value += char
        
        i += 1
    
    return values

def fix_insert_statement(line):
    """Convert VALUES() INSERT to column-named INSERT"""
    # Match INSERT INTO table VALUES(...)
    match = re.match(r'INSERT INTO (\w+) VALUES\((.*)\);?', line, re.DOTALL)
    if not match:
        return line
    
    table_name = match.group(1)
    values_content = match.group(2)
    
    if table_name not in table_columns:
        # For tables we don't know about, keep original format
        return line
    
    # Parse the values
    values = parse_values('(' + values_content + ')')
    columns = table_columns[table_name]
    
    if len(values) != len(columns):
        print(f"Warning: Column count mismatch for {table_name}. Expected {len(columns)}, got {len(values)}", file=sys.stderr)
        return line
    
    # Build the new INSERT statement
    column_list = '(' + ', '.join(f'"{col}"' for col in columns) + ')'
    value_list = '(' + ', '.join(values) + ')'
    
    return f'INSERT INTO {table_name}{column_list} VALUES{value_list};'

# Process each line
lines = content.split('\n')
for line in lines:
    line = line.strip()
    if line.startswith('INSERT INTO'):
        print(fix_insert_statement(line))
    else:
        print(line)
PYTHON_EOF

echo "✅ Backup data fixed: $OUTPUT_FILE" 