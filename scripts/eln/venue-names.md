# ELN venue name corrections

Refs [#194](https://github.com/tijptjik/hype/issues/194); domain design:
[`01-places-features.md`](../../spec/breadline/proposal/01-places-features.md).
Research undertaken on 21 October 2026. No application schema or evidence platform
is added. The small source catalogue is [`data/venue-names.json`](data/venue-names.json).

## Entity boundary

All 39 inventoried ELN Features have an associated Location whose English name
was copied from the book title or country placeholder. Those are valid **Feature
titles** but invalid **venue names**. The proposal corrects Location names only,
preserving Feature titles, addresses, associations, publication state and all
unrelated locales. Independent Location IDs are not merged automatically.

There are 18 distinct venue groups across 39 Location IDs. Edition totals:
2024: 4; 2025: 13; 2026: 11; 2027: 11. The 2027 Wyndham Social venues remain
organiser-selected provisional venues; a name correction does not confirm the
future programme.

## Research results

Every English proposal is supported by its exact preserved Feature venue address.
The official [2024 organiser programme](https://iichongkong.esteri.it/en/gli_eventi/calendario/literature-night-hong-kong-2024-free-event/)
and [2025 organiser line-up](https://www.exteriores.gob.es/Consulados/hongkong/en/Comunicacion/Noticias/Paginas/Articulos/20250818_not1.aspx)
corroborate their named venues. First-party venue links and short quotes are in
the catalogue. Traditional Chinese names are proposed only where a first-party
bilingual source was retrieved, with matching branch identity.

| Venue group | Proposed Traditional Chinese | Locations | Evidence / unresolved reason |
| --- | --- | ---: | --- |
| Project House | Unresolved | 1 | 2025 organiser establishes English name; no verified Chinese trading name retrieved. |
| COMMAA | Unresolved | 1 | [LAAB's commaa page](https://www.laab.pro/en/team/commaa/) matches Shop 2, 11 Po Yan Street; Chinese links retain Latin name. |
| La Galerie Paris 1839 | Unresolved | 2 | [Venue website](https://www.lagalerie.hk/) has English name; no verified Chinese trading name. |
| La Biblioteca Italian Library | 意大利圖書館 | 3 | [PMQ bilingual tenant listing](https://www.pmq.org.hk/shop/la-biblioteca-italian-library/?lang=ch), H210. |
| PMQ Taste Library | PMQ 味道圖書館 | 2 | [PMQ's own library page](https://www.pmq.org.hk/shop/pmq-taste-library/?lang=ch). Retain the imported event-specific room addresses. |
| Habyt | Unresolved | 2 | Organiser line-up establishes venue; guessed website routes were unavailable. Do not translate the brand. |
| Bookazine Social | Unresolved | 2 | [Official Tai Kwun Chinese directory](https://www.taikwun.hk/zh/lifestyle_enjoyment) uses “Bookazine Social”; no separate Chinese name proposed. |
| Parenthèses | Unresolved | 2 | [Official bookshop website](https://www.parentheses-hk.com/) is French/English; descriptive “French bookshop” translations are not evidenced Chinese trading names. |
| The Flying Club | Unresolved | 1 | Organiser line-up establishes venue; no verified Chinese name retrieved. |
| Wyndham Social | Unresolved | 15 | [Venue website](https://www.wyndhamsocial.com/) identifies Wyndham Social at 33 Wyndham Street; no separate Chinese name verified. |
| Ztoryhome | Unresolved | 1 | Organiser line-up and [official Instagram](https://www.instagram.com/ztoryhome/) use Latin name. |
| TASCHEN | Unresolved | 1 | [Official Tai Kwun Chinese directory](https://www.taikwun.hk/zh/lifestyle_enjoyment) retains “TASCHEN”, Shop 01-G02. |
| Novalis Art Design | Unresolved | 1 | [Official gallery website](https://www.novalisartdesign.com/) matches 197 Hollywood Road; no Chinese name verified. |
| The Siberian | Unresolved | 1 | English source is the imported venue address; first-party domain/social pages unavailable or login-only. |
| Mount Zero Books | Unresolved | 1 | English source is the imported venue address. Candidate 見山書店 was not retrieved from an eligible first-party page, so it is not applied. |
| Print Art Contemporary | 當代印藝 | 1 | [PMQ bilingual tenant listing](https://www.pmq.org.hk/shop/print-art-contemporary/?lang=ch), PMQ SG03-SG07. |
| One Bite Design Studio | Unresolved | 1 | [Official studio website](https://onebitedesign.com/) identifies the company; no verified Chinese trading name. |
| 10 Chancery Lane Gallery | 10 號贊善里畫廊 | 1 | [Official Chinese contact page](https://www.10chancerylanegallery.com/zh/contact/) identifies 10 Chancery Lane, Central. |

Four evidenced Chinese venue names cover seven Location IDs. Fourteen venue
groups / 32 Location IDs remain without an evidenced Chinese name. None already
had a Traditional Chinese Location name in the inventory. No Chinese name is
inferred, machine-translated or copied from an unrelated branch. Blocked pages
and search snippets are not treated as evidence.

The La Galerie website currently says it is temporarily closed for required
works. This naming task proposes no operating-status change, and especially no
permanent closure inferred from that message.

## Reviewable application contract

Generate a plan against an explicitly selected local database:

```sh
python scripts/eln/plan-venue-names.py \
  --database /absolute/path/to/local.sqlite \
  --output .local/eln-venue-research/plan
```

The SQLite connection is opened read-only. The output JSONL contains the stable
Feature/Location/Organisation IDs, both current revision fences, complete effective
`expectedBefore` and `proposedAfter` name dictionaries, source links/quotes and
one decision per inventoried Feature. New listings remain unresolved rather than
being silently omitted. Changed venue addresses/associations, conflicting existing
names, incorrect persisted scope and conflicting shared Locations require review.

At the researched local snapshot, all 39 name changes are supported. Regenerate
after coordinated kind seeding or another baseline edit changes revision fences.
The integration runner must apply only supported, de-duplicated
Organisation/Location destinations using `updateLocalLocationAddress` with
`names: proposedAfter` and both expected revision values. This preserves existing
owner-baseline versus source-linked Organisation-correction semantics. Linked
Features retain their accepted revisions and separate adoption decisions.

The integration runner owns backup, local service rehearsal, stale-write checks,
rollback material and repeat-application verification. This planner performs no
database writes, and no remote database has been changed by this research task.

Apply a reviewed plan with the local-only service runner (validation is the default):

```sh
bun scripts/eln/apply-venue-names.ts \
  /absolute/path/to/local.sqlite \
  .local/eln-venue-research/plan/names-proposals.jsonl \
  .local/eln-venue-research/application/receipt.json
```

Back up the selected database before adding `--apply`. The runner validates the
entire scope, old names and revision heads before writing, rejects conflicting
shared-Location proposals, and saves through `updateLocalLocationAddress`.
It verifies that other Location facts, Feature translations and associations
remain unchanged. Exact-name replays make no new revisions. Receipts retain old
names and resulting revision tokens for guarded compensating name revisions;
do not restore a whole database over concurrent unrelated work.

The 21 October 2026 local application corrected 39 English Location names and
added seven evidenced Traditional Chinese names. Forward and compensating
rollback rehearsals each wrote 39 immutable revisions; each replay wrote zero.
Stale revisions, wrong Organisation scope and conflicting shared proposals were
rejected before any write. Database integrity and foreign keys passed. Private
plans, receipts, backups and the inverse manifest are retained under
`.local/eln-venue-research/application/`. No remote application was performed.

Focused checks:

```sh
python -m unittest discover -s scripts/eln -p 'test_plan_venue_names.py' -v
```

Nine tests cover entity separation, read-only planning, locale preservation,
replay/no-op, Chinese/editorial conflicts, revision fences, newly added listings,
changed addresses, incorrect scope and inconsistent shared Location proposals.
