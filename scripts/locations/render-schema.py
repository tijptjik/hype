# Refs #194. Render the Location schema from read-only SQLite introspection; no row data is exported.
from pathlib import Path
import json,html,subprocess,sqlite3,sys
if len(sys.argv)!=3: raise SystemExit("Usage: render-schema.py SQLITE_FILE OUTPUT_DIRECTORY")
root=Path(sys.argv[2]).resolve()
root.mkdir(parents=True,exist_ok=True)
core=['location','locationRevision','organisationLocation','featureLocation']
audit=['featureLocationHistory','locationIdentityHistory']
review=['locationIdentityReview','locationAdoptionProposal']
sync=['locationRefresh','locationRefreshItem']
context=['organisation','project','feature','featureI18n','breadlineImportFeature']
connection=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
connection.row_factory=sqlite3.Row
schema={n:{'columns':[dict(r) for r in connection.execute('PRAGMA table_info("'+n+'")')],'foreignKeys':[dict(r) for r in connection.execute('PRAGMA foreign_key_list("'+n+'")')]} for n in core+audit+review+sync+context}
connection.close()
(root/'schema.json').write_text(json.dumps(schema,indent=2))
selected={
'organisation':['id'],
'project':['id','organisationId','locationPolicy','locationPolicyRevision'],
'feature':['id','organisationId','projectId','geometry','addressMeta','localLocationBrands'],
'featureI18n':['featureId','locale','title','displayAddress'],
'breadlineImportFeature':None,
}
json_fields={'redirect','payload','facts','overrides','acceptedOverrides','history','evidence','factsDecision','locationDecision','baseline','projection','mergeReviews','rejection','accepted','target','outcomes','locationPolicy','localLocationBrands','geometry','addressMeta'}
colours={'core':('#dbeafe','#1d4ed8'),'audit':('#ede9fe','#6d28d9'),'review':('#fef3c7','#b45309'),'sync':('#ccfbf1','#0f766e'),'context':('#e2e8f0','#475569')}
node_group={n:g for g,names in [('core',core),('audit',audit),('review',review),('sync',sync),('context',context)] for n in names}
lines=['digraph Locations {', 'graph [rankdir=LR, bgcolor="#f8fafc", pad="0.4", nodesep="0.28", ranksep="0.5", splines=polyline, fontname="DejaVu Sans", fontsize=22, labelloc=t, labeljust=l, label="HYPE Locations  |  Organisation-wide corrections\\nTen Location tables + selected fields from existing HYPE tables"];','node [shape=plain, fontname="DejaVu Sans", fontsize=11];','edge [fontname="DejaVu Sans", fontsize=9, color="#64748b", fontcolor="#475569", arrowsize=0.65];']
for n,data in schema.items():
 g=node_group[n];bg,fg=colours[g]
 cols=[x for x in sorted(data['columns'],key=lambda x:x['name'] in ['createdAt','updatedAt','modifiedAt']) if n not in selected or selected[n] is None or x['name'] in selected[n]]
 fks={x['from'] for x in data['foreignKeys']}
 rows=[]
 for col in cols:
  name=col['name'];tag='PK' if col['pk'] else ''
  if name in fks:tag+=(' / ' if tag else '')+'FK'
  if n=='location' and name=='ssId':tag='UQ'
  nullable=not col['notnull'] and not col['pk']
  label=html.escape(name)+(' ?' if nullable else '')
  dtype='JSON' if name in json_fields else col['type']
  if name=='id' and n=='organisation':label='id'
  rows.append(f'<TR><TD PORT="{name}" COLSPAN="3" ALIGN="LEFT"><TABLE BORDER="0" CELLBORDER="0" CELLPADDING="0" CELLSPACING="0"><TR><TD WIDTH="205" ALIGN="LEFT"><FONT COLOR="#0f172a">{label}</FONT></TD><TD WIDTH="62" ALIGN="LEFT"><FONT COLOR="#64748b">{dtype}</FONT></TD><TD WIDTH="42" ALIGN="LEFT"><FONT COLOR="{fg}">{tag or "&#160;"}</FONT></TD></TR></TABLE></TD></TR>')
 subtitle={'location':'Identity / ownership / source link','locationRevision':'Immutable facts and source evidence','featureLocation':'Accepted baseline + Organisation snapshots','organisationLocation':'One correction head per Organisation / Location','featureLocationHistory':'Immutable association history','locationIdentityReview':'Captured source-match / merge evidence','locationIdentityHistory':'Accepted source identity transitions','locationAdoptionProposal':'Feature-specific upstream change review','locationRefresh':'Singleton monthly sync coordinator','locationRefreshItem':'Source or local change / Feature cursor'}.get(n,'Existing HYPE table — selected fields' if n!='breadlineImportFeature' else 'Breadline import identity ledger')
 lines.append(f'{n} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" COLOR="{fg}" BGCOLOR="white"><TR><TD COLSPAN="3" ALIGN="LEFT" BGCOLOR="{bg}"><FONT POINT-SIZE="14" COLOR="{fg}"><B>{n}</B></FONT></TD></TR><TR><TD COLSPAN="3" ALIGN="LEFT"><FONT POINT-SIZE="9" COLOR="#64748b">{html.escape(subtitle)}</FONT></TD></TR>'+''.join(rows)+'</TABLE>>];')
# Keep the core model central and group companion tables into readable columns.
lines+=['{rank=same; organisation; project; feature; featureI18n; breadlineImportFeature;}','{rank=same; location; organisationLocation; featureLocation; locationRevision;}','{rank=same; locationIdentityReview; locationIdentityHistory; featureLocationHistory;}','{rank=same; locationAdoptionProposal; locationRefresh; locationRefreshItem;}']
# Invisible edges establish column order without changing schema relationships.
for group in [context, ['location','organisationLocation','featureLocation','locationRevision'], ['locationIdentityReview','locationIdentityHistory','featureLocationHistory'], ['locationAdoptionProposal','locationRefresh','locationRefreshItem'], ['source','details']]:
 lines.append(' -> '.join(group)+' [style=invis,weight=100];')
lines+=['organisation -> location [style=invis,weight=30];','location -> locationIdentityReview [style=invis,weight=20];','locationIdentityReview -> locationAdoptionProposal [style=invis,weight=20];']
columns={**{n:0 for n in context},**{n:1 for n in core},**{n:2 for n in audit+review if n!='locationAdoptionProposal'},**{n:3 for n in sync+['locationAdoptionProposal']},'source':4}
# Actual database foreign keys: arrows point from referencing columns to referenced keys.
for child,data in schema.items():
 groups={}
 for fk in data['foreignKeys']:
  if fk['table'] not in schema:continue
  if child in selected and selected[child] is not None and fk['from'] not in selected[child]:continue
  groups.setdefault(fk['id'],[]).append(fk)
 for group in groups.values():
  fk=group[0];parent=fk['table']
  if child==parent:
   continue
   label='optional redirect' if child=='location' else 'previous event'
   lines.append(f'{child}:{fk["from"]}:e -> {parent}:{fk["to"]}:e [constraint=false,label="",color="#94a3b8"];')
  else:
   label=''
   if child=='featureLocation' and parent=='locationRevision':label='accepted facts' if any(x['from']=='factsRevisionId' for x in group) else 'accepted position'
   if child=='featureLocation' and parent=='feature':label='0..1 association / Feature'
   if child=='featureLocation' and parent=='location':label='many Features / Location'
   if child=='locationRevision' and parent=='location':label='many revisions / Location'
   if child=='location' and parent=='organisation':label='optional baseline curator'
   port=next((x['from'] for x in group if x['from']!='locationId'),fk['from'])
   target=next((x['to'] for x in group if x['from']==port),fk['to'])
   cs='e' if columns[child]<columns[parent] else 'w'
   ps='w' if columns[child]<columns[parent] else 'e'
   if columns[child]==columns[parent]:cs=ps='w' if columns[child]==0 else 'e'
   lines.append(f'{child}:{port}:{cs} -> {parent}:{target}:{ps} [constraint=false,label=""];')
logical=[('featureLocation','factsOrganisationRevision','organisationLocation','revision','accepted facts correction'),('featureLocation','locationOrganisationRevision','organisationLocation','revision','accepted position correction'),('featureI18n','featureId','feature','id','localized projection'),('featureLocationHistory','featureId','featureLocation','featureId','retained history'),('locationAdoptionProposal','featureId','featureLocation','featureId','association + revision token'),('locationAdoptionProposal','candidateRevisionId','locationRevision','id','candidate revision'),('locationAdoptionProposal','projectId','project','id','policy at proposal time'),('locationRefreshItem','runId','locationRefresh','runId','current run'),('locationRefreshItem','locationId','location','id','captured identity'),('locationRefreshItem','revisionId','locationRevision','id','captured revision')]
for a,ap,b,bp,label in logical:
 cs='e' if columns[a]<columns[b] else 'w';ps='w' if columns[a]<columns[b] else 'e'
 if columns[a]==columns[b]:cs=ps='e'
 lines.append(f'{a}:{ap}:{cs} -> {b}:{bp}:{ps} [constraint=false,style=dashed,color="#a78bfa",fontcolor="#7c3aed",label=""];')
lines+=['source [shape=box,style="rounded,filled",fillcolor="#ecfccb",color="#65a30d",fontcolor="#365314",label="SaanSeoi Places API\\nExternal establishment identity\\nid (GERS / SaanSeoi identity)"];','location:ssId:e -> source:w [constraint=false,style=dotted,color="#65a30d",label=""];', 'details [shape=box,style="rounded,filled",fillcolor="#f1f5f9",color="#cbd5e1",fontsize=10,label="JSON contents (not separate tables)\\l\\llocationRevision.facts (v1)\\l  schemaVersion, historical kind\\l  common: names, optional phones, location, successor\\l  details: strict establishment / building / natural type\\l  building: storeys, HKPD elevations, height, footprint ref\\l  location: { geometry, optional address }\\l  address: authored structured content, canonical IDs,\\l           snapshot, records, fallbackDisplay\\l\\lorganisationLocation.overrides + retained history\\l  names, phoneNumber, brands, location\\l  inherit | override(value) | clear\\l\\lfeatureLocation.acceptedOverrides\\l  Accepted cache; not an independent editable layer\\l  Separate accepted Organisation tokens per field group\\l\\lOwnership / visibility\\l  unresolved: shared; owner edits baseline\\l  manual: private to owning Organisation\\l  linked: shared; SaanSeoi controls baseline\\l  Other Organisation edits use organisationLocation\\l\\lproject.locationPolicy\\l  discovery radius + baseline / correction adoption rules\\l\\lLegend\\l  Solid arrows: database foreign keys (child to parent)\\l  Dashed arrows: logical / retained references, not FKs\\l  Dotted arrow: external source identity\\l  PK: primary key   FK: foreign key   UQ: unique\\l  ?: nullable   JSON: stored in a TEXT column\\l  Composite FKs pin accepted revisions to their Location.\\lFeature: at most one Location; Location: many Features.\\lBlue: core; amber: review; purple: audit; teal: sync.\\l  Self FKs: redirectTargetId -> location.id;\\l  previousHistoryId -> locationIdentityHistory.id.\\lActor IDs and historical receipts are retained values.\\l  Context tables omit unrelated fields / relationships.\\l"];','{rank=same; source; details;}','locationAdoptionProposal -> details [style=invis,weight=20];','}']
(root/'locations-schema.dot').write_text('\n'.join(lines))
for fmt in ['svg','png']:
 subprocess.run(['dot','-T'+fmt,'-Gdpi=160',str(root/'locations-schema.dot'),'-o',str(root/('locations-schema.'+fmt))],check=True)
from PIL import Image
im=Image.open(root/'locations-schema.png');print(im.size)
# A smaller contact sheet is only for inspection; the delivered PNG retains full resolution.
im.thumbnail((2200,1800));im.save(root/'preview.png')
