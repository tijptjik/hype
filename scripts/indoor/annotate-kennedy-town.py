"""Compatibility entry point for the original Kennedy Town annotation experiment.

Usage: dev-check python3 scripts/indoor/annotate-kennedy-town.py BUNDLE NETWORK OUTPUT
No source geometry, draft, or publication is modified. Requires shapely.
"""
import json
import sys
from pathlib import Path
from annotate_mtr_connectors import annotate

bundle, network, output = map(Path, sys.argv[1:])
assert json.loads(network.read_text())["code"] == "KET"
result = annotate(bundle, network)
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(dict(annotated=len(result["annotations"]), unresolved=len(result["unresolved"]))))
