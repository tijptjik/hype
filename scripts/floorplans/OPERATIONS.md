# Building interior workflow

1. Upload an original PDF or image on the building's Interior tab in Edit mode. The
   server retains the original, author and source hash. Completed page images and
   extraction results are copied to private object storage.
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
5. Acknowledge review and save an unpublished draft. Reopening restores both the source
   overlay and edits. Concurrent writers are fenced by the draft version.
6. Use Map review and publication for the existing exact-hash publication/history
   workflow. Do not publish until unresolved geometry, floor assignment and alignment
   have been reviewed. No navigation connectivity is inferred.

The finite `dev-check bash scripts/floorplans/integration.sh` harness runs a private
worker fixture only during its Chrome test. Inference is deterministic synthetic output;
HTTP authorization, app storage and save/reopen use the real paths. The fixture building
is clearly named and local-only. Never install fixture_server.py on Si or point a
deployed application at it.

The four production worker files are mirrored in Dotjik. Si needs its private endpoint,
credentials, proxy access and service activation configured before HYPE can use it.
Source-file policy alone does not deploy or verify that connection.

Remaining operational stages: source page selection, boundary/hole editing, anchor-based
alignment, canonical building-part reconciliation across fresh extractions, and a
verified Si upload round trip. Existing polygon IDs survive manual edits; fresh model
output must not be assumed to preserve physical identity.
