# Building interior workflow

1. Select up to 12 PDF page numbers (for example `1,3,5`), or leave the selection empty
   for a document of at most 12 pages. Upload an original PDF or image on the building's
   Interior tab in Edit mode. The server retains the original, author and source hash.
   Completed page images and extraction results are copied to private object storage.
2. The latest job is recovered after navigation. Failed jobs can retry the retained
   source. On worker restart, interrupted jobs become failed rather than remaining
   permanently queued. Uploading a new source starts a new job.
3. Review room labels and categories against the original. Add missing outlines, move
   vertices, split along a horizontal/vertical coordinate, or merge adjacent simple
   spaces. Coverage warnings identify gaps, overlaps and outside geometry. Unknown
   residuals remain non-corridor space. A coverage percentage is not proof that labels
   or boundaries are correct.
4. Assign a template to explicitly named floors. Copies retain source-floor provenance.
   Set per-floor offset, scale and rotation, then use Preview floors to compare in the
   shared viewer. These are image-pixel transforms, not geographic registration. Floor
   labels and copy order require review.
5. Associate the diagram with a canonical Floor and each relevant polygon with a
   canonical Unit. Explicit Create actions use the existing building-part authoring
   service; Units must belong to their selected Floor. Copies clear associations and
   splitting clears the new polygon identity. Creation is immediate; saving retains
   geometry associations. Publication updates public Unit joins atomically.
6. Acknowledge review and save an unpublished draft. Reopening restores both the source
   overlay and edits. Concurrent writers are fenced by the draft version.
7. Use Map review and publication for the existing exact-hash publication/history
   workflow. Do not publish until unresolved geometry, floor assignment and alignment
   have been reviewed. No navigation connectivity is inferred.

The finite `dev-check bash scripts/floorplans/integration.sh` harness runs a private
worker fixture only during its Chrome test. Inference is deterministic synthetic output;
HTTP authorization, app storage and save/reopen use the real paths. The fixture building
is clearly named and local-only. Never install fixture_server.py on Si or point a
deployed application at it.

The production worker files are mirrored in Dotjik. Si's authenticated endpoint and
service are active; see Dotjik `docs/si-codex-floorplans.md` for deployment and
credential ownership. HYPE production bindings are installed. App release and end-to-end
acceptance must be verified separately from worker health.

Page selection, boundary/hole editing and two-anchor alignment are available in the
editor. Canonical building-part reconciliation across fresh extractions remains manual.
The real Si upload round trip passed on 2026-11-24: an original GBP page submitted
through local authenticated HYPE returned two floors and 65 map polygons, survived a
temporary local database failure, and saved/reopened as an unpublished draft. Geometry
warnings remain visible for human correction. Existing polygon IDs survive manual edits;
fresh model output must not be assumed to preserve physical identity.

Browser evidence: `job-15LHXgCXP9` covers editing, canonical associations and
publication; `job-EFIVSGQiJc` covers temporary 503 recovery; `job-njhIGlaTvy` covers the
completed real Si job and draft persistence. These use local HYPE with the production Si
endpoint; they do not constitute a signed-in production browser acceptance run.

Production HYPE was activated on 2026-11-24 as Worker version
`56a2d168-500d-4b9c-97fe-db6a1376dfee` at 100% traffic. It uses an isolated release
based on the existing production revision, preserving all bindings and routes. No
migrations or unrelated workers were deployed.
