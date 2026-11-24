#!/usr/bin/env bash
set -euo pipefail
files=(src/lib/indoor/publicationChanges.ts src/lib/indoor/floorplans/review.ts src/lib/indoor/scene.ts src/lib/indoor/floorplans/extraction.ts src/lib/indoor/floorplans/server.ts src/lib/indoor/station.svelte.ts src/lib/api/locationInterior.remote.ts src/lib/bits/patterns/forms/localLocationAddress/LocationInteriorEditor.svelte 'src/routes/admin/locations/[id]/+page.svelte' 'src/routes/api/locations/[id]/interior/jobs/+server.ts' 'src/routes/api/locations/[id]/interior/jobs/[job]/+server.ts' 'src/routes/api/locations/[id]/interior/jobs/[job]/[page]/+server.ts' src/tests/floorplan-extraction.test.ts scripts/floorplans/extraction.schema.json)
bun x biome check --write "${files[@]}"
bun -e 'import { compile } from "svelte/compiler"; const path="src/lib/bits/patterns/forms/localLocationAddress/LocationInteriorEditor.svelte"; const result=compile(await Bun.file(path).text(), {filename:path,generate:"client"}); console.log(result.warnings.map(w=>w.code+": "+w.message).join("\n"));'
tar -cf "$DEV_RUNNER_ARTIFACTS/floorplan-formatted.tar" "${files[@]}"
