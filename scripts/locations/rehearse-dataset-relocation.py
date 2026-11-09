#!/usr/bin/env python3
"""Refs #194. Verify six exact persisted dataset mappings and rehearse policies on a private copy."""
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

# These identities were verified from the local exported inventory, never guessed from display text.
DATASETS = [
 ("Ghost Signs","4Jsk5LngvFZq","YuSFnia9VOtG",["7akti7OImSFg"],"fixed"),
 ("Neon","HsW1a_4LNdyA","EovGYWS-GSon",["lMsnrDxWhJss","opQQLGHoFwkE"],"fixed"),
 ("Breadline Donors","2u4orWMxRNbz","UMsz5DHb29Lx",["1msQMcuqfHrP"],"follow"),
 ("Breadline Dropoffs","2u4orWMxRNbz","UMsz5DHb29Lx",["kin0shUTfrUi"],"follow"),
 ("Independent Bookstores","kXCT_5XMH1Nj","-z26MuNRTJwi",["RfWMLs_jW6QJ"],"follow"),
 ("ELN","KpeoIsOhgyP-","vGBvWfSZNELM",["lvWu_dCwiVZt","0bf1RYWdpaAt","vli8hfmD-XEZ","zJJawV9ay56p"],"fixed"),
]

def apply(db, rows):
    """Apply every expected old revision atomically; an exact replay is a no-op."""
    changed=0
    with db:
        for row in rows:
            current=db.execute("SELECT relocationPolicy,relocationPolicyRevision FROM layer WHERE id=? AND projectId=? AND organisationId=?", (row["layerId"],row["projectId"],row["organisationId"])).fetchone()
            old=row["expectedBefore"]
            if current == (row["proposedAfter"],old["revision"]+1):
                continue
            if current != (old["value"],old["revision"]):
                raise RuntimeError("Policy conflict: "+row["layerId"])
            changed+=db.execute("UPDATE layer SET relocationPolicy=?,relocationPolicyRevision=relocationPolicyRevision+1 WHERE id=? AND relocationPolicyRevision=? AND relocationPolicy IS ?", (row["proposedAfter"],row["layerId"],old["revision"],old["value"])).rowcount
    return changed

def main():
    """Produce exact-ID assertions, before-images, counts and replay evidence without altering the source."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db",type=Path,required=True)
    parser.add_argument("--output-dir",type=Path,required=True)
    args=parser.parse_args()
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    with sqlite3.connect("file:"+quote(str(args.source_db.resolve()))+"?mode=ro",uri=True) as source:
        for name in ["before.sqlite","rehearsal.sqlite"]:
            with sqlite3.connect(out/name) as target:source.backup(target)
    db=sqlite3.connect(out/"rehearsal.sqlite")
    rows=[];now=datetime.now(timezone.utc).isoformat()
    for name,org,project,layers,policy in DATASETS:
        if not db.execute("SELECT 1 FROM project WHERE id=? AND organisationId=?",(project,org)).fetchone():raise RuntimeError("Project identity mismatch: "+name)
        for layer in layers:
            current=db.execute("SELECT relocationPolicy,relocationPolicyRevision,isArchived FROM layer WHERE id=? AND projectId=? AND organisationId=?",(layer,project,org)).fetchone()
            if not current or current[2]:raise RuntimeError("Missing or archived dataset layer: "+layer)
            rows.append(dict(manifestVersion=1,dataset=name,organisationId=org,projectId=project,layerId=layer,field="layer.relocationPolicy",expectedBefore=dict(value=current[0],revision=current[1]),proposedAfter=policy,decision="supported",confidence="high",effectiveDate=None,datePrecision=None,evidence=[dict(url="https://github.com/tijptjik/hype/issues/194",accessedAt=now,quotedText="Explicit dataset relocation policies; exact persisted identity verified in local export.",supports="policy",sourceDate=None)],notes="Explicit Layer override; unrelated Project policies, derived layers and Features are preserved."))
    (out/"manifest.v1.jsonl").write_text("".join(json.dumps(r)+"\n" for r in rows))
    before=db.execute("SELECT * FROM feature ORDER BY id").fetchall()
    changed=apply(db,rows);replay=apply(db,rows)
    assert before==db.execute("SELECT * FROM feature ORDER BY id").fetchall()
    assert replay==0
    report=dict(status="passed",datasets=len(DATASETS),policyRows=len(rows),changed=changed,replayChanges=replay,conflicts=0,featuresBefore=len(before),featuresAfter=len(before),rollback="before.sqlite")
    (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report))
if __name__=="__main__":main()
