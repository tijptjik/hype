# GBP extraction experiment

`extract.py SOURCE OUTPUT_DIRECTORY` renders original PDF sheets or an image and asks
local Codex for bounded JSON geometry. Run through `dev-check` on managed hosts. It
retains source hashes, render dimensions, the exact prompt hash and Codex logs. Output
is private experiment data, not a published map.

For the development upload UI, configure a private `FLOORPLAN_TOKEN` in the worker
environment, then start `server.py` under a managed long-lived service. HYPE's server
bindings must contain the same `FLOORPLAN_WORKER_TOKEN` and a reachable
`FLOORPLAN_WORKER_URL` (normally `http://127.0.0.1:8791` locally). Do not put tokens in
browser configuration or source control. The service is separate from Vite; production
uses the equivalent private Si adapter described in Dotjik.

The worker uses the existing Codex login. No OpenRouter substitution or API key is
needed. PDF rendering uses Poppler; raster decoding uses Pillow. Source files are
limited to PDF, PNG and JPEG; output geometry uses full source-page pixels. Each diagram
on a multi-plan sheet remains a separate floor/template. Templates must not be silently
expanded into assumed floors.

The Interior editor displays the original page and extraction overlay, permits label
corrections, vertex adjustment and removal of erroneous units, then saves an unpublished
standard `MapBundle`. It reuses the app's indoor scene for viewing. Manual floor copies
and per-floor pixel transforms support explicit floor assignment and alignment previews.
Geographic registration, anchor-based alignment, door extraction and canonical
building-part association require further review tooling. Do not publish a draft until
those checks are complete.

ImageGen may make a useful tracing illustration but can redraw walls and labels; its
output must never replace the original evidence for geometry extraction.

Service-room extraction recognizes KIT/KITCHEN, WC/W.C. and LAV/LAVATORY as separate
kitchen, toilet and lavatory compartments. It traces their walls, not the text bounds,
and performs a second pass over the small service strips. Uncovered floor area is shown
in amber and saved as an explicit unknown residual polygon (with holes where known
compartments already exist). Residuals may be walls, columns or omitted rooms; they
never imply a corridor or navigable area. True light wells and open courts remain voids.
Coverage does not imply semantic completeness or surveyed precision.
