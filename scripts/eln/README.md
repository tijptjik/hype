# European Literature Night backfill

Research date: 20 October 2026. Content and development image SQL were applied to the local application database on 20 October 2026, following organiser approval. The generator and upload scripts do not apply SQL themselves.

## Deliverables

- `../../migrations/0127_eln_sourced_backfill.sql`: content, field configuration, narrowly matched typo corrections, and eleven new **draft** features on the existing 2027 layer.
- `data/backfill.json`: nineteen researched book records, per-record sources, editorial summaries, and the organiser's two 2027 nominations.
- `data/covers.json` and `data/covers/`: nineteen visually checked publisher/library cover images, source URLs, dimensions and SHA-256 hashes.
- `data/images-development.sql`: image records and canonical links, generated after uploading and reading back all nineteen covers from the **remote development** bucket `hype-assets-raw-dev`.
- `data/images-local.sql`: equivalent image records for the **simulated local** bucket, populated and verified for `hype.localhost`.

No production objects or databases were changed. Local application database backfill completed in one transaction with foreign-key and coverage checks before commit. Backup: `sql/backup/hype-db-local-before-eln-20261020T074438Z.sqlite`. Only this package’s SQL was executed; unrelated pending migrations were not applied. Development uploads contain both the working JPEG and `.raw` copy at content-addressed paths.

## Coverage and decisions

| Edition | Existing records | Work |
| --- | ---: | --- |
| 2024 | 4 | Country, author, synopsis, description, author biography, supported bibliographic details and four covers; retain existing hosts and venue addresses. |
| 2025 | 12 + 1 added | Confirmed Polish listing added at Ztoryhome. Synopsis, description, author biography, nine reader biographies, supported bibliographic details and thirteen covers. Existing reader and country values are preserved. |
| 2026 | 11 | Preserve the imported descriptions, biographies and covers; expose the fields and repair the performer biography's erroneous classifier/dropdown configuration. Correct the exact seeded September short labels to February. |
| 2027 | 0 | Germany and Czechia nominations with two covers, plus Belgium, France, Finland, Hungary, Italy, Ireland, The Netherlands, Spain and Ukraine placeholders. All eleven are drafts at Wyndham Social. |

The 2027 layer already exists as `zJJawV9ay56p` (“2027 - 4th Edition”). The migration deliberately requires that layer rather than creating a competing edition.

The publication extension was applied locally on 20 October 2026 with backup `sql/backup/hype-db-local-before-eln-20261020T074906Z.sqlite`. It publishes the project, the 2024–2026 layers and their listings (including Poland), and keeps the 2027 layer unpublished. It selects `flag` (Country chip) markers on the project and all four layers. `NocLit'25`, derived from the quiet `NocLit'26` layout with navy water, blue land, orange streets and white labels, is assigned to the project and first three layers. The 2027 layer retains its existing map style.

The new style's catalog entry, generated JSON and bundled picker thumbnail must accompany the SQL when delivering this change to another environment. All 35 focused style/schema/scope tests passed. Chromium rendered live tiles without errors; the full app verification server encountered a file-watcher limit, so the visual check used the generated style directly.

All four layers receive the existing country, synopsis, author, author biography, performer, performer biography and host fields, plus translator, publisher, ISBN, publication date, awards, sources, and nomination/availability notes. Missing values remain empty. The new bibliographic fields describe the researched English edition, not necessarily the physical edition used on the event night. A missing ISBN is preferable to identifying a print cover with an ebook ISBN.

The two new nominations retain the organiser-supplied copy. Germany's publisher corroborates ISBN 9780241772683, publication on 30 April 2026, Linda Gaus's translation and the 2024 German Book Prize. Czechia retains the Bookazine availability caveat. Public-source descriptions and biographies for earlier editions are short editorial paraphrases; they are not copied publisher blurbs. No translations or presenter assignments were invented.

The existing 2026 performer biographies are already in `featurePropertyI18n`; changing `performerBio` from `classifier / SelectField` to `specifier / TextareaField` makes those stored biographies usable. A migration guard refuses this conversion if classifier options have since been added.

The four 2024 titles have their exact seeded “Spot N - ” prefixes removed, leaving Kairos, The Lake, My Stupid Intentions and Dear Dickhead. The exact seeded typos “The Alaska Sanders Affairs” and “Nataliia Prysiazhniukiuk” are corrected only if the original strings are still present. Existing non-empty descriptions, property values, translations and canonical image choices are preserved.

## Remaining evidence gaps

- **2024 readers:** the surviving event announcement and map establish four venues, but the original detailed Goethe programme could not be retrieved. Reader names and biographies remain unfilled.
- **2025 reader biographies:** José Geral, Eva Wong and Nataliia Prysiazhniuk have programme-confirmed names, but a sufficiently reliable matching biography was not recovered. Their names remain in the existing records.
- **2025 Poland listing resolved:** the organiser confirmed Wisława Szymborska’s *Poems New and Collected*, read by Nancy Chui & friends at Ztoryhome. Added with the venue address and coordinates from the [venue listing](https://wanderlog.com/place/details/9702409/ztoryhome), a researched English-edition cover, author biography and bibliographic fields. It is published with the historical layers. The 2025 layer now contains thirteen book records.
- **Portraits:** no presenter portraits are included. The uploaded assets are book covers.
- **Local image delivery repaired:** the local asset Worker was stopped, causing HTTP 502, and the remote development uploads were absent from the simulated local bucket. All nineteen covers have now been copied and read back from `.wrangler/state/asset-service`; the simulated asset Worker serves them through `assets.hype.localhost`. Keep that Worker running alongside Vite.

For the documented local development setup, prepare the simulated storage and run the asset Worker:

```sh
python scripts/eln/upload-covers.py --stage local --local --write \
  --output scripts/eln/data/images-local.sql
bun run dev:asset-service:simulated
```

The local and remote development receipts use identical image IDs and content-addressed paths, so switching between these stores does not require changing the existing database links. A remote upload alone does not populate simulated storage.

## Review and rehearsal

The SQL requires the known ELN project, four layers, historical feature identities and Wyndham Social source point. New features copy that point's matching H3 index but do not copy place identity. There are thirteen spatial rows per new feature: 143 for 2027 and thirteen for the added Polish 2025 listing.

Generate the content migration:

```sh
python scripts/eln/generate.py
```

Rehearse against a database snapshot or the local database path (opened **read-only**, then copied into memory):

```sh
python scripts/eln/verify.py --database /absolute/path/to/database.sqlite \
  --images scripts/eln/data/images-development.sql
```

The checks cover repeat application, foreign keys, the eleven drafts, 143 spatial rows, unique layer assignments, cover links, existing feature preservation, preservation of a non-empty editorial value, and rejection of an incorrect target identity.

Apply the content SQL first and the **matching environment's** image SQL second using the repository's D1 execution workflow, after taking a destination-specific backup. Do not apply every pending repository migration merely to run this data backfill: other work is present in this checkout. The image SQL inserts links only where a feature does not already have a canonical image.

For another environment, first plan an upload:

```sh
python scripts/eln/upload-covers.py --stage preview --remote \
  --output /tmp/eln-images-preview.sql
```

Add `--write` only for the intended upload destination. The script validates every bundled hash before writing, reads each uploaded object back, and emits environment-specific SQL only after all uploads pass. `--local` explicitly selects Wrangler's simulated storage, with `.wrangler/state/asset-service` as its default persistence directory. Production requires a separate explicitly targeted upload and application; the development SQL is not a production asset migration.

## Main event sources

- [2024 organiser archive](https://www.nocliteratury.cz/zahranici-cs/2024/11/18/noc-literatury-v-hongkongu-2024/) and [Italian Cultural Institute announcement](https://iichongkong.esteri.it/en/gli_eventi/calendario/literature-night-hong-kong-2024-free-event/).
- [2024 Bookazine selection](https://bookazine.com.hk/collections/literature-night-hong-kong-2024).
- [2025 official line-up](https://www.exteriores.gob.es/Consulados/hongkong/en/Comunicacion/Noticias/Paginas/Articulos/20250818_not1.aspx), [Czech Consulate report](https://mzv.gov.cz/hongkong/en/archive_of_news_and_events/evropska_noc_literatury.html), and [PMQ reader biography](https://www.pmq.org.hk/event/european-literature-night-2025/).
- [2026 Goethe programme](https://www.goethe.de/ins/hon/en/bib/el6.html); existing imported text is in migration 0035.
- [Martina Hefter's publisher](https://www.penguin.co.uk/books/471737/hey-good-morning-how-are-you-by-hefter-martina/9780241772683) and [Ceilings publisher](https://twistedspoon.com/ceilings.html).

Book-specific publisher and biography sources are stored alongside each record in `data/backfill.json`. Cover-source URLs and hashes are in `data/covers.json`.
